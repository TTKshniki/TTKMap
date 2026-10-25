import type { MapDocument, Point, Shape } from "../../../../CONTRACTS/types";
import { segmentsIntersect, distanceToSegment } from "../../shared/geometry";

/** Half-width of a doorway in plan units; a route may cross a wall only inside this band. */
export const DOOR_CLEARANCE_UNITS = 14;

export interface Opening {
  a: Point;
  b: Point;
}

export function parseDoorDescription(desc?: string | null) {
  if (!desc) return null;
  const match = desc.match(/\[(\d+),(\d+)\s*->\s*(\d+),(\d+)(?:\s*\|\s*dir:(\d+))?\]/);
  if (!match) return null;
  return {
    geom: {
      x1: Number(match[1]),
      y1: Number(match[2]),
      x2: Number(match[3]),
      y2: Number(match[4]),
    },
    dir: match[5] ? Number(match[5]) : 0,
    rawMatch: match[0],
  };
}

export function isDoorway(poi: { category?: string; category_label?: string | null; title: string }): boolean {
  return (
    poi.category === "entrance" ||
    poi.category_label === "Дверь" ||
    poi.title.includes("Дверь") ||
    poi.title.includes("Проход")
  );
}

/** Door and main-entrance segments that are allowed to interrupt a wall. */
export function doorOpenings(doc: MapDocument): Opening[] {
  const openings: Opening[] = [];
  for (const poi of doc.pois) {
    if (!isDoorway(poi)) continue;
    const parsed = parseDoorDescription(poi.description);
    const geom = parsed?.geom ?? { x1: poi.x - 20, y1: poi.y, x2: poi.x + 20, y2: poi.y };
    openings.push({ a: { x: geom.x1, y: geom.y1 }, b: { x: geom.x2, y: geom.y2 } });
  }
  return openings;
}

export function wallSegments(doc: MapDocument): Array<{ a: Point; b: Point; shape: Shape }> {
  const segments: Array<{ a: Point; b: Point; shape: Shape }> = [];
  for (const shape of doc.shapes) {
    if (shape.kind !== "wall") continue;
    for (let i = 0; i < shape.points.length - 1; i++) {
      segments.push({ a: shape.points[i], b: shape.points[i + 1], shape });
    }
  }
  return segments;
}

/** A crossing counts as a doorway when it happens close to any opening segment. */
export function crossingIsDoorway(point: Point, openings: Opening[]): boolean {
  return openings.some(({ a, b }) => distanceToSegment(point, a, b) <= DOOR_CLEARANCE_UNITS);
}

function wallHits(start: Point, end: Point, walls: ReturnType<typeof wallSegments>, openings: Opening[]) {
  const hits: Point[] = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const routeLenSq = dx * dx + dy * dy || 1;
  for (const wall of walls) {
    if (!segmentsIntersect(start, end, wall.a, wall.b)) continue;
    // Exact crossing point: parameter along the route where it meets the wall line.
    const wx = wall.b.x - wall.a.x;
    const wy = wall.b.y - wall.a.y;
    const denominator = dx * wy - dy * wx;
    const t = Math.abs(denominator) < 1e-9
      ? 0.5
      : ((wall.a.x - start.x) * wy - (wall.a.y - start.y) * wx) / denominator;
    // A node placed inside a doorway sits ON the wall; that touch is not a wall crossing.
    const alongRoute = ((start.x + dx * t - start.x) * dx + (start.y + dy * t - start.y) * dy) / routeLenSq;
    if (alongRoute <= 0.02 || alongRoute >= 0.98) continue;
    hits.push({ x: start.x + dx * t, y: start.y + dy * t });
  }
  return hits.filter((hit) => !crossingIsDoorway(hit, openings));
}

/** Walls crossed by the direct line between two nodes, ignoring doorway openings. */
export function blockingWalls(doc: MapDocument, start: Point, end: Point): Point[] {
  return wallHits(start, end, wallSegments(doc), doorOpenings(doc));
}

export function edgeIsBlocked(doc: MapDocument, start: Point, end: Point): boolean {
  return blockingWalls(doc, start, end).length > 0;
}

/**
 * Suggested detour around blocks: the midpoint offsets to both sides of the wall normal,
 * nearest first. The editor offers these as a hint instead of silently drawing through walls.
 */
export function detourHint(start: Point, end: Point, hit: Point): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = DOOR_CLEARANCE_UNITS * 1.6;
  return [
    { x: hit.x + nx * offset, y: hit.y + ny * offset },
    { x: hit.x - nx * offset, y: hit.y - ny * offset },
  ];
}
