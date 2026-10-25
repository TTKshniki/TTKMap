import type { MapDocument, Point, Shape } from "../../../../CONTRACTS/types";
import {
  boundingBox,
  distanceToSegment,
  pointInPolygon,
  polygonCentroid,
} from "../../shared/geometry";
import { doorOpenings, edgeIsBlocked, isDoorway, parseDoorDescription } from "./routing";

export type SelectionItem = {
  kind: "shapes" | "pois" | "nodes" | "edges" | "panoramas";
  id: string;
};

export type Selection = SelectionItem | null;

export function removeMultiSelection(
  doc: MapDocument,
  items: SelectionItem[],
): MapDocument {
  if (!items || items.length === 0) return doc;
  const shapeIds = new Set(items.filter((i) => i.kind === "shapes").map((i) => i.id));
  const poiIds = new Set(items.filter((i) => i.kind === "pois").map((i) => i.id));
  const nodeIds = new Set(items.filter((i) => i.kind === "nodes").map((i) => i.id));
  const edgeIds = new Set(items.filter((i) => i.kind === "edges").map((i) => i.id));
  const panoIds = new Set(items.filter((i) => i.kind === "panoramas").map((i) => i.id));

  const nextNodes = doc.nodes.filter((n) => !nodeIds.has(n.id));
  const nextEdges = doc.edges.filter(
    (e) => !edgeIds.has(e.id) && !nodeIds.has(e.a) && !nodeIds.has(e.b),
  );
  const nextShapes = doc.shapes.filter((s) => !shapeIds.has(s.id));
  const nextPois = doc.pois
    .filter((p) => !poiIds.has(p.id))
    .map((p) => (p.nav_node_id && nodeIds.has(p.nav_node_id) ? { ...p, nav_node_id: null } : p));
  const nextPanos = doc.panoramas
    .filter((p) => !panoIds.has(p.id))
    .map((p) => (p.nav_node_id && nodeIds.has(p.nav_node_id) ? { ...p, nav_node_id: null } : p));
  const nextHotspots = doc.hotspots.filter(
    (h) =>
      (!h.poi_id || !poiIds.has(h.poi_id)) &&
      (!h.panorama_id || !panoIds.has(h.panorama_id)) &&
      (!h.target_panorama_id || !panoIds.has(h.target_panorama_id)),
  );

  return {
    ...doc,
    shapes: nextShapes,
    pois: nextPois,
    nodes: nextNodes,
    edges: nextEdges,
    panoramas: nextPanos,
    hotspots: nextHotspots,
  };
}

