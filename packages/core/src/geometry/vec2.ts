/**
 * 2D vector primitives. Plain objects, pure functions — no classes, no z axis
 * (the legacy vendored poly-split lib carried a z coordinate whose math was
 * broken; the app only ever uses 2D).
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function len2(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function len(a: Vec2): number {
  return Math.sqrt(len2(a));
}

export function dist2(a: Vec2, b: Vec2): number {
  return len2(sub(a, b));
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt(dist2(a, b));
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Linear interpolation from a to b; t=0 → a, t=1 → b. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Component-wise equality within eps (default exact). */
export function eq(a: Vec2, b: Vec2, eps = 0): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}
