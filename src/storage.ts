import { decodePixels } from './drawing';
import { calibrationFrom, type Calibration } from './motion';
export type Artwork = { id: string; title: string; created: string; pixels: string };
export type Snapshot = { version: 1; sensitivity: number; calibration?: Calibration; draft: string; artworks: Artwork[] };
export interface StoragePort { getLocalStorage(key: string): Promise<string>; setLocalStorage(key: string,value: string): Promise<boolean> }
export const STORAGE_KEY = 'headstroke.v1';
export const browserStorage: StoragePort = {
  async getLocalStorage(key) { return localStorage.getItem('preview.' + key) ?? ''; },
  async setLocalStorage(key, value) { localStorage.setItem('preview.' + key, value); return true; }
};
export function parseSnapshot(raw: string): Snapshot | undefined {
  if (!raw) return;
  const s = JSON.parse(raw) as Snapshot;
  if (s.version !== 1 || !Number.isFinite(s.sensitivity) || s.sensitivity < .25 || s.sensitivity > 3 ||
    !Array.isArray(s.artworks) || s.artworks.length > 50) throw new Error('Saved sketchbook is invalid');
  decodePixels(s.draft);
  const ids = new Set<string>();
  for (const a of s.artworks) {
    if (typeof a.id !== 'string' || ids.has(a.id) || typeof a.title !== 'string' || a.title.length > 80 ||
      typeof a.created !== 'string' || !Number.isFinite(Date.parse(a.created))) throw new Error('Saved drawing is invalid');
    ids.add(a.id); decodePixels(a.pixels);
  }
  if (s.calibration) {
    for (const v of [s.calibration.right, s.calibration.up])
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw new Error('Invalid calibration');
    calibrationFrom([0,0,0], s.calibration.right, s.calibration.up);
  }
  return s;
}
/** Serialize snapshots to avoid a slow older write overwriting a newer save. */
export class Repository {
  private tail = Promise.resolve();
  constructor(private port: StoragePort) {}
  async load() { return parseSnapshot(await this.port.getLocalStorage(STORAGE_KEY)); }
  save(snapshot: Snapshot) {
    const value = JSON.stringify(snapshot);
    const write = this.tail.catch(() => {}).then(async () => {
      if (!await this.port.setLocalStorage(STORAGE_KEY, value)) throw new Error('Storage refused the save. Free space and retry.');
    });
    this.tail = write;
    return write;
  }
}
