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
