import { WIDTH, HEIGHT, clamp, type Point } from './drawing';
export type Vector = [number, number, number];
export type Calibration = { right: Vector; up: Vector };
const dot = (a: Vector, b: Vector) => a.reduce((sum, x, i) => sum + x * b[i], 0);
export const subtract = (a: Vector, b: Vector): Vector => a.map((x, i) => x - b[i]) as Vector;
export function sampleVector(data: {x?: number; y?: number; z?: number}): Vector | undefined {
  // Protobuf omits zero-valued fields. An empty sample still represents zero.
  const vector: Vector = [data.x ?? 0, data.y ?? 0, data.z ?? 0];
  return vector.every(Number.isFinite) ? vector : undefined;
}
export function calibrationFrom(center: Vector, right: Vector, up: Vector): Calibration {
  const result = {right: subtract(right, center), up: subtract(up, center)};
  const rr = dot(result.right, result.right), uu = dot(result.up, result.up), ru = dot(result.right, result.up);
  if (rr < 1e-8 || uu < 1e-8 || 1 - ru * ru / (rr * uu) < .08)
    throw new Error('Movements were too small or too similar. Retry; tilt right if turning is not detected.');
  return result;
}
/** Learns a local two-dimensional basis; deliberately does not invent yaw units. */
export class Motion {
  center?: Vector;
  calibration?: Calibration;
  sensitivity = 1;
  private filtered?: Point;
  recenter(sample?: Vector) { this.center = sample; this.filtered = undefined; }
  project(sample: Vector): Point | undefined {
    if (!this.calibration) return;
    if (!this.center) this.center = sample;
    const d = subtract(sample, this.center), r = this.calibration.right, u = this.calibration.up;
    const rr = dot(r,r), uu = dot(u,u), ru = dot(r,u), determinant = rr * uu - ru * ru;
    const horizontal = (dot(d,r) * uu - dot(d,u) * ru) / determinant;
    const vertical = (dot(d,u) * rr - dot(d,r) * ru) / determinant;
    const target = {x: clamp(WIDTH / 2 + horizontal * WIDTH * .42 * this.sensitivity, 0, WIDTH - 1),
      y: clamp(HEIGHT / 2 - vertical * HEIGHT * .42 * this.sensitivity, 0, HEIGHT - 1)};
    this.filtered = this.filtered ? {x: this.filtered.x + .65 * (target.x - this.filtered.x),
      y: this.filtered.y + .65 * (target.y - this.filtered.y)} : target;
    return this.filtered;
  }
}
