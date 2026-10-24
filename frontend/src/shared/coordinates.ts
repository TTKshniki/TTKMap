import type { Point } from '../../../CONTRACTS/types';

export function svgPointFromClient(clientX: number, clientY: number, rect: DOMRect, width: number, height: number): Point {
  return {
    x: Math.min(width, Math.max(0, ((clientX - rect.left) / rect.width) * width)),
    y: Math.min(height, Math.max(0, ((clientY - rect.top) / rect.height) * height)),
  };
}

export function normalizeYaw(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === 180 ? -180 : wrapped;
}

export function bearingFromPlan(dx: number, dy: number): number {
  return normalizeYaw((Math.atan2(dx, -dy) * 180) / Math.PI);
}

export function yawToTarget(dx: number, dy: number, headingOffsetDeg: number): number {
  return normalizeYaw(bearingFromPlan(dx, dy) - headingOffsetDeg);
}

export type CardinalDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export function cardinalDirection(bearing: number): CardinalDir {
  const n = normalizeYaw(bearing);
  if (n >= -22.5 && n < 22.5) return 'N';
  if (n >= 22.5 && n < 67.5) return 'NE';
  if (n >= 67.5 && n < 112.5) return 'E';
  if (n >= 112.5 && n < 157.5) return 'SE';
  if (n >= 157.5 || n < -157.5) return 'S';
  if (n >= -157.5 && n < -112.5) return 'SW';
  if (n >= -112.5 && n < -67.5) return 'W';
  return 'NW';
}

export function angleDelta(from: number, to: number): number {
  return normalizeYaw(to - from);
}
