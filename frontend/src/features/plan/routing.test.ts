import { describe, expect, it } from "vitest";
import type { MapDocument } from "../../../../CONTRACTS/types";
import { edgeIsBlocked, doorOpenings, blockingWalls } from "./routing";
import { buildGraphFromDoors, connectNodes } from "./model";

const uid = () => crypto.randomUUID();

function docWithDoor(doorX: number | null): MapDocument {
  const wallShape = {
    id: uid(),
    kind: "wall" as const,
    label: "",
    points: [
      { x: 20, y: 50 },
      { x: 180, y: 50 },
    ],
  };
  const pois = doorX === null ? [] : [
    {
      id: uid(),
      title: "Дверь",
      category: "custom" as const,
      category_label: "Дверь",
      description: `[${doorX - 10},50 -> ${doorX + 10},50]`,
      x: doorX,
      y: 50,
      nav_node_id: null,
      floor_id: null,
    },
  ];
  return {
    title: "t",
    description: "",
    is_published: false,
    scale_m_per_unit: 0.1,
    max_walk_gap_units: 20,
    background_asset_id: null,
    buildings: [],
    floors: [],
    shapes: [wallShape],
    nodes: [],
    edges: [],
    pois,
    panoramas: [],
    hotspots: [],
  } as MapDocument;
}

describe("wall-aware route graph", () => {
  it("blocks a direct line that crosses a wall", () => {
    const doc = docWithDoor(null);
    expect(edgeIsBlocked(doc, { x: 100, y: 10 }, { x: 100, y: 90 })).toBe(true);
    expect(blockingWalls(doc, { x: 100, y: 10 }, { x: 100, y: 90 })).toHaveLength(1);
  });

  it("allows crossing inside a doorway", () => {
    const doc = docWithDoor(100);
    expect(doorOpenings(doc)).toHaveLength(1);
    expect(edgeIsBlocked(doc, { x: 100, y: 10 }, { x: 100, y: 90 })).toBe(false);
    // Ten units to the side is still inside the clearance band, forty is not.
    expect(edgeIsBlocked(doc, { x: 110, y: 10 }, { x: 110, y: 90 })).toBe(false);
    expect(edgeIsBlocked(doc, { x: 140, y: 10 }, { x: 140, y: 90 })).toBe(true);
  });

  it("refuses to connect nodes across a wall but allows a doorway", () => {
    const blockedDoc = {
      ...docWithDoor(null),
      nodes: [
        { id: "a", x: 100, y: 10 },
        { id: "b", x: 100, y: 90 },
      ],
    } as MapDocument;
    expect(() => connectNodes(blockedDoc, "a", "b")).toThrow(/пересекает стену/);
    expect(connectNodes(blockedDoc, "a", "b", { allowCrossingWalls: true }).edges).toHaveLength(1);

    const openDoc = { ...docWithDoor(100), nodes: blockedDoc.nodes } as MapDocument;
    expect(connectNodes(openDoc, "a", "b").edges).toHaveLength(1);
  });

  it("builds a graph from doors that does not cross the wall", () => {
    const doc = {
      ...docWithDoor(100),
      pois: [
        ...docWithDoor(100).pois,
        { id: uid(), title: "Стенд", category: "booth" as const, category_label: null,
          description: "", x: 40, y: 10, nav_node_id: null, floor_id: null },
      ],
    } as MapDocument;
    const built = buildGraphFromDoors(doc);
    expect(built.nodes.length).toBe(2);
    for (const edge of built.edges) {
      const a = built.nodes.find((n) => n.id === edge.a)!;
      const b = built.nodes.find((n) => n.id === edge.b)!;
      expect(edgeIsBlocked(doc, a, b)).toBe(false);
    }
  });

  it("generates a unified building graph connecting rooms through corridors and doors", () => {
    const doc: MapDocument = {
      title: "Building Test",
      description: "",
      is_published: false,
      scale_m_per_unit: 0.1,
      max_walk_gap_units: 20,
      background_asset_id: null,
      buildings: [],
      floors: [],
      shapes: [
        {
          id: "corridor-1",
          kind: "corridor",
          label: "Коридор 1",
          points: [
            { x: 100, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 140 },
            { x: 100, y: 140 },
          ],
        },
        {
          id: "corridor-2",
          kind: "corridor",
          label: "Коридор 2",
          points: [
            { x: 100, y: 140 },
            { x: 300, y: 140 },
            { x: 300, y: 180 },
            { x: 100, y: 180 },
          ],
        },
        {
          id: "room-1",
          kind: "room",
          label: "Помещение 1",
          points: [
            { x: 300, y: 100 },
            { x: 440, y: 100 },
            { x: 440, y: 200 },
            { x: 300, y: 200 },
          ],
        },
        {
          id: "room-2",
          kind: "room",
          label: "Помещение 2",
          points: [
            { x: 140, y: 180 },
            { x: 260, y: 180 },
            { x: 260, y: 280 },
            { x: 140, y: 280 },
          ],
        },
      ],
      nodes: [],
      edges: [],
      pois: [
        {
          id: "door-1",
          title: "Дверь в Помещение 1",
          category: "custom",
          category_label: "Дверь",
          description: "[300,120 -> 300,140]",
          x: 300,
          y: 130,
          nav_node_id: null,
          floor_id: null,
        },
        {
          id: "door-2",
          title: "Дверь в Помещение 2",
          category: "custom",
          category_label: "Дверь",
          description: "[180,180 -> 220,180]",
          x: 200,
          y: 180,
          nav_node_id: null,
          floor_id: null,
        },
      ],
      panoramas: [],
      hotspots: [],
    };

    const built = buildGraphFromDoors(doc);
    expect(built.nodes.length).toBeGreaterThanOrEqual(4);
    expect(built.edges.length).toBeGreaterThanOrEqual(3);

    // Verify adjacency / path from Room 2 to Room 1 via BFS
    const adj = new Map<string, string[]>();
    for (const e of built.edges) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }

    const room1Poi = built.pois.find((p) => p.title.includes("Помещение 1"))!;
    const room2Poi = built.pois.find((p) => p.title.includes("Помещение 2"))!;
    expect(room1Poi).toBeDefined();
    expect(room2Poi).toBeDefined();

    const startNode = room2Poi.nav_node_id!;
    const goalNode = room1Poi.nav_node_id!;

    const queue = [startNode];
    const visited = new Set<string>([startNode]);
    let reached = false;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === goalNode) {
        reached = true;
        break;
      }
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    expect(reached).toBe(true);
  });
});
