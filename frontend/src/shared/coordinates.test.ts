import { describe, expect, it } from 'vitest';
import { bearingFromPlan, normalizeYaw, svgPointFromClient, yawToTarget } from './coordinates';

describe('plan and panorama coordinate conventions', () => {
  it('maps client positions into plan units and clamps to the map', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 } as DOMRect;
    expect(svgPointFromClient(110, 70, rect, 1000, 500)).toEqual({ x: 500, y: 250 });
    expect(svgPointFromClient(-20, 400, rect, 1000, 500)).toEqual({ x: 0, y: 500 });
  });

  it('uses plan up as zero bearing and wraps yaw into [-180, 180)', () => {
    expect(bearingFromPlan(0, -1)).toBe(0);
    expect(bearingFromPlan(1, 0)).toBe(90);
    expect(bearingFromPlan(0, 1)).toBe(-180);
    expect(normalizeYaw(181)).toBe(-179);
    expect(yawToTarget(1, 0, 30)).toBe(60);
  });
});
