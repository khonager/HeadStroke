import {
  CreateStartUpPageContainer, TextContainerProperty, ImageContainerProperty,
  ImageRawDataUpdate, TextContainerUpgrade, ImuReportPace, OsEventTypeList,
  type EvenAppBridge, type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import { WIDTH, HEIGHT, paint, pngBytes, type Point } from './drawing';
import type { StoragePort } from './storage';

export type Frame = { text: string; pixels: ArrayLike<number>; cursor?: Point };
export interface GlassesPort extends StoragePort {
  start(handler: (event: EvenHubEvent) => void): Promise<void>;
  render(frame: Frame): void;
  imu(enabled: boolean): Promise<void>;
  exit(): Promise<void>;
  stop(): void;
}
/** One image in flight, one replacement slot: no queue of stale cursor positions. */
export class LatestSender<T> {
  private pending?: T;
  private running = false;
  private closed = false;
  constructor(private send: (value: T) => Promise<void>, private error: (error: unknown) => void) {}
  push(value: T) { if (this.closed) return; this.pending = value; void this.flush(); }
  close() { this.closed = true; this.pending = undefined; }
  private async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed && this.pending !== undefined) {
        const value = this.pending; this.pending = undefined;
        try { await this.send(value); } catch (error) { this.error(error); }
      }
    } finally { this.running = false; }
  }
}
export class Glasses implements GlassesPort {
  private unsubscribe?: () => void;
  private canvas = document.createElement('canvas');
  private lastText = '';
  private sender: LatestSender<Frame>;
  constructor(private bridge: EvenAppBridge, onError: (error: unknown) => void) {
    this.sender = new LatestSender(async frame => {
      if (frame.text !== this.lastText) {
        const ok = await bridge.textContainerUpgrade(new TextContainerUpgrade({
          containerID: 2, containerName: 'status', content: frame.text,
        }));
        if (!ok) throw new Error('Glasses text update failed');
        this.lastText = frame.text;
      }
      paint(this.canvas, frame.pixels, frame.cursor, false);
      const result = await bridge.updateImageRawData(new ImageRawDataUpdate({
        containerID: 3, containerName: 'drawing', imageData: await pngBytes(this.canvas),
      }));
      if (result !== 'success') throw new Error(`Glasses image update failed (${result}). Reopen HeadStroke to reconnect.`);
    }, onError);
  }
  async start(handler: (event: EvenHubEvent) => void) {
    this.unsubscribe = this.bridge.onEvenHubEvent(handler);
    const result = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
      containerTotalNum: 4,
      textObject: [
        new TextContainerProperty({containerID: 1, containerName: 'events', xPosition: 0, yPosition: 0,
          width: 576, height: 288, content: ' ', isEventCapture: 1, zOrderIndex: 0}),
        new TextContainerProperty({containerID: 2, containerName: 'status', xPosition: 16, yPosition: 152,
          width: 544, height: 136, content: 'Loading sketchbook...', isEventCapture: 0, zOrderIndex: 1}),
        new TextContainerProperty({containerID: 4, containerName: 'title', xPosition: 16, yPosition: 0,
          width: 544, height: 36, content: ' ', isEventCapture: 0, zOrderIndex: 2}),
      ],
      imageObject: [new ImageContainerProperty({containerID: 3, containerName: 'drawing',
        xPosition: (576 - WIDTH) / 2, yPosition: 42, width: WIDTH, height: HEIGHT, zOrderIndex: 3})],
    }));
    if (result !== 0) { this.unsubscribe(); throw new Error(`Glasses page could not start (${result}). Close and reopen HeadStroke.`); }
  }
  render(frame: Frame) { this.sender.push({...frame, pixels: Float32Array.from(frame.pixels), cursor: frame.cursor && {...frame.cursor}}); }
  async imu(enabled: boolean) {
    if (!await this.bridge.imuControl(enabled, ImuReportPace.P100)) throw new Error('Head tracking is unavailable. Update the Even app and G2 firmware, then reopen.');
  }
  async exit() { if (!await this.bridge.shutDownPageContainer(1)) throw new Error('Exit dialog could not open. Please retry.'); }
  stop() { this.sender.close(); this.unsubscribe?.(); void this.bridge.imuControl(false).catch(() => {}); }
  getLocalStorage(key: string) { return this.bridge.getLocalStorage(key); }
  setLocalStorage(key: string, value: string) { return this.bridge.setLocalStorage(key,value); }
}
export function inputType(event: EvenHubEvent): OsEventTypeList | undefined {
  // Do not interpret IMU, launch, audio or empty top-level payloads as a tap.
  if (event.sysEvent?.imuData || event.sysEvent?.eventType === OsEventTypeList.IMU_DATA_REPORT) return;
  const envelopes = [event.sysEvent, event.textEvent, event.listEvent].filter(e => e !== undefined);
  const double = envelopes.find(e => e.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT);
  if (double) return double.eventType;
  return envelopes.length ? envelopes[0]!.eventType ?? OsEventTypeList.CLICK_EVENT : undefined;
}
