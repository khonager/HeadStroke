export const WIDTH = 200;
export const HEIGHT = 100;
export type Point = { x: number; y: number };
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Exposure accumulates by elapsed time, not by number of samples or path length. */
export class Drawing {
  pixels = new Float32Array(WIDTH * HEIGHT);
  cursor: Point = { x: WIDTH / 2, y: HEIGHT / 2 };
  paused = true;
  revision = 0;
  private previous?: { point: Point; time: number };

  setPaused(paused: boolean) { this.paused = paused; this.breakStroke(); }
  breakStroke() { this.previous = undefined; }
  move(point: Point, time: number) {
    if (![point.x, point.y, time].every(Number.isFinite)) return;
    const p = { x: clamp(point.x, 0, WIDTH - 1), y: clamp(point.y, 0, HEIGHT - 1) };
    this.cursor = p;
    const previous = this.previous;
    this.previous = { point: p, time };
    if (this.paused || !previous) return;
    const elapsed = time - previous.time;
    // Never join across dropped streams, suspension or out-of-order samples.
    if (elapsed <= 0 || elapsed > 600) return;
    const distance = Math.hypot(p.x - previous.point.x, p.y - previous.point.y);
    const steps = Math.max(1, Math.ceil(distance * 2));
    const dose = 240 * (elapsed / 1000) / steps;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      this.dab(previous.point.x + (p.x - previous.point.x) * t,
        previous.point.y + (p.y - previous.point.y) * t, dose);
    }
    this.revision++;
  }
  private dab(x: number, y: number, dose: number) {
    const radius = 1.8;
    for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(HEIGHT - 1, Math.ceil(y + radius)); py++) {
      for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(WIDTH - 1, Math.ceil(x + radius)); px++) {
        const weight = Math.max(0, 1 - Math.hypot(px - x, py - y) / radius);
        const index = py * WIDTH + px;
        this.pixels[index] = Math.min(255, this.pixels[index] + dose * weight);
      }
    }
  }
  clear() { this.pixels.fill(0); this.revision++; this.setPaused(true); }
  get hasMarks() { return this.pixels.some(v => v > 0); }
  encode() { return encodePixels(this.pixels); }
  load(data: string) { this.pixels.set(decodePixels(data)); this.revision++; this.setPaused(true); }
}

export function encodePixels(pixels: ArrayLike<number>): string {
  let binary = '';
  for (let i = 0; i < WIDTH * HEIGHT; i++) binary += String.fromCharCode(Math.round(pixels[i]));
  return btoa(binary);
}
export function decodePixels(data: string): Uint8Array {
  if (typeof data !== 'string' || data.length > 27000) throw new Error('Invalid drawing data');
  const binary = atob(data);
  if (binary.length !== WIDTH * HEIGHT) throw new Error('Wrong drawing dimensions');
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export function paint(canvas: HTMLCanvasElement, pixels: ArrayLike<number>, cursor?: Point, green = true) {
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(WIDTH, HEIGHT);
  for (let i = 0; i < pixels.length; i++) {
    const value = Math.round(pixels[i] / 17) * 17; // Actual G2: 16 brightness levels.
    image.data[i * 4] = green ? Math.round(value * .65) : value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = green ? Math.round(value * .37) : value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  if (cursor) {
    const x = Math.round(cursor.x), y = Math.round(cursor.y);
    ctx.fillStyle = green ? '#a3d473' : '#ffffff';
    ctx.fillRect(x - 3, y, 7, 1); ctx.fillRect(x, y - 3, 1, 7);
  }
}
export async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    b => b ? resolve(b) : reject(new Error('Could not encode drawing')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