export function removeSelection(
  doc: MapDocument,
  selection: NonNullable<Selection>,
): MapDocument {
  return removeMultiSelection(doc, [selection]);
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
 * Builds a usable walking graph from the drawn plan:
 * When rooms and corridors are present, it creates a building transit graph:
 * - Each room receives a center node (and links to its interior POIs)
 * - Each door creates a doorway node connected to its room(s)
 * - Corridors generate longitudinal spine waypoints where doors enter
 * - Adjacent corridors connect across their shared boundary as one unified building
 * - Rooms connect to each other logically through their doors and the corridor network
 *
 * If no rooms or corridors are drawn (e.g. wall-only plan), it falls back to
 * a line-of-sight visibility graph between doorways and POIs.
 */
export function buildGraphFromDoors(doc: MapDocument): MapDocument {
  const rooms = doc.shapes.filter((s) => s.kind === "room" && s.points.length >= 3);
  const corridors = doc.shapes.filter((s) => s.kind === "corridor" && s.points.length >= 3);
  const openings = doorOpenings(doc);

  if (rooms.length === 0 && corridors.length === 0) {
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

  // --- BUILDING-AWARE GRAPH GENERATION ---
  const nodes: MapDocument["nodes"] = [];
  const edges: MapDocument["edges"] = [];
  const edgeSet = new Set<string>();

  const addEdge = (first: string, second: string) => {
    if (!first || !second || first === second) return;
    const [a, b] = [first, second].sort();
    const key = `${a}:${b}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ id: crypto.randomUUID(), a, b });
  };

  const addNode = (point: { x: number; y: number }) => {
    const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
    const existing = nodes.find((n) => Math.hypot(n.x - rounded.x, n.y - rounded.y) < 10);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    nodes.push({ id, ...rounded });
    return id;
  };

  // 1. Room center nodes
  const roomNodeMap = new Map<string, string>();
  let nextPois = [...doc.pois];

  for (const room of rooms) {
    const center = polygonCentroid(room.points) ?? {
      x: room.points.reduce((s, p) => s + p.x, 0) / room.points.length,
      y: room.points.reduce((s, p) => s + p.y, 0) / room.points.length,
    };
    const rNodeId = addNode(center);
    roomNodeMap.set(room.id, rNodeId);

    const existingPoiInRoom = nextPois.find(
      (p) => !isDoorway(p) && (p.nav_node_id === rNodeId || pointInPolygon(p, room.points)),
    );
    if (existingPoiInRoom) {
      if (!existingPoiInRoom.nav_node_id) {
        nextPois = nextPois.map((p) => (p.id === existingPoiInRoom.id ? { ...p, nav_node_id: rNodeId } : p));
      }
    } else {
      nextPois.push({
        id: crypto.randomUUID(),
        title: room.label || "Помещение",
        category: "hall",
        category_label: null,
        description: "",
        x: Math.round(center.x),
        y: Math.round(center.y),
        nav_node_id: rNodeId,
      });
    }
  }

  // 2. Doorway nodes and space associations
  interface DoorInfo {
    poiId: string;
    nodeId: string;
    pt: Point;
    normal: Point;
    roomIds: string[];
    corridorIds: string[];
  }
  const doorInfos: DoorInfo[] = [];

  for (const poi of nextPois) {
    if (!isDoorway(poi)) continue;
    const parsed = parseDoorDescription(poi.description);
    const geom = parsed?.geom ?? { x1: poi.x - 20, y1: poi.y, x2: poi.x + 20, y2: poi.y };
    const mid = { x: (geom.x1 + geom.x2) / 2, y: (geom.y1 + geom.y2) / 2 };
    const nodeId = addNode(mid);
    nextPois = nextPois.map((p) => (p.id === poi.id ? { ...p, nav_node_id: nodeId } : p));

    const dx = geom.x2 - geom.x1;
    const dy = geom.y2 - geom.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const testPoints = [
      mid,
      { x: mid.x + nx * 18, y: mid.y + ny * 18 },
      { x: mid.x - nx * 18, y: mid.y - ny * 18 },
      { x: mid.x + nx * 8, y: mid.y + ny * 8 },
      { x: mid.x - nx * 8, y: mid.y - ny * 8 },
    ];

    const connectedRooms: string[] = [];
    for (const room of rooms) {
      const touches =
        testPoints.some((tp) => pointInPolygon(tp, room.points)) ||
        room.points.some((p, i) => distanceToSegment(mid, p, room.points[(i + 1) % room.points.length]) <= 30);
      if (touches) connectedRooms.push(room.id);
    }

    const connectedCorridors: string[] = [];
    for (const corr of corridors) {
      const touches =
        testPoints.some((tp) => pointInPolygon(tp, corr.points)) ||
        corr.points.some((p, i) => distanceToSegment(mid, p, corr.points[(i + 1) % corr.points.length]) <= 30);
      if (touches) connectedCorridors.push(corr.id);
    }

    doorInfos.push({
      poiId: poi.id,
      nodeId,
      pt: mid,
      normal: { x: nx, y: ny },
      roomIds: connectedRooms,
      corridorIds: connectedCorridors,
    });

    for (const rId of connectedRooms) {
      const rNodeId = roomNodeMap.get(rId);
      if (rNodeId) addEdge(nodeId, rNodeId);
    }
  }

  // 3. Corridor Spine Waypoints
  const corridorSpineNodes = new Map<string, string[]>();

  for (const corr of corridors) {
    const bb = boundingBox(corr.points)!;
    const isHorizontal = bb.width >= bb.height;
    const midX = Math.round(bb.min.x + bb.width / 2);
    const midY = Math.round(bb.min.y + bb.height / 2);
    const spineNodes: Array<{ id: string; x: number; y: number; val: number }> = [];

    const doorsForCorr = doorInfos.filter((d) => d.corridorIds.includes(corr.id));
    for (const d of doorsForCorr) {
      const proj = isHorizontal
        ? { x: d.pt.x, y: midY }
        : { x: midX, y: d.pt.y };
      const projId = addNode(proj);
      addEdge(d.nodeId, projId);
      spineNodes.push({ id: projId, x: proj.x, y: proj.y, val: isHorizontal ? proj.x : proj.y });
    }

    if (spineNodes.length === 0) {
      const centerId = addNode({ x: midX, y: midY });
      spineNodes.push({ id: centerId, x: midX, y: midY, val: isHorizontal ? midX : midY });
    }

    corridorSpineNodes.set(corr.id, spineNodes.map((s) => s.id));
  }

  // 4. Connect Adjacent / Touching Corridors
  for (let i = 0; i < corridors.length; i++) {
    for (let j = i + 1; j < corridors.length; j++) {
      const c1 = corridors[i];
      const c2 = corridors[j];
      const bb1 = boundingBox(c1.points)!;
      const bb2 = boundingBox(c2.points)!;

      const overlapX = Math.min(bb1.max.x, bb2.max.x) - Math.max(bb1.min.x, bb2.min.x);
      const overlapY = Math.min(bb1.max.y, bb2.max.y) - Math.max(bb1.min.y, bb2.min.y);

      if (overlapX >= -20 && overlapY >= -20) {
        const h1 = bb1.width >= bb1.height;
        const h2 = bb2.width >= bb2.height;
        const midY1 = Math.round(bb1.min.y + bb1.height / 2);
        const midY2 = Math.round(bb2.min.y + bb2.height / 2);
        const midX1 = Math.round(bb1.min.x + bb1.width / 2);
        const midX2 = Math.round(bb2.min.x + bb2.width / 2);

        if (h1 && h2) {
          const jX = Math.round((Math.max(bb1.min.x, bb2.min.x) + Math.min(bb1.max.x, bb2.max.x)) / 2);
          const jNode1 = addNode({ x: jX, y: midY1 });
          const jNode2 = addNode({ x: jX, y: midY2 });
          addEdge(jNode1, jNode2);
          corridorSpineNodes.get(c1.id)?.push(jNode1);
          corridorSpineNodes.get(c2.id)?.push(jNode2);
        } else if (!h1 && !h2) {
          const jY = Math.round((Math.max(bb1.min.y, bb2.min.y) + Math.min(bb1.max.y, bb2.max.y)) / 2);
          const jNode1 = addNode({ x: midX1, y: jY });
          const jNode2 = addNode({ x: midX2, y: jY });
          addEdge(jNode1, jNode2);
          corridorSpineNodes.get(c1.id)?.push(jNode1);
          corridorSpineNodes.get(c2.id)?.push(jNode2);
        } else {
          const horiz = h1 ? c1 : c2;
          const vert = h1 ? c2 : c1;
          const hbb = boundingBox(horiz.points)!;
          const vbb = boundingBox(vert.points)!;
          const jX = Math.round(vbb.min.x + vbb.width / 2);
          const jY = Math.round(hbb.min.y + hbb.height / 2);
          const jNode = addNode({ x: jX, y: jY });
          corridorSpineNodes.get(c1.id)?.push(jNode);
          corridorSpineNodes.get(c2.id)?.push(jNode);
        }
      }
    }
  }

  // 5. Connect waypoints along each Corridor Spine
  for (const corr of corridors) {
    const rawIds = corridorSpineNodes.get(corr.id) ?? [];
    const uniqueIds = Array.from(new Set(rawIds));
    const bb = boundingBox(corr.points)!;
    const isHorizontal = bb.width >= bb.height;

    const spineList = uniqueIds
      .map((id) => {
        const n = nodes.find((node) => node.id === id)!;
        return { id, val: isHorizontal ? n.x : n.y };
      })
      .sort((a, b) => a.val - b.val);

    for (let i = 0; i < spineList.length - 1; i++) {
      addEdge(spineList[i].id, spineList[i + 1].id);
    }
  }

  // 6. Connect non-door POIs to their containing room or nearest corridor
  for (const poi of nextPois) {
    if (isDoorway(poi)) continue;
    let pNodeId = poi.nav_node_id;
    if (!pNodeId) {
      pNodeId = addNode({ x: poi.x, y: poi.y });
      poi.nav_node_id = pNodeId;
    }
    const contRoom = rooms.find((r) => pointInPolygon(poi, r.points));
    if (contRoom) {
      const rNodeId = roomNodeMap.get(contRoom.id);
      if (rNodeId) addEdge(pNodeId, rNodeId);
    } else {
      const contCorr = corridors.find((c) => pointInPolygon(poi, c.points));
      if (contCorr) {
        const spineIds = corridorSpineNodes.get(contCorr.id) ?? [];
        if (spineIds.length > 0) {
          const pPt = { x: poi.x, y: poi.y };
          let closestId = spineIds[0];
          let minDist = Infinity;
          for (const sId of spineIds) {
            const sNode = nodes.find((n) => n.id === sId);
            if (sNode) {
              const d = Math.hypot(sNode.x - pPt.x, sNode.y - pPt.y);
              if (d < minDist) {
                minDist = d;
                closestId = sId;
              }
            }
          }
          addEdge(pNodeId, closestId);
        }
      }
    }
  }

  return { ...doc, nodes, edges, pois: nextPois };
}

export function moveMultiSelection(
  doc: MapDocument,
  items: SelectionItem[],
  delta: Point,
  width: number,
  height: number,
): MapDocument {
  if (!items || items.length === 0 || (delta.x === 0 && delta.y === 0)) return doc;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    if (item.kind === "shapes") {
      const s = doc.shapes.find((entry) => entry.id === item.id);
      if (s) {
        for (const p of s.points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
    } else if (item.kind === "pois") {
      const p = doc.pois.find((entry) => entry.id === item.id);
      if (p) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    } else if (item.kind === "nodes") {
      const n = doc.nodes.find((entry) => entry.id === item.id);
      if (n) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
    }
  }

  if (!isFinite(minX)) {
    return items.reduce((d, item) => moveSelection(d, item, delta, width, height), doc);
  }

  const dx = Math.max(-minX, Math.min(delta.x, width - maxX));
  const dy = Math.max(-minY, Math.min(delta.y, height - maxY));
  if (dx === 0 && dy === 0) return doc;

  const clampedDelta = { x: dx, y: dy };
  let currentDoc = doc;
  for (const item of items) {
    currentDoc = moveSelection(currentDoc, item, clampedDelta, width, height);
  }
  return currentDoc;
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
