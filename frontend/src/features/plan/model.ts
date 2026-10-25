import type { MapDocument, Point, Shape } from "../../../../CONTRACTS/types";
import { doorOpenings, edgeIsBlocked, isDoorway } from "./routing";
export type Selection = {
  kind: "shapes" | "pois" | "nodes" | "edges" | "panoramas";
  id: string;
} | null;

export function removeSelection(
  doc: MapDocument,
  selection: NonNullable<Selection>,
): MapDocument {
  const { kind, id } = selection;
  const next = { ...doc, [kind]: doc[kind].filter((item) => item.id !== id) };
  if (kind === "nodes") {
    next.edges = doc.edges.filter((edge) => edge.a !== id && edge.b !== id);
    next.pois = doc.pois.map((poi) =>
      poi.nav_node_id === id ? { ...poi, nav_node_id: null } : poi,
    );
    next.panoramas = doc.panoramas.map((pano) =>
      pano.nav_node_id === id ? { ...pano, nav_node_id: null } : pano,
    );
  }
  if (kind === "pois")
    next.hotspots = doc.hotspots.filter((h) => h.poi_id !== id);
  if (kind === "panoramas")
    next.hotspots = doc.hotspots.filter(
      (h) => h.panorama_id !== id && h.target_panorama_id !== id,
    );
  return next;
}

export function connectNodes(
  doc: MapDocument,
  first: string,
  second: string,
  options?: { allowCrossingWalls?: boolean },
): MapDocument {
  if (!first || !second || first === second)
    throw new Error("Выберите два разных узла");
  const [a, b] = [first, second].sort();
  if (doc.edges.some((edge) => edge.a === a && edge.b === b))
    throw new Error("Эти узлы уже соединены");
  const source = doc.nodes.find((n) => n.id === a),
    target = doc.nodes.find((n) => n.id === b);
  if (!source || !target || (source.x === target.x && source.y === target.y))
    throw new Error("Узлы должны существовать и иметь разные координаты");
  if (!options?.allowCrossingWalls && edgeIsBlocked(doc, source, target))
    throw new Error(
      "Ребро пересекает стену. Поставьте дверь в проёме или проведите маршрут вокруг стены.",
    );
  return { ...doc, edges: [...doc.edges, { id: crypto.randomUUID(), a, b }] };
}

/**
 * Builds a usable walking graph from the drawn plan: one node per doorway plus one per POI
 * that has no door, then connects every pair whose straight line does not cross a wall
 * outside a doorway. Replaces the previous graph so the result is deterministic.
 */
export function buildGraphFromDoors(doc: MapDocument): MapDocument {
  const openings = doorOpenings(doc);
  const nodes: MapDocument["nodes"] = [];
  const edges: MapDocument["edges"] = [];
  const seen: Array<{ id: string; x: number; y: number }> = [];

  const addNode = (point: { x: number; y: number }) => {
    const duplicate = seen.find((n) => Math.hypot(n.x - point.x, n.y - point.y) < 12);
    if (duplicate) return duplicate.id;
    const id = crypto.randomUUID();
    const node = { id, x: Math.round(point.x), y: Math.round(point.y) };
    nodes.push(node);
    seen.push(node);
    return id;
  };

  for (const opening of openings) {
    addNode({ x: (opening.a.x + opening.b.x) / 2, y: (opening.a.y + opening.b.y) / 2 });
  }
  for (const poi of doc.pois) {
    if (isDoorway(poi)) continue;
    addNode({ x: poi.x, y: poi.y });
  }
  for (const node of nodes) {
    for (const other of nodes) {
      if (node.id >= other.id) continue;
      if (edgeIsBlocked(doc, node, other)) continue;
      edges.push({ id: crypto.randomUUID(), a: node.id, b: other.id });
    }
  }
  if (nodes.length > 1 && edges.length === 0) {
    throw new Error("Между узлами нет свободного прохода — добавьте двери в стены");
  }
  return { ...doc, nodes, edges };
}

export function moveSelection(
  doc: MapDocument,
  selection: NonNullable<Selection>,
  delta: Point,
  width: number,
  height: number,
): MapDocument {
  if (selection.kind === "edges") {
    const edge = doc.edges.find((e) => e.id === selection.id);
    if (!edge) return doc;
    return {
      ...doc,
      nodes: doc.nodes.map((node) =>
        node.id === edge.a || node.id === edge.b
          ? {
              ...node,
              x: Math.max(0, Math.min(width, node.x + delta.x)),
              y: Math.max(0, Math.min(height, node.y + delta.y)),
            }
          : node,
      ),
    };
  }
  const items = doc[selection.kind];
  const item = items.find((entry) => entry.id === selection.id);
  if (!item) return doc;
  const points = "points" in item ? item.points : [item];
  const dx = Math.max(
    -Math.min(...points.map((p) => p.x)),
    Math.min(delta.x, width - Math.max(...points.map((p) => p.x))),
  );
  const dy = Math.max(
    -Math.min(...points.map((p) => p.y)),
    Math.min(delta.y, height - Math.max(...points.map((p) => p.y))),
  );
  let moved =
    "points" in item
      ? {
          ...item,
          points: item.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        }
      : { ...item, x: item.x + dx, y: item.y + dy };

  if (selection.kind === "pois" && "description" in item && item.description) {
    const doorMatch = item.description.match(
      /\[(\d+),(\d+)\s*->\s*(\d+),(\d+)(?:\s*\|\s*dir:(\d+))?\]/,
    );
    if (doorMatch) {
      const x1 = Math.max(0, Math.min(width, Number(doorMatch[1]) + dx));
      const y1 = Math.max(0, Math.min(height, Number(doorMatch[2]) + dy));
      const x2 = Math.max(0, Math.min(width, Number(doorMatch[3]) + dx));
      const y2 = Math.max(0, Math.min(height, Number(doorMatch[4]) + dy));
      const dirPart = doorMatch[5] !== undefined ? ` | dir:${doorMatch[5]}` : "";
      const updatedTag = `[${x1},${y1} -> ${x2},${y2}${dirPart}]`;
      const nextDesc = item.description.replace(doorMatch[0], updatedTag);
      moved = { ...moved, description: nextDesc };
    }
  }

  const nextDoc = {
    ...doc,
    [selection.kind]: items.map((entry) =>
      entry.id === item.id ? moved : entry,
    ),
  };
  if (selection.kind === "pois" && "nav_node_id" in item && item.nav_node_id) {
    nextDoc.nodes = nextDoc.nodes.map((node) =>
      node.id === item.nav_node_id
        ? { ...node, x: node.x + dx, y: node.y + dy }
        : node,
    );
  }
  return nextDoc;
}

export function makeShape(kind: Shape["kind"], points: Point[]): Shape {
  if (points.length < (kind === "wall" ? 2 : 3))
    throw new Error("Недостаточно вершин");
  return { id: crypto.randomUUID(), kind, label: "", points };
}
