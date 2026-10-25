import { useRef, useState, useEffect, type ReactNode } from "react";
import type {
  AssetRef,
  MapDocument,
  Point,
  Shape,
  Poi,
  NavNode,
  Panorama,
} from "../../../../CONTRACTS/types";
import { apiClient } from "../../shared/api";
import { pointFromSvg } from "../../shared/coordinates";
import { boundingBox, pointInPolygon, segmentsIntersect } from "../../shared/geometry";
import { Inspector, nodeLabel } from "./Inspector";
import {
  buildGraphFromDoors,
  connectNodes,
  makeShape,
  moveMultiSelection,
  moveSelection,
  removeMultiSelection,
  removeSelection,
  type Selection,
  type SelectionItem,
} from "./model";
import { blockingWalls, parseDoorDescription } from "./routing";

export interface WallSnap {
  point: Point;
  segment: [Point, Point];
  shape: Shape;
  normal: Point;
  dist: number;
}

export function findWallSnap(
  pt: Point,
  shapes: Shape[],
  maxDist = 35,
): WallSnap | null {
  let best: WallSnap | null = null;
  let minDist = maxDist;

  for (const shape of shapes) {
    if (shape.kind !== "room" && shape.kind !== "corridor" && shape.kind !== "wall") {
      continue;
    }
    const pts = shape.points;
    if (pts.length < 2) continue;
    const isClosed = shape.kind === "room" || shape.kind === "corridor";
    const segmentCount = isClosed ? pts.length : pts.length - 1;

    for (let i = 0; i < segmentCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1) continue;

      let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      const dist = Math.hypot(pt.x - projX, pt.y - projY);

      if (dist < minDist) {
        minDist = dist;
        const len = Math.sqrt(lenSq);
        const ux = dx / len;
        const uy = dy / len;
        const n1 = { x: -uy, y: ux };
        const n2 = { x: uy, y: -ux };
        let insideNormal = n1;
        if (isClosed && pts.length >= 3) {
          const midSeg = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const testPt = { x: midSeg.x + n1.x * 6, y: midSeg.y + n1.y * 6 };
          if (pointInPolygon(testPt, pts)) {
            insideNormal = n1;
          } else {
            insideNormal = n2;
          }
        }

        best = {
          point: { x: Math.round(projX), y: Math.round(projY) },
          segment: [a, b],
          shape,
          dist,
          normal: insideNormal,
        };
      }
    }
  }

  return best;
}

export function findDoorNormal(
  geom: { x1: number; y1: number; x2: number; y2: number },
  shapes: Shape[],
): Point {
  const mid = { x: (geom.x1 + geom.x2) / 2, y: (geom.y1 + geom.y2) / 2 };
  const dx = geom.x2 - geom.x1;
  const dy = geom.y2 - geom.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: 0, y: 1 };

  const ux = dx / len;
  const uy = dy / len;
  const n1 = { x: -uy, y: ux };
  const n2 = { x: uy, y: -ux };

  for (const s of shapes) {
    if (s.kind === "room" && s.points.length >= 3) {
      if (pointInPolygon({ x: mid.x + n1.x * 6, y: mid.y + n1.y * 6 }, s.points)) {
        return n1;
      }
      if (pointInPolygon({ x: mid.x + n2.x * 6, y: mid.y + n2.y * 6 }, s.points)) {
        return n2;
      }
    }
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: 0, y: 1 };
  }
  return { x: 1, y: 0 };
}

export function getDoorGeometry(p1: Point, p2: Point, normal: Point) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  const nx = normal.x;
  const ny = normal.y;

  const post1 = {
    x1: p1.x - nx * 5,
    y1: p1.y - ny * 5,
    x2: p1.x + nx * 5,
    y2: p1.y + ny * 5,
  };
  const post2 = {
    x1: p2.x - nx * 5,
    y1: p2.y - ny * 5,
    x2: p2.x + nx * 5,
    y2: p2.y + ny * 5,
  };

  const c45 = 0.7071;
  const tip = {
    x: p1.x + len * (c45 * ux + c45 * nx),
    y: p1.y + len * (c45 * uy + c45 * ny),
  };

  const cross = ux * ny - uy * nx;
  const sweepFlag = cross > 0 ? 1 : 0;
  const arcD = `M ${p2.x} ${p2.y} A ${len} ${len} 0 0 ${sweepFlag} ${tip.x} ${tip.y}`;

  return { len, post1, post2, leafStart: p1, leafTip: tip, arcD };
}

export interface PlanEditorProps {
  mapId: string | null;
  widthUnits: number;
  heightUnits: number;
  document: MapDocument;
  darkMode?: boolean;
  isAuthenticated: boolean;
  assets?: AssetRef[];
  onChangeDocument: (next: MapDocument) => void;
  onSaveDocument: (next?: MapDocument) => Promise<unknown>;
  onNotify: (message: string) => void;
  onAsset?: (asset: AssetRef) => void;
  captureSlot?: ReactNode;
}

type Tool = "poi" | "main_door" | "door" | "window" | "node" | Shape["kind"];
const tools: Record<Tool, string> = {
  poi: "Точка POI",
  main_door: "Главная дверь",
  door: "Дверь / Проход",
  window: "Окно",
  node: "Узел прохода",
  wall: "Стена",
  room: "Комната",
  corridor: "Коридор",
};

export function PlanEditor({
  mapId,
  widthUnits: width,
  heightUnits: height,
  document: doc,
  isAuthenticated,
  assets = [],
  onChangeDocument,
  onSaveDocument,
  onNotify,
  onAsset,
  captureSlot,
}: PlanEditorProps) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectionItem[]>([]);
  const selection: Selection = selectedItems.length > 0 ? selectedItems[0] : null;
  const setSelection = (sel: Selection) => {
    setSelectedItems(sel ? [sel] : []);
  };
  const [points, setPoints] = useState<Point[]>([]);
  const [past, setPast] = useState<MapDocument[]>([]);
  const [future, setFuture] = useState<MapDocument[]>([]);
  const [edgeA, setEdgeA] = useState(""),
    [edgeB, setEdgeB] = useState("");
  const [zoom, setZoom] = useState(1),
    [uploading, setUploading] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  // Graph editing is opt-in, but seeing the route network while laying out a plan is useful.
  const [showGraph, setShowGraph] = useState(true);

  const scaleM = doc.scale_m_per_unit && doc.scale_m_per_unit > 0 ? doc.scale_m_per_unit : null;
  const gridStep =
    doc.max_walk_gap_units && doc.max_walk_gap_units >= 5 && doc.max_walk_gap_units <= 200
      ? Math.round(doc.max_walk_gap_units)
      : 20;
  const snapStep = gridStep;
  const snap = (v: number) => (snapToGrid ? Math.round(v / gridStep) * gridStep : Math.round(v));

  const formatDist = (units: number) => {
    if (scaleM) {
      const m = units * scaleM;
      return m >= 10 ? `${m.toFixed(1)} м` : `${m.toFixed(2)} м`;
    }
    return `${Math.round(units)} ед.`;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panDrag = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    isPanning: boolean;
  } | null>(null);

  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null);
  const marqueeDrag = useRef<{
    start: Point;
    current: Point;
    isSelecting: boolean;
  } | null>(null);

  // Live preview for dragging doors / passages / windows
  const [doorDraft, setDoorDraft] = useState<{
    start: Point;
    current: Point;
    kind: "main_door" | "door" | "window";
    wallSnap: WallSnap | null;
  } | null>(null);

  const [hoverWallSnap, setHoverWallSnap] = useState<WallSnap | null>(null);

  const doorDrag = useRef<{
    start: Point;
    current: Point;
    kind: "main_door" | "door" | "window";
    wallSnap: WallSnap | null;
    isDragging: boolean;
  } | null>(null);

  const handleFlipDoor = (poi: Poi) => {
    const parsed = parseDoorDescription(poi.description);
    const isEntrance = poi.category === "entrance";
    const isDoor = poi.category_label === "Дверь" || poi.title.includes("Дверь") || poi.title.includes("Проход");
    const geom =
      parsed?.geom ??
      (isEntrance || isDoor
        ? { x1: poi.x - 20, y1: poi.y, x2: poi.x + 20, y2: poi.y }
        : null);
    if (!geom) return;
    const currentDir = parsed?.dir ?? 0;
    const nextDir = (currentDir + 1) % 4;
    const newGeomTag = `[${geom.x1},${geom.y1} -> ${geom.x2},${geom.y2} | dir:${nextDir}]`;
    let newDesc = poi.description || "";
    if (parsed?.rawMatch) {
      newDesc = newDesc.replace(parsed.rawMatch, newGeomTag);
    } else if (newDesc.includes("->")) {
      newDesc = newDesc.replace(/\[\d+,\d+\s*->\s*\d+,\d+(?:\s*\|\s*dir:\d+)?\]/, newGeomTag);
    } else {
      newDesc = `${newDesc} ${newGeomTag}`.trim();
    }

    commit({
      ...doc,
      pois: doc.pois.map((p) => (p.id === poi.id ? { ...p, description: newDesc } : p)),
    });
    onNotify(
      poi.category === "entrance"
        ? "Направление главной двери изменено"
        : "Направление прохода изменено",
    );
  };

  const svg = useRef<SVGSVGElement>(null);
  const current = useRef(doc);
  current.current = doc;
  const emitted = useRef(doc);
  useEffect(() => {
    if (emitted.current !== doc) {
      setPast([]);
      setFuture([]);
      emitted.current = doc;
    }
  }, [doc]);

  const emit = (next: MapDocument) => {
    emitted.current = next;
    onChangeDocument(next);
  };

  interface ClipboardItem {
    kind: NonNullable<Selection>["kind"];
    data: Shape | Poi | NavNode | Panorama;
    extraNode?: NavNode;
  }
  const clipboardRef = useRef<ClipboardItem | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const drag = useRef<{
    point: Point;
    items: SelectionItem[];
    document: MapDocument;
  } | null>(null);
  const resizeDrag = useRef<{
    shapeId: string;
    handle: string;
    initialBox: { minX: number; maxX: number; minY: number; maxY: number };
    startPt: Point;
    document: MapDocument;
  } | null>(null);
  const didDrag = useRef(false);

  const commit = (next: MapDocument) => {
    setPast((history) => [...history.slice(-49), current.current]);
    setFuture([]);
    emit(next);
  };

  const background =
    assets.find((a) => a.id === doc.background_asset_id)?.full_url ??
    (doc.background_asset_id
      ? `/api/v1/media/${doc.background_asset_id}/full`
      : null);

  // Keyboard shortcuts: Space to pan, Delete/Backspace to remove, Arrows to nudge, Ctrl+Z / Ctrl+Y for Undo / Redo, Ctrl+C / Ctrl+V for Copy / Paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
        return;
      }

      if (e.key === "Escape") {
        setPoints([]);
        setSelection(null);
        if (tool === "room" || tool === "corridor" || tool === "wall") {
          setTool(null);
        }
        if (panDrag.current) panDrag.current = null;
        if (marqueeDrag.current) {
          marqueeDrag.current = null;
          setMarquee(null);
        }
        if (doorDrag.current) {
          doorDrag.current = null;
          setDoorDraft(null);
        }
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      const code = e.code;
      const key = e.key.toLowerCase();
      const isZ = code === "KeyZ" || key === "z" || key === "я";
      const isY = code === "KeyY" || key === "y" || key === "н";
      const isC = code === "KeyC" || key === "c" || key === "с"; // Russian 'с'
      const isV = code === "KeyV" || key === "v" || key === "м"; // Russian 'м'

      // Copy (Ctrl+C / Cmd+C)
      if (isCtrl && isC && selection) {
        e.preventDefault();
        const { kind, id } = selection;
        if (kind === "shapes") {
          const shape = current.current.shapes.find((s) => s.id === id);
          if (shape) {
            clipboardRef.current = { kind: "shapes", data: JSON.parse(JSON.stringify(shape)) };
            onNotify(`Скопировано: ${shape.label || (shape.kind === "room" ? "Помещение" : shape.kind === "corridor" ? "Коридор" : "Стена")}`);
          }
        } else if (kind === "pois") {
          const poi = current.current.pois.find((p) => p.id === id);
          if (poi) {
            const extraNode = poi.nav_node_id
              ? current.current.nodes.find((n) => n.id === poi.nav_node_id)
              : undefined;
            clipboardRef.current = {
              kind: "pois",
              data: JSON.parse(JSON.stringify(poi)),
              extraNode: extraNode ? JSON.parse(JSON.stringify(extraNode)) : undefined,
            };
            onNotify(`Скопировано: ${poi.title || "Точка"}`);
          }
        } else if (kind === "nodes") {
          const node = current.current.nodes.find((n) => n.id === id);
          if (node) {
            clipboardRef.current = { kind: "nodes", data: JSON.parse(JSON.stringify(node)) };
            onNotify("Узел скопирован");
          }
        } else if (kind === "panoramas") {
          const pano = current.current.panoramas.find((p) => p.id === id);
          if (pano) {
            clipboardRef.current = { kind: "panoramas", data: JSON.parse(JSON.stringify(pano)) };
            onNotify("Панорама скопирована");
          }
        }
        return;
      }

      // Paste (Ctrl+V / Cmd+V)
      if (isCtrl && isV && clipboardRef.current) {
        e.preventDefault();
        const item = clipboardRef.current;
        const offset = 25;

        if (item.kind === "shapes") {
          const original = item.data as Shape;
          const newId = crypto.randomUUID();
          const maxX = Math.max(...original.points.map((p) => p.x));
          const maxY = Math.max(...original.points.map((p) => p.y));
          const dx = maxX + offset > width ? -offset : offset;
          const dy = maxY + offset > height ? -offset : offset;

          const newPoints = original.points.map((p) => ({
            x: Math.max(0, Math.min(width, p.x + dx)),
            y: Math.max(0, Math.min(height, p.y + dy)),
          }));
          const newShape: Shape = {
            ...original,
            id: newId,
            label: original.label ? `${original.label} (копия)` : "",
            points: newPoints,
          };
          commit({
            ...current.current,
            shapes: [...current.current.shapes, newShape],
          });
          setSelection({ kind: "shapes", id: newId });
          onNotify("Вставлен объект");
        } else if (item.kind === "pois") {
          const original = item.data as Poi;
          const newId = crypto.randomUUID();
          const dx = original.x + offset > width ? -offset : offset;
          const dy = original.y + offset > height ? -offset : offset;
          const newX = Math.max(0, Math.min(width, original.x + dx));
          const newY = Math.max(0, Math.min(height, original.y + dy));

          let newDesc = original.description || "";
          const doorMatch = newDesc.match(/\[(\d+),(\d+)\s*->\s*(\d+),(\d+)(?:\s*\|\s*dir:(\d+))?\]/);
          if (doorMatch) {
            const x1 = Math.max(0, Math.min(width, Number(doorMatch[1]) + dx));
            const y1 = Math.max(0, Math.min(height, Number(doorMatch[2]) + dy));
            const x2 = Math.max(0, Math.min(width, Number(doorMatch[3]) + dx));
            const y2 = Math.max(0, Math.min(height, Number(doorMatch[4]) + dy));
            const dirPart = doorMatch[5] !== undefined ? ` | dir:${doorMatch[5]}` : "";
            newDesc = newDesc.replace(doorMatch[0], `[${x1},${y1} -> ${x2},${y2}${dirPart}]`);
          }

          let newNodeId: string | null = null;
          const newNodes = [...current.current.nodes];
          if (original.nav_node_id) {
            newNodeId = crypto.randomUUID();
            newNodes.push({ id: newNodeId, x: newX, y: newY });
          }

          const newPoi: Poi = {
            ...original,
            id: newId,
            title: original.title ? `${original.title} (копия)` : "Точка (копия)",
            description: newDesc,
            x: newX,
            y: newY,
            nav_node_id: newNodeId,
          };

          commit({
            ...current.current,
            nodes: newNodes,
            pois: [...current.current.pois, newPoi],
          });
          setSelection({ kind: "pois", id: newId });
          onNotify("Вставлен объект");
        } else if (item.kind === "nodes") {
          const original = item.data as NavNode;
          const newId = crypto.randomUUID();
          const dx = original.x + offset > width ? -offset : offset;
          const dy = original.y + offset > height ? -offset : offset;
          const newNode: NavNode = {
            ...original,
            id: newId,
            x: Math.max(0, Math.min(width, original.x + dx)),
            y: Math.max(0, Math.min(height, original.y + dy)),
          };
          commit({
            ...current.current,
            nodes: [...current.current.nodes, newNode],
          });
          setSelection({ kind: "nodes", id: newId });
          onNotify("Узел вставлен");
        } else if (item.kind === "panoramas") {
          const original = item.data as Panorama;
          const newId = crypto.randomUUID();
          const dx = original.x + offset > width ? -offset : offset;
          const dy = original.y + offset > height ? -offset : offset;
          const newPano: Panorama = {
            ...original,
            id: newId,
            x: Math.max(0, Math.min(width, original.x + dx)),
            y: Math.max(0, Math.min(height, original.y + dy)),
          };
          commit({
            ...current.current,
            panoramas: [...current.current.panoramas, newPano],
          });
          setSelection({ kind: "panoramas", id: newId });
          onNotify("Панорама вставлена");
        }
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedItems.length > 0) {
        e.preventDefault();
        const count = selectedItems.length;
        commit(removeMultiSelection(current.current, selectedItems));
        setSelectedItems([]);
        onNotify(count > 1 ? `Удалено объектов: ${count}` : "Объект удалён");
      } else if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        selectedItems.length > 0
      ) {
        e.preventDefault();
        const step = e.shiftKey ? gridStep * 2 : gridStep;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        commit(moveMultiSelection(current.current, selectedItems, { x: dx, y: dy }, width, height));
      } else if (isCtrl && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          if (future.length) {
            const next = future[0];
            setPast((p) => [...p, current.current]);
            setFuture((f) => f.slice(1));
            emit(next);
            onNotify("Действие повторено");
          }
        } else {
          if (past.length) {
            const prev = past[past.length - 1];
            setPast((p) => p.slice(0, -1));
            setFuture((f) => [current.current, ...f]);
            emit(prev);
            onNotify("Действие отменено");
          }
        }
      } else if (isCtrl && isY) {
        e.preventDefault();
        if (future.length) {
          const next = future[0];
          setPast((p) => [...p, current.current]);
          setFuture((f) => f.slice(1));
          emit(next);
          onNotify("Действие повторено");
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
        if (panDrag.current) panDrag.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selection, past, future, width, height]);

  function click(event: React.MouseEvent<SVGSVGElement>) {
    if (
      didDrag.current ||
      marqueeDrag.current?.isSelecting ||
      panDrag.current?.isPanning ||
      isSpacePressed
    ) {
      didDrag.current = false;
      return;
    }
    if (!svg.current || !isAuthenticated) return;
    // Door / window creation is handled via onPointerDown -> drag -> onPointerUp
    if (tool === "main_door" || tool === "door" || tool === "window") return;

    const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
    const point = {
      x: Math.max(0, Math.min(width, snap(raw.x))),
      y: Math.max(0, Math.min(height, snap(raw.y))),
    };

    if (!tool) {
      setSelection(null);
      return;
    }
    if (tool === "poi") {
      const id = crypto.randomUUID(),
        nodeId = crypto.randomUUID();
      commit({
        ...doc,
        nodes: [...doc.nodes, { id: nodeId, ...point }],
        pois: [
          ...doc.pois,
          {
            id,
            title: `Точка ${doc.pois.length + 1}`,
            category: "hall",
            category_label: null,
            description: "",
            ...point,
            nav_node_id: nodeId,
          },
        ],
      });
      setSelection({ kind: "pois", id });
      onNotify("Точка добавлена");
    } else if (tool === "node") {
      const id = crypto.randomUUID();
      commit({ ...doc, nodes: [...doc.nodes, { id, ...point }] });
      setSelection({ kind: "nodes", id });
    } else {
      const next = [...points, point];
      if (tool === "wall" && next.length === 2) {
        commit({ ...doc, shapes: [...doc.shapes, makeShape(tool, next)] });
        setPoints([]);
      } else setPoints(next);
    }
  }

  const selectProps = (kind: NonNullable<Selection>["kind"], id: string) => {
    return {
      // Stable hook for tests and for anyone inspecting the DOM: which entity a group represents.
      "data-kind": kind,
      onClick: (event: React.MouseEvent) => {
        if (didDrag.current) {
          didDrag.current = false;
          return;
        }
        // Shapes in creation mode bubble to svg to allow placing POIs inside them
        if (
          kind === "shapes" &&
          (tool === "poi" ||
            tool === "node" ||
            (tool === "room" && points.length > 0) ||
            (tool === "corridor" && points.length > 0) ||
            (tool === "wall" && points.length > 0))
        )
          return;
        event.stopPropagation();
        if (event.shiftKey) {
          const exists = selectedItems.some((s) => s.kind === kind && s.id === id);
          if (exists) {
            setSelectedItems(selectedItems.filter((s) => !(s.kind === kind && s.id === id)));
          } else {
            setSelectedItems([...selectedItems, { kind, id }]);
          }
        } else {
          setSelectedItems([{ kind, id }]);
        }
      },
      onPointerDown: (event: React.PointerEvent<SVGGElement>) => {
        if (!svg.current) return;
        // When drawing a door, window, or panning camera, let it bubble to svg
        if (
          tool === "main_door" ||
          tool === "door" ||
          tool === "window" ||
          isSpacePressed ||
          event.button === 1 ||
          event.button === 2
        ) {
          return;
        }
        if (
          kind === "shapes" &&
          ((tool === "room" && points.length > 0) ||
            (tool === "corridor" && points.length > 0) ||
            (tool === "wall" && points.length > 0))
        )
          return;

        event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch (_) {}

        const isAlreadySelected = selectedItems.some((s) => s.kind === kind && s.id === id);
        let currentItems: SelectionItem[];
        if (isAlreadySelected) {
          currentItems = selectedItems;
        } else if (event.shiftKey) {
          currentItems = [...selectedItems, { kind, id }];
          setSelectedItems(currentItems);
        } else {
          currentItems = [{ kind, id }];
          setSelectedItems(currentItems);
        }

        setDraggingId(id);
        didDrag.current = false;
        drag.current = {
          point: pointFromSvg(svg.current, event.clientX, event.clientY),
          items: currentItems,
          document: doc,
        };
      },
      onPointerMove: (event: React.PointerEvent) => {
        if (!drag.current || !svg.current) return;
        const next = pointFromSvg(svg.current, event.clientX, event.clientY);
        let delta = {
          x: next.x - drag.current.point.x,
          y: next.y - drag.current.point.y,
        };
        if (snapToGrid) {
          delta = {
            x: Math.round(delta.x / snapStep) * snapStep,
            y: Math.round(delta.y / snapStep) * snapStep,
          };
        }
        if (Math.hypot(next.x - drag.current.point.x, next.y - drag.current.point.y) > 2) {
          didDrag.current = true;
          emit(
            moveMultiSelection(
              drag.current.document,
              drag.current.items,
              delta,
              width,
              height,
            ),
          );
        }
      },
      onPointerUp: (event: React.PointerEvent) => {
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch (_) {}
        if (drag.current && didDrag.current) {
          const before = drag.current.document;
          setPast((history) => [...history.slice(-49), before]);
          setFuture([]);
        }
        drag.current = null;
        setDraggingId(null);
      },
      onPointerCancel: () => {
        if (drag.current && didDrag.current) {
          emit(drag.current.document);
        }
        drag.current = null;
        setDraggingId(null);
      },
    };
  };

  const handleResizePointerDown = (
    handleId: string,
    shape: Shape,
    event: React.PointerEvent,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch (_) {}
    const raw = pointFromSvg(svg.current!, event.clientX, event.clientY);
    const bb = boundingBox(shape.points);
    if (!bb) return;
    resizeDrag.current = {
      shapeId: shape.id,
      handle: handleId,
      initialBox: { minX: bb.min.x, maxX: bb.max.x, minY: bb.min.y, maxY: bb.max.y },
      startPt: raw,
      document: doc,
    };
    didDrag.current = false;
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svg.current || !isAuthenticated) return;

    // Pan camera (Middle mouse button, Right mouse button, or Space key held)
    if (isSpacePressed || event.button === 1 || event.button === 2) {
      event.preventDefault();
      panDrag.current = {
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: containerRef.current?.scrollLeft || 0,
        scrollTop: containerRef.current?.scrollTop || 0,
        isPanning: true,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    if (tool === "main_door" || tool === "door" || tool === "window") {
      event.preventDefault();
      const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
      const wallSnap = findWallSnap(raw, doc.shapes, 35);
      const start = wallSnap
        ? wallSnap.point
        : {
            x: Math.max(0, Math.min(width, snap(raw.x))),
            y: Math.max(0, Math.min(height, snap(raw.y))),
          };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      doorDrag.current = { start, current: start, kind: tool, wallSnap, isDragging: true };
      setDoorDraft({ start, current: start, kind: tool, wallSnap });
      setHoverWallSnap(null);
      return;
    }

    // Marquee / Box Selection
    if (!tool && event.button === 0) {
      const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
      marqueeDrag.current = { start: raw, current: raw, isSelecting: true };
      setMarquee({ start: raw, current: raw });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    // Pan camera
    if (panDrag.current?.isPanning && containerRef.current) {
      const dx = event.clientX - panDrag.current.startX;
      const dy = event.clientY - panDrag.current.startY;
      containerRef.current.scrollLeft = panDrag.current.scrollLeft - dx;
      containerRef.current.scrollTop = panDrag.current.scrollTop - dy;
      return;
    }

    // Shape Resizing (Room / Corridor length & width)
    if (resizeDrag.current && svg.current) {
      const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
      const { shapeId, handle, initialBox, document: startDoc } = resizeDrag.current;
      const targetShape = startDoc.shapes.find((s) => s.id === shapeId);
      if (!targetShape) return;

      let newMinX = initialBox.minX;
      let newMaxX = initialBox.maxX;
      let newMinY = initialBox.minY;
      let newMaxY = initialBox.maxY;

      const snappedX = Math.max(0, Math.min(width, snap(raw.x)));
      const snappedY = Math.max(0, Math.min(height, snap(raw.y)));

      if (handle.includes("e")) newMaxX = Math.max(newMinX + gridStep, snappedX);
      if (handle.includes("w")) newMinX = Math.min(newMaxX - gridStep, snappedX);
      if (handle.includes("s")) newMaxY = Math.max(newMinY + gridStep, snappedY);
      if (handle.includes("n")) newMinY = Math.min(newMaxY - gridStep, snappedY);

      const nextPoints: Point[] = [
        { x: newMinX, y: newMinY },
        { x: newMaxX, y: newMinY },
        { x: newMaxX, y: newMaxY },
        { x: newMinX, y: newMaxY },
      ];

      didDrag.current = true;
      emit({
        ...startDoc,
        shapes: startDoc.shapes.map((s) => (s.id === shapeId ? { ...s, points: nextPoints } : s)),
      });
      return;
    }

    // Marquee selection
    if (marqueeDrag.current?.isSelecting && svg.current) {
      const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
      marqueeDrag.current.current = raw;
      setMarquee({ start: marqueeDrag.current.start, current: raw });
      return;
    }

    // Door / window dragging
    if (doorDrag.current?.isDragging && svg.current) {
      const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
      let cur: Point;

      if (doorDrag.current.wallSnap) {
        const a = doorDrag.current.wallSnap.segment[0];
        const b = doorDrag.current.wallSnap.segment[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segLenSq = dx * dx + dy * dy;
        let t = ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / segLenSq;
        t = Math.max(0, Math.min(1, t));
        const segLen = Math.sqrt(segLenSq);
        if (snapToGrid && segLen > 0) {
          const distAlong = t * segLen;
          const snappedDist = Math.round(distAlong / snapStep) * snapStep;
          t = Math.max(0, Math.min(1, snappedDist / segLen));
        }
        cur = {
          x: Math.round(a.x + t * dx),
          y: Math.round(a.y + t * dy),
        };
      } else {
        cur = {
          x: Math.max(0, Math.min(width, snap(raw.x))),
          y: Math.max(0, Math.min(height, snap(raw.y))),
        };
        const dx = cur.x - doorDrag.current.start.x;
        const dy = cur.y - doorDrag.current.start.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          cur.y = doorDrag.current.start.y;
        } else {
          cur.x = doorDrag.current.start.x;
        }
      }

      doorDrag.current.current = cur;
      setDoorDraft({
        start: doorDrag.current.start,
        current: cur,
        kind: doorDrag.current.kind,
        wallSnap: doorDrag.current.wallSnap,
      });
      return;
    }

    if (
      !doorDrag.current?.isDragging &&
      svg.current &&
      (tool === "main_door" || tool === "door" || tool === "window")
    ) {
      const raw = pointFromSvg(svg.current, event.clientX, event.clientY);
      const snap = findWallSnap(raw, doc.shapes, 35);
      setHoverWallSnap(snap);
    }

    if (!drag.current || !svg.current) return;
    const next = pointFromSvg(svg.current, event.clientX, event.clientY);
    let delta = {
      x: next.x - drag.current.point.x,
      y: next.y - drag.current.point.y,
    };
    if (snapToGrid) {
      delta = {
        x: Math.round(delta.x / snapStep) * snapStep,
        y: Math.round(delta.y / snapStep) * snapStep,
      };
    }
    if (Math.hypot(next.x - drag.current.point.x, next.y - drag.current.point.y) > 2) {
      didDrag.current = true;
      emit(
        moveMultiSelection(
          drag.current.document,
          drag.current.items,
          delta,
          width,
          height,
        ),
      );
    }
  };

  const handleCanvasPointerUp = () => {
    if (panDrag.current?.isPanning) {
      panDrag.current = null;
    }

    if (resizeDrag.current) {
      if (didDrag.current) {
        setPast((history) => [...history.slice(-49), resizeDrag.current!.document]);
        setFuture([]);
      }
      resizeDrag.current = null;
    }

    if (marqueeDrag.current?.isSelecting) {
      const { start, current: cur } = marqueeDrag.current;
      marqueeDrag.current = null;
      setMarquee(null);

      const minX = Math.min(start.x, cur.x);
      const maxX = Math.max(start.x, cur.x);
      const minY = Math.min(start.y, cur.y);
      const maxY = Math.max(start.y, cur.y);
      const diag = Math.hypot(maxX - minX, maxY - minY);

      if (diag > 6) {
        didDrag.current = true;
        const selected: SelectionItem[] = [];

        // Check POIs (doors, passages, entrance, poi)
        for (const p of doc.pois) {
          const parsed = parseDoorDescription(p.description);
          if (parsed?.geom) {
            const { x1, y1, x2, y2 } = parsed.geom;
            if (
              (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) ||
              (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) ||
              segmentsIntersect({ x: minX, y: minY }, { x: maxX, y: minY }, { x: x1, y: y1 }, { x: x2, y: y2 }) ||
              segmentsIntersect({ x: minX, y: maxY }, { x: maxX, y: maxY }, { x: x1, y: y1 }, { x: x2, y: y2 })
            ) {
              selected.push({ kind: "pois", id: p.id });
              continue;
            }
          }
          if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
            selected.push({ kind: "pois", id: p.id });
          }
        }

        // Check shapes (room, corridor, wall)
        const boxCorners = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        for (const s of doc.shapes) {
          const anyPtInside = s.points.some(
            (pt) => pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY,
          );
          if (anyPtInside) {
            selected.push({ kind: "shapes", id: s.id });
            continue;
          }
          const cx = s.points.reduce((acc, p) => acc + p.x, 0) / s.points.length;
          const cy = s.points.reduce((acc, p) => acc + p.y, 0) / s.points.length;
          if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
            selected.push({ kind: "shapes", id: s.id });
            continue;
          }
          let intersects = false;
          const isClosed = s.kind === "room" || s.kind === "corridor";
          const count = isClosed ? s.points.length : s.points.length - 1;
          for (let i = 0; i < count && !intersects; i++) {
            const sp1 = s.points[i];
            const sp2 = s.points[(i + 1) % s.points.length];
            for (let b = 0; b < 4 && !intersects; b++) {
              if (segmentsIntersect(sp1, sp2, boxCorners[b], boxCorners[(b + 1) % 4])) {
                intersects = true;
              }
            }
          }
          if (intersects) {
            selected.push({ kind: "shapes", id: s.id });
          }
        }

        // Check panoramas
        for (const p of doc.panoramas) {
          if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
            selected.push({ kind: "panoramas", id: p.id });
          }
        }

        // Check nodes
        for (const n of doc.nodes) {
          if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
            const belongsToPoi = selected.some(
              (item) => item.kind === "pois" && doc.pois.find((p) => p.id === item.id)?.nav_node_id === n.id,
            );
            if (!belongsToPoi) {
              selected.push({ kind: "nodes", id: n.id });
            }
          }
        }

        setSelectedItems(selected);
        return;
      } else {
        setSelectedItems([]);
      }
    }

    if (doorDrag.current?.isDragging) {
      let { start, current: cur, kind, wallSnap } = doorDrag.current;
      doorDrag.current = null;
      setDoorDraft(null);

      let len = Math.hypot(cur.x - start.x, cur.y - start.y);
      if (len < 10) {
        if (wallSnap) {
          const a = wallSnap.segment[0];
          const b = wallSnap.segment[1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const segLen = Math.hypot(dx, dy);
          if (segLen > 0) {
            cur = {
              x: Math.round(start.x + (dx / segLen) * 40),
              y: Math.round(start.y + (dy / segLen) * 40),
            };
            len = 40;
          }
        } else {
          cur = { x: Math.min(width, start.x + 40), y: start.y };
          len = 40;
        }
      }
      const midX = Math.round((start.x + cur.x) / 2);
      const midY = Math.round((start.y + cur.y) / 2);
      const nodeId = crypto.randomUUID();
      const id = crypto.randomUUID();
      const doorGeom = `[${start.x},${start.y} -> ${cur.x},${cur.y} | dir:0]`;

      if (kind === "main_door") {
        commit({
          ...doc,
          nodes: [...doc.nodes, { id: nodeId, x: midX, y: midY }],
          pois: [
            ...doc.pois.filter((p) => p.category !== "entrance"),
            {
              id,
              title: "Главная входная дверь",
              category: "entrance",
              category_label: null,
              description: `Главная входная дверь (${formatDist(len)}) ${doorGeom}`,
              x: midX,
              y: midY,
              nav_node_id: nodeId,
            },
          ],
        });
        setSelection({ kind: "pois", id });
        onNotify(`Главная входная дверь установлена (${formatDist(len)})! Маршруты рассчитываются от этой точки.`);
      } else if (kind === "door") {
        commit({
          ...doc,
          nodes: [...doc.nodes, { id: nodeId, x: midX, y: midY }],
          pois: [
            ...doc.pois,
            {
              id,
              title: `Проход / Дверь (${formatDist(len)})`,
              category: "custom",
              category_label: "Дверь",
              description: `Проход / Дверь (${formatDist(len)}) ${doorGeom}`,
              x: midX,
              y: midY,
              nav_node_id: nodeId,
            },
          ],
        });
        setSelection({ kind: "pois", id });
        onNotify(`Проход / дверь добавлен (${formatDist(len)})`);
      } else if (kind === "window") {
        commit({
          ...doc,
          pois: [
            ...doc.pois,
            {
              id,
              title: `Окно (${formatDist(len)})`,
              category: "custom",
              category_label: "Окно",
              description: `Окно (${formatDist(len)}) ${doorGeom}`,
              x: midX,
              y: midY,
              nav_node_id: null,
            },
          ],
        });
        setSelection({ kind: "pois", id });
        onNotify(`Окно добавлено (${formatDist(len)})`);
      }
      setTool(null);
      return;
    }

    if (drag.current && didDrag.current) {
      const before = drag.current.document;
      setPast((history) => [...history.slice(-49), before]);
      setFuture([]);
    }
    drag.current = null;
    setDraggingId(null);
  };

  const addPresetRoom = () => {
    const rawW = Math.min(200, width * 0.4);
    const rawH = Math.min(160, height * 0.4);
    const w = Math.max(gridStep * 2, Math.round(rawW / gridStep) * gridStep);
    const h = Math.max(gridStep * 2, Math.round(rawH / gridStep) * gridStep);
    const cx = snap(width / 2);
    const cy = snap(height / 2);
    const x1 = Math.max(0, snap(cx - w / 2));
    const y1 = Math.max(0, snap(cy - h / 2));
    const x2 = Math.min(width, x1 + w);
    const y2 = Math.min(height, y1 + h);
    const rectPoints: Point[] = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    const shape = makeShape("room", rectPoints);
    shape.label = `Помещение ${doc.shapes.filter((s) => s.kind === "room").length + 1}`;
    commit({ ...doc, shapes: [...doc.shapes, shape] });
    setSelectedItems([{ kind: "shapes", id: shape.id }]);
    onNotify("Добавлена комната");
  };

  const addPresetCorridor = () => {
    const rawW = Math.min(300, width * 0.6);
    const rawH = Math.min(60, height * 0.2);
    const w = Math.max(gridStep * 2, Math.round(rawW / gridStep) * gridStep);
    const h = Math.max(gridStep, Math.round(rawH / gridStep) * gridStep);
    const cx = snap(width / 2);
    const cy = snap(height / 2);
    const x1 = Math.max(0, snap(cx - w / 2));
    const y1 = Math.max(0, snap(cy - h / 2));
    const x2 = Math.min(width, x1 + w);
    const y2 = Math.min(height, y1 + h);
    const rectPoints: Point[] = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    const shape = makeShape("corridor", rectPoints);
    shape.label = `Коридор ${doc.shapes.filter((s) => s.kind === "corridor").length + 1}`;
    commit({ ...doc, shapes: [...doc.shapes, shape] });
    setSelectedItems([{ kind: "shapes", id: shape.id }]);
    onNotify("Добавлен коридор");
  };

  const clearAllPois = () => {
    if (!doc.pois.length) return;
    if (window.confirm(`Удалить все точки интереса (${doc.pois.length} шт.)?`)) {
      const poiNodeIds = new Set(doc.pois.map((p) => p.nav_node_id).filter(Boolean));
      const keepNodes = doc.nodes.filter(
        (n) =>
          !poiNodeIds.has(n.id) ||
          doc.edges.some((e) => e.a === n.id || e.b === n.id) ||
          doc.panoramas.some((pano) => pano.nav_node_id === n.id),
      );
      commit({
        ...doc,
        pois: [],
        nodes: keepNodes,
        hotspots: doc.hotspots.filter((h) => !h.poi_id),
      });
      setSelection(null);
      onNotify("Все точки интереса удалены");
    }
  };

  const toolHints: Record<Tool, { title: string; hint: string }> = {
    poi: {
      title: "Точка POI",
      hint: "Кликните на плане в месте, где находится объект (стенд, вход, зал, Wi-Fi). Кликните по существующей точке для её перемещения.",
    },
    main_door: {
      title: "Главная входная дверь (зажатие ЛКМ)",
      hint: "Зажмите ЛКМ на стене и протяните размер двери (автопривязка к сетке). Отпустите ЛКМ для завершения.",
    },
    door: {
      title: "Проход / Дверь (зажатие ЛКМ)",
      hint: "Зажмите ЛКМ на стене или перегородке и протяните ширину прохода (автопривязка к сетке). Отпустите ЛКМ для завершения.",
    },
    window: {
      title: "Окно (зажатие ЛКМ)",
      hint: "Зажмите ЛКМ на стене и протяните размер окна. Отпустите ЛКМ для завершения.",
    },
    wall: {
      title: "Стена",
      hint: "Кликните 1-ю точку (начало), затем 2-ю точку (конец стены).",
    },
    room: {
      title: "Комната",
      hint: "Кликайте по очереди углы помещения, затем нажмите «Завершить фигуру» (или кнопку «+ Готовая комната» ниже).",
    },
    corridor: {
      title: "Коридор",
      hint: "Кликайте по очереди углы коридора, затем нажмите «Завершить фигуру» (или кнопку «+ Готовый коридор» ниже).",
    },
    node: {
      title: "Узел прохода",
      hint: "Кликните на плане для добавления точки графа маршрутизации.",
    },
  };

  const currentHint = tool
    ? toolHints[tool]
    : {
        title: "Режим выбора и перемещения",
        hint: "Кликните на любой объект для настройки свойств или перемещения. Растяните рамку на свободном месте для области выделения.",
      };

  return (
    <section className="plan-editor space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#E31B23]">
              2D Графический редактор
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
              Редактор плана
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={!past.length}
              onClick={() => {
                const previous = past[past.length - 1];
                setPast(past.slice(0, -1));
                setFuture([doc, ...future]);
                emit(previous);
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 transition"
            >
              Отменить правку
            </button>
            <button
              type="button"
              disabled={!future.length}
              onClick={() => {
                setPast([...past, doc]);
                emit(future[0]);
                setFuture(future.slice(1));
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 transition"
            >
              Повторить правку
            </button>
            <button
              type="button"
              onClick={() => void onSaveDocument()}
              className="btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-md transition"
            >
              Сохранить
            </button>
          </div>
        </div>

        {/* Инструменты редактирования */}
        <div className="space-y-3">
          <div className="editor-toolbar">
          <div className="editor-toolbar__label">Инструменты</div>
          <div className="toolbar editor-toolbar__group">
            {Object.entries(tools).map(([value, label]) => {
              const isActive = tool === value;
              return (
                <button
                  type="button"
                  key={value}
                  aria-pressed={isActive}
                  onClick={() => {
                    setTool(isActive ? null : (value as Tool));
                    setPoints([]);
                  }}
                  className="tool-chip"
                  title={label}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={addPresetRoom}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60 transition cursor-pointer"
            >
              + Готовая комната
            </button>
            <button
              type="button"
              onClick={addPresetCorridor}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 transition cursor-pointer"
            >
              + Готовый коридор
            </button>
            <button
              type="button"
              aria-pressed={showGraph}
              onClick={() => setShowGraph(!showGraph)}
              className="tool-chip"
              title="Показать узлы и рёбра маршрутов"
            >
              Маршруты: {showGraph ? "видны" : "скрыты"}
            </button>
            <button
              type="button"
              onClick={() => setSnapToGrid(!snapToGrid)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                snapToGrid
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
              }`}
            >
              Привязка к сетке: {snapToGrid ? "Вкл" : "Выкл"}
            </button>
          </div>
          </div>
        </div>

        {/* Подсказка по активному инструменту */}
        <div
          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          role="status"
        >
          <div className="flex items-center gap-2">
            <span className="font-black text-[#E31B23]">
              {currentHint.title}:
            </span>
            <span>{currentHint.hint}</span>
          </div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Клавиши: [Del] удалить, [Ctrl+C] / [Ctrl+V] копия/вставка, [Ctrl+Z] отмена, [Стрелки] сдвиг, [Пробел] двигать план
          </div>
        </div>

        {/* Очистить точки если есть */}
        {doc.pois.length > 0 && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={clearAllPois}
              title="Очистить все созданные точки POI на плане"
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer"
            >
              Очистить точки ({doc.pois.length})
            </button>
          </div>
        )}

        {/* Импорт плана и масштабирование */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
            <span>Импорт плана (PNG, JPEG, WebP):</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading || !isAuthenticated}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file || !mapId) return;
                setUploading(true);
                try {
                  const asset = await apiClient.uploadAsset(mapId, {
                    kind: "plan",
                    file,
                  });
                  onAsset?.(asset);
                  commit({ ...current.current, background_asset_id: asset.id });
                } catch (e) {
                  onNotify(e instanceof Error ? e.message : "Ошибка импорта");
                } finally {
                  setUploading(false);
                }
              }}
              className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 dark:file:bg-slate-800 dark:file:text-slate-300 hover:file:bg-slate-200 cursor-pointer"
            />
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                title="Уменьшить масштаб (Камера дальше)"
                onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                className="w-7 h-7 flex items-center justify-center font-black rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm transition"
              >
                −
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.25}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-20 sm:w-24 accent-[#FF4900] cursor-pointer"
              />
              <button
                type="button"
                title="Увеличить масштаб (Камера ближе)"
                onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
                className="w-7 h-7 flex items-center justify-center font-black rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm transition"
              >
                +
              </button>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 w-12 text-center select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                title="Сбросить камеру и масштаб к 100%"
                onClick={() => {
                  setZoom(1);
                  if (containerRef.current) {
                    containerRef.current.scrollLeft = 0;
                    containerRef.current.scrollTop = 0;
                  }
                  onNotify("Камера сброшена к 100%");
                }}
                className="px-2 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-orange-600 transition shadow-xs"
              >
                100%
              </button>
              <span className="hidden xl:inline text-[11px] text-slate-400 dark:text-slate-500 font-medium ml-1">
                Камера: Пробел / ПКМ
              </span>
            </div>

            {/* Индикатор масштаба и размера клетчатого поля */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 select-none">
              <span className="text-[#FF4900]">📐</span>
              <span>
                Поле: {scaleM ? `${Math.round(width * scaleM)}×${Math.round(height * scaleM)}м` : `${width}×${height}ед.`}
              </span>
              <span className="text-slate-400">·</span>
              <span>
                Клетка: {scaleM ? `${formatDist(gridStep)} (${gridStep}ед.)` : `${gridStep}ед.`}
              </span>
            </div>
            {(tool === "room" || tool === "corridor") && (
              <button
                type="button"
                disabled={points.length < 3}
                onClick={() => {
                  commit({
                    ...doc,
                    shapes: [...doc.shapes, makeShape(tool, points)],
                  });
                  setPoints([]);
                }}
                className="btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-md transition disabled:opacity-40"
              >
                Завершить фигуру
              </button>
            )}
            {!!points.length && (
              <button
                type="button"
                onClick={() => setPoints([])}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                Сбросить вершины
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SVG Холст с поддержкой панорамирования камеры при масштабе */}
      <div className="plan-sheet">
        <div className="plan-ruler" role="note" aria-label="Масштаб и сетка плана">
          <span>
            {width} × {height} ед.
          </span>
          <span>Сетка {formatDist(gridStep)}</span>
          <span>{scaleM ? `1 ед. = ${scaleM} м` : "Масштаб не задан"}</span>
          <span className="plan-ruler__spacer" />
          <span className="plan-ruler__scale" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i === 3 ? "plan-ruler__tick plan-ruler__tick--end" : "plan-ruler__tick"} />
            ))}
          </span>
          <span>{formatDist(gridStep * 4)}</span>
        </div>
        <div
          ref={containerRef}
          className="plan-scroll overflow-auto max-h-[75vh] bg-slate-50 dark:bg-slate-950 border-0 rounded-none shadow-none relative select-none"
        >
        <svg
          ref={svg}
          data-testid="plan-canvas"
          role="img"
          aria-label="Редактируемый план"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            width: `${zoom * 100}%`,
            aspectRatio: `${width} / ${height}`,
            touchAction: "none",
            cursor:
              draggingId
                ? "grabbing"
                : isSpacePressed
                  ? panDrag.current?.isPanning
                    ? "grabbing"
                    : "grab"
                  : tool === "main_door" || tool === "door" || tool === "window"
                    ? "crosshair"
                    : !tool
                      ? "default"
                      : "crosshair",
          }}
          onClick={click}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerLeave={() => {
            setHoverWallSnap(null);
            if (panDrag.current) panDrag.current = null;
            if (drag.current && didDrag.current) {
              const before = drag.current.document;
              setPast((history) => [...history.slice(-49), before]);
              setFuture([]);
            }
            drag.current = null;
            setDraggingId(null);
          }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.25 : -0.25;
              setZoom((z) => Math.max(1, Math.min(3, Math.round((z + delta) * 100) / 100)));
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <pattern
              id="editor-canvas-grid"
              width={gridStep}
              height={gridStep}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.75"
                className="text-slate-200 dark:text-slate-800"
              />
            </pattern>
          </defs>
          <rect
            width={width}
            height={height}
            className="fill-slate-50 dark:fill-slate-950"
          />
          <rect width={width} height={height} fill="url(#editor-canvas-grid)" />
          {background && (
            <image
              href={background}
              width={width}
              height={height}
              preserveAspectRatio="none"
            />
          )}

          {/* Фигуры / Комнаты / Коридоры / Стены */}
          {doc.shapes.map((shape, shapeIndex) => {
            const isShapeSelected =
              selectedItems.some((s) => s.kind === "shapes" && s.id === shape.id);
            // Architectural sheet: rooms read as tinted zones on paper, not as a colour wheel.
            const roomColors = [
              { fill: "rgba(29, 104, 96, 0.10)", stroke: "#1d6860", text: "#155049" },
              { fill: "rgba(71, 85, 105, 0.09)", stroke: "#475569", text: "#334155" },
              { fill: "rgba(29, 104, 96, 0.06)", stroke: "#3f7d75", text: "#1d6860" },
              { fill: "rgba(120, 113, 108, 0.09)", stroke: "#78716c", text: "#57534e" },
            ];
            const color = roomColors[shapeIndex % roomColors.length];

            // Calculate center of polygon for label
            const avgX =
              shape.points.reduce((s, p) => s + p.x, 0) / shape.points.length;
            const avgY =
              shape.points.reduce((s, p) => s + p.y, 0) / shape.points.length;

            const isDrawingPoly =
              (tool === "room" || tool === "corridor" || tool === "wall") && points.length > 0;

            return (
              <g
                key={shape.id}
                {...selectProps("shapes", shape.id)}
                style={{
                  cursor:
                    draggingId === shape.id
                      ? "grabbing"
                      : isDrawingPoly
                        ? "crosshair"
                        : "move",
                }}
              >
                {shape.kind === "wall" ? (
                  <>
                    <polyline
                      points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={24}
                      strokeLinecap="round"
                    />
                    <polyline
                      points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={isShapeSelected ? "#FF4900" : "#475569"}
                      strokeWidth={isShapeSelected ? 5 : 3.5}
                      strokeLinecap="round"
                    />
                  </>
                ) : (
                  <polygon
                    points={shape.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={
                      shape.kind === "room"
                        ? color.fill
                        : "rgba(100, 116, 139, 0.16)"
                    }
                    stroke={
                      isShapeSelected
                        ? "#FF4900"
                        : shape.kind === "room"
                          ? color.stroke
                          : "#64748b"
                    }
                    strokeWidth={isShapeSelected ? 3 : 2}
                    strokeDasharray={isShapeSelected ? "6 3" : undefined}
                  />
                )}
                {shape.label && (
                  <g transform={`translate(${avgX}, ${avgY})`}>
                    <rect
                      x={-(shape.label.length * 4 + 8)}
                      y={-10}
                      width={shape.label.length * 8 + 16}
                      height={20}
                      rx={6}
                      className="fill-white/80 dark:fill-slate-900/80 stroke-slate-200 dark:stroke-slate-700"
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      y={4}
                      fontSize={11}
                      fontWeight="bold"
                      className="fill-slate-800 dark:fill-slate-100 select-none"
                    >
                      {shape.label}
                    </text>
                  </g>
                )}
                <title>{shape.label || shape.kind}</title>
              </g>
            );
          })}

          {/* Маркеры изменения размера (длина и ширина) для выделенной комнаты или коридора */}
          {(() => {
            if (selectedItems.length !== 1 || selectedItems[0].kind !== "shapes") return null;
            const targetShape = doc.shapes.find((s) => s.id === selectedItems[0].id);
            if (!targetShape || (targetShape.kind !== "room" && targetShape.kind !== "corridor")) return null;
            const bb = boundingBox(targetShape.points);
            if (!bb) return null;
            const minX = bb.min.x;
            const maxX = bb.max.x;
            const minY = bb.min.y;
            const maxY = bb.max.y;
            const midX = Math.round((minX + maxX) / 2);
            const midY = Math.round((minY + maxY) / 2);

            const handles = [
              { id: "nw", x: minX, y: minY, cursor: "nwse-resize", title: "Изменить размер (угол)" },
              { id: "n",  x: midX, y: minY, cursor: "ns-resize",   title: "Изменить длину (сверху)" },
              { id: "ne", x: maxX, y: minY, cursor: "nesw-resize", title: "Изменить размер (угол)" },
              { id: "e",  x: maxX, y: midY, cursor: "ew-resize",   title: "Изменить ширину (справа)" },
              { id: "se", x: maxX, y: maxY, cursor: "nwse-resize", title: "Изменить размер (угол)" },
              { id: "s",  x: midX, y: maxY, cursor: "ns-resize",   title: "Изменить длину (снизу)" },
              { id: "sw", x: minX, y: maxY, cursor: "nesw-resize", title: "Изменить размер (угол)" },
              { id: "w",  x: minX, y: midY, cursor: "ew-resize",   title: "Изменить ширину (слева)" },
            ];

            return (
              <g className="resize-handles-layer">
                {handles.map((h) => (
                  <g
                    key={h.id}
                    transform={`translate(${h.x}, ${h.y})`}
                    style={{ cursor: h.cursor }}
                    onPointerDown={(e) => handleResizePointerDown(h.id, targetShape, e)}
                  >
                    <circle r={12} fill="transparent" />
                    <rect
                      x={-5}
                      y={-5}
                      width={10}
                      height={10}
                      rx={2}
                      className="fill-white stroke-[#FF4900] shadow-sm hover:fill-orange-50 transition-colors"
                      strokeWidth={2}
                    />
                    <title>{h.title}</title>
                  </g>
                ))}
              </g>
            );
          })()}

          {/* Ребра графа проходов */}
          {showGraph && doc.edges.map((edge) => {
            const a = doc.nodes.find((n) => n.id === edge.a),
              b = doc.nodes.find((n) => n.id === edge.b);
            const isEdgeSelected =
              selectedItems.some((s) => s.kind === "edges" && s.id === edge.id);
            // A legacy edge may still cut through a wall; flag it instead of hiding the problem.
            const blocked = a && b ? blockingWalls(doc, a, b).length > 0 : false;
            return a && b ? (
              <g
                key={edge.id}
                {...selectProps("edges", edge.id)}
                style={{ cursor: draggingId === edge.id ? "grabbing" : "move" }}
              >
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={20}
                  strokeLinecap="round"
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={isEdgeSelected ? "#FF4900" : blocked ? "#dc2626" : "#0284c7"}
                  strokeWidth={isEdgeSelected ? 6 : blocked ? 3 : 4}
                  strokeDasharray={blocked ? "6 4" : undefined}
                  strokeLinecap="round"
                />
                {blocked && <title>Ребро пересекает стену — маршрут пойдёт сквозь неё</title>}
              </g>
            ) : null;
          })}

          {/* Узлы графа видны вместе с рёбрами или при активном инструменте */}
          {(showGraph || tool === "node") &&
            doc.nodes.map((node) => {
              const isNodeSelected =
                selectedItems.some((s) => s.kind === "nodes" && s.id === node.id);
              return (
                <g
                  key={node.id}
                  {...selectProps("nodes", node.id)}
                  style={{ cursor: draggingId === node.id ? "grabbing" : "move" }}
                >
                  <circle cx={node.x} cy={node.y} r={16} fill="transparent" />
                  {isNodeSelected && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={12}
                      fill="none"
                      stroke="#FF4900"
                      strokeWidth={2}
                      strokeDasharray="3 2"
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isNodeSelected ? 7 : 5}
                    fill={isNodeSelected ? "#FF4900" : "#0369a1"}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}

          {/* Точки интереса (POIs), Двери, Проходы и Окна */}
          {doc.pois.map((poi) => {
            const isPoiSelected =
              selectedItems.some((s) => s.kind === "pois" && s.id === poi.id);
            const isEntrance = poi.category === "entrance";
            const isDoor = poi.category_label === "Дверь" || poi.title.includes("Дверь") || poi.title.includes("Проход");
            const isWindow = poi.category_label === "Окно" || poi.title.includes("Окно");

            // Parse saved door/window geometry and direction [x1,y1 -> x2,y2 | dir:N]
            const parsed = parseDoorDescription(poi.description);
            const geom =
              parsed?.geom ??
              (isEntrance || isDoor
                ? { x1: poi.x - 20, y1: poi.y, x2: poi.x + 20, y2: poi.y }
                : isWindow
                  ? { x1: poi.x - 20, y1: poi.y, x2: poi.x + 20, y2: poi.y }
                  : null);
            const dir = parsed?.dir ?? 0;

            const baseNormal = geom ? findDoorNormal(geom, doc.shapes) : { x: 0, y: 1 };
            const flipNormal = dir === 1 || dir === 2;
            const swapHinge = dir === 2 || dir === 3;
            const normal = flipNormal
              ? { x: -baseNormal.x, y: -baseNormal.y }
              : baseNormal;
            const p1 = swapHinge && geom ? { x: geom.x2, y: geom.y2 } : { x: geom?.x1 ?? 0, y: geom?.y1 ?? 0 };
            const p2 = swapHinge && geom ? { x: geom.x1, y: geom.y1 } : { x: geom?.x2 ?? 0, y: geom?.y2 ?? 0 };
            const doorGeom = geom ? getDoorGeometry(p1, p2, normal) : null;
            const midX = geom ? Math.round((geom.x1 + geom.x2) / 2) : poi.x;
            const midY = geom ? Math.round((geom.y1 + geom.y2) / 2) : poi.y;

            return (
              <g
                key={poi.id}
                {...selectProps("pois", poi.id)}
                className="group/door"
                style={{ cursor: draggingId === poi.id ? "grabbing" : "move" }}
              >
                {/* Архитектурный проем двери или окна на стене */}
                {geom && doorGeom ? (
                  <g className="door-architecture">
                    {/* Широкая невидимая линия для удобного выбора объекта */}
                    <line
                      x1={geom.x1}
                      y1={geom.y1}
                      x2={geom.x2}
                      y2={geom.y2}
                      stroke="transparent"
                      strokeWidth={24}
                    />
                    <path
                      d={doorGeom.arcD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                    />

                    {/* Вырез в стене */}
                    <line
                      x1={geom.x1}
                      y1={geom.y1}
                      x2={geom.x2}
                      y2={geom.y2}
                      className="stroke-slate-50 dark:stroke-slate-950"
                      strokeWidth={6}
                      strokeLinecap="square"
                    />

                    {isWindow ? (
                      /* Двойная линия остекления для окна */
                      <>
                        <line
                          x1={geom.x1 - normal.x * 2}
                          y1={geom.y1 - normal.y * 2}
                          x2={geom.x2 - normal.x * 2}
                          y2={geom.y2 - normal.y * 2}
                          stroke="#38bdf8"
                          strokeWidth={2}
                        />
                        <line
                          x1={geom.x1 + normal.x * 2}
                          y1={geom.y1 + normal.y * 2}
                          x2={geom.x2 + normal.x * 2}
                          y2={geom.y2 + normal.y * 2}
                          stroke="#bae6fd"
                          strokeWidth={1.5}
                        />
                      </>
                    ) : (
                      /* Дверной проем: коробка, створка и пунктирная дуга хода двери */
                      <>
                        <line
                          x1={doorGeom.post1.x1}
                          y1={doorGeom.post1.y1}
                          x2={doorGeom.post1.x2}
                          y2={doorGeom.post1.y2}
                          stroke={isEntrance ? "#E31B23" : "#d97706"}
                          strokeWidth={2.5}
                        />
                        <line
                          x1={doorGeom.post2.x1}
                          y1={doorGeom.post2.y1}
                          x2={doorGeom.post2.x2}
                          y2={doorGeom.post2.y2}
                          stroke={isEntrance ? "#E31B23" : "#d97706"}
                          strokeWidth={2.5}
                        />
                        <line
                          x1={doorGeom.leafStart.x}
                          y1={doorGeom.leafStart.y}
                          x2={doorGeom.leafTip.x}
                          y2={doorGeom.leafTip.y}
                          stroke={isEntrance ? "#E31B23" : "#d97706"}
                          strokeWidth={2.5}
                        />
                        <path
                          d={doorGeom.arcD}
                          fill="none"
                          stroke={isEntrance ? "#FF4900" : "#f59e0b"}
                          strokeWidth={1.75}
                          strokeDasharray="4 2.5"
                        />

                        {/* Интерактивная стрелочка смены направления: статично в центре проема, появляется при наведении */}
                        <g
                          data-testid="flip-door-arrow"
                          role="button"
                          aria-label="Сменить направление двери"
                          transform={`translate(${midX}, ${midY})`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFlipDoor(poi);
                          }}
                          className="opacity-0 group-hover/door:opacity-100 transition-opacity duration-150 cursor-pointer"
                        >
                          <circle
                            r={10.5}
                            className="fill-slate-900/95 dark:fill-slate-800/95 stroke-[#FF4900] shadow-md"
                            strokeWidth={1.5}
                          />
                          <path
                            d="M -3.5 -2 A 4 4 0 0 1 3.5 -1 L 1.5 -3.5 M 3.5 -1 L 1.5 1 M 3.5 2 A 4 4 0 0 1 -3.5 1 L -1.5 3.5 M -3.5 1 L -1.5 -1"
                            fill="none"
                            stroke="#FF4900"
                            strokeWidth={1.4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <title>Сменить направление (внутрь / наружу / петли)</title>
                        </g>
                      </>
                    )}

                    {/* Акцентная подсветка при выборе */}
                    {isPoiSelected && (
                      <line
                        x1={geom.x1}
                        y1={geom.y1}
                        x2={geom.x2}
                        y2={geom.y2}
                        stroke="#FF4900"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                      />
                    )}
                  </g>
                ) : (tool === "poi" || isPoiSelected) ? (
                  /* Обычная точка POI - отображается только при выборе или режиме POI */
                  <g>
                    <circle cx={poi.x} cy={poi.y} r={18} fill="transparent" />
                    {isPoiSelected && (
                      <circle
                        cx={poi.x}
                        cy={poi.y}
                        r={12}
                        fill="rgba(255, 73, 0, 0.15)"
                        stroke="#FF4900"
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                      />
                    )}
                    <circle
                      cx={poi.x}
                      cy={poi.y}
                      r={isPoiSelected ? 7 : 5}
                      fill={isPoiSelected ? "#FF4900" : "#2563eb"}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    {isPoiSelected && (
                      <g transform={`translate(${poi.x + 10}, ${poi.y - 10})`}>
                        <rect
                          x={-2}
                          y={-1}
                          width={poi.title.length * 7 + 10}
                          height={18}
                          rx={4}
                          className="fill-white/95 dark:fill-slate-900/95 stroke-slate-300 dark:stroke-slate-700"
                          strokeWidth={0.75}
                        />
                        <text
                          x={4}
                          y={12}
                          fontSize={10}
                          fontWeight="bold"
                          className="fill-slate-900 dark:fill-slate-100 select-none"
                        >
                          {poi.title}
                        </text>
                      </g>
                    )}
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* Пунктирная подсветка стены комнаты при наведении инструментом двери */}
          {hoverWallSnap && !doorDraft && (
            <g className="pointer-events-none">
              <line
                x1={hoverWallSnap.segment[0].x}
                y1={hoverWallSnap.segment[0].y}
                x2={hoverWallSnap.segment[1].x}
                y2={hoverWallSnap.segment[1].y}
                stroke="#FF4900"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                opacity={0.65}
              />
            </g>
          )}

          {/* Живой предварительный просмотр зажатия ЛКМ: пунктирная линия привязывается к комнате */}
          {doorDraft && (
            <g className="pointer-events-none">
              {/* Пунктирная линия привязки вдоль стены комнаты */}
              {doorDraft.wallSnap && (
                <line
                  x1={doorDraft.wallSnap.segment[0].x}
                  y1={doorDraft.wallSnap.segment[0].y}
                  x2={doorDraft.wallSnap.segment[1].x}
                  y2={doorDraft.wallSnap.segment[1].y}
                  stroke="#FF4900"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  opacity={0.85}
                />
              )}

              {/* Пунктирная линия проема двери */}
              <line
                x1={doorDraft.start.x}
                y1={doorDraft.start.y}
                x2={doorDraft.current.x}
                y2={doorDraft.current.y}
                stroke={doorDraft.kind === "window" ? "#38bdf8" : "#FF4900"}
                strokeWidth={3.5}
                strokeDasharray="4 2"
              />

              {(() => {
                const normal = doorDraft.wallSnap?.normal || (
                  Math.abs(doorDraft.current.x - doorDraft.start.x) >= Math.abs(doorDraft.current.y - doorDraft.start.y)
                    ? { x: 0, y: 1 }
                    : { x: 1, y: 0 }
                );
                const draftGeom = getDoorGeometry(doorDraft.start, doorDraft.current, normal);
                if (!draftGeom || draftGeom.len < 10) return null;

                if (doorDraft.kind === "window") {
                  return (
                    <>
                      <line
                        x1={doorDraft.start.x - normal.x * 2}
                        y1={doorDraft.start.y - normal.y * 2}
                        x2={doorDraft.current.x - normal.x * 2}
                        y2={doorDraft.current.y - normal.y * 2}
                        stroke="#38bdf8"
                        strokeWidth={2}
                      />
                      <line
                        x1={doorDraft.start.x + normal.x * 2}
                        y1={doorDraft.start.y + normal.y * 2}
                        x2={doorDraft.current.x + normal.x * 2}
                        y2={doorDraft.current.y + normal.y * 2}
                        stroke="#bae6fd"
                        strokeWidth={1.5}
                      />
                    </>
                  );
                }

                return (
                  <>
                    <line
                      x1={draftGeom.post1.x1}
                      y1={draftGeom.post1.y1}
                      x2={draftGeom.post1.x2}
                      y2={draftGeom.post1.y2}
                      stroke="#FF4900"
                      strokeWidth={2.5}
                    />
                    <line
                      x1={draftGeom.post2.x1}
                      y1={draftGeom.post2.y1}
                      x2={draftGeom.post2.x2}
                      y2={draftGeom.post2.y2}
                      stroke="#FF4900"
                      strokeWidth={2.5}
                    />
                    <line
                      x1={draftGeom.leafStart.x}
                      y1={draftGeom.leafStart.y}
                      x2={draftGeom.leafTip.x}
                      y2={draftGeom.leafTip.y}
                      stroke="#FF4900"
                      strokeWidth={2.5}
                    />
                    <path
                      d={draftGeom.arcD}
                      fill="none"
                      stroke="#FF4900"
                      strokeWidth={1.75}
                      strokeDasharray="4 2.5"
                    />
                  </>
                );
              })()}

              {(() => {
                const len = Math.hypot(
                  doorDraft.current.x - doorDraft.start.x,
                  doorDraft.current.y - doorDraft.start.y,
                );
                if (len < 5) return null;
                const midX = (doorDraft.start.x + doorDraft.current.x) / 2;
                const midY = (doorDraft.start.y + doorDraft.current.y) / 2;
                return (
                  <g transform={`translate(${midX}, ${midY - 14})`}>
                    <rect
                      x={-35}
                      y={-10}
                      width={70}
                      height={20}
                      rx={6}
                      className="fill-slate-900/90 dark:fill-slate-100/90 stroke-slate-700 dark:stroke-slate-300"
                      strokeWidth={0.75}
                    />
                    <text
                      textAnchor="middle"
                      y={4}
                      fontSize={11}
                      fontWeight="bold"
                      className="fill-white dark:fill-slate-900"
                    >
                      {formatDist(len)}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}

          {/* Панорамы */}
          {doc.panoramas.map((p) => {
            const isPanoSelected =
              selectedItems.some((s) => s.kind === "panoramas" && s.id === p.id);
            return (
              <g
                key={p.id}
                {...selectProps("panoramas", p.id)}
                style={{ cursor: draggingId === p.id ? "grabbing" : "move" }}
              >
                <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
                {isPanoSelected && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16}
                    fill="none"
                    stroke="#FF4900"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                  />
                )}
                <rect
                  x={p.x - 7}
                  y={p.y - 7}
                  width={14}
                  height={14}
                  rx={3}
                  fill="#7c3aed"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <title>{p.title}</title>
              </g>
            );
          })}

          {/* Рисуемая в данный момент линия/фигура */}
          {points.length > 0 && (
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#e31b23"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}

          {/* Область выделения (Marquee Selection Box) */}
          {marquee && (
            <g className="pointer-events-none">
              <rect
                x={Math.min(marquee.start.x, marquee.current.x)}
                y={Math.min(marquee.start.y, marquee.current.y)}
                width={Math.abs(marquee.current.x - marquee.start.x)}
                height={Math.abs(marquee.current.y - marquee.start.y)}
                fill="rgba(255, 73, 0, 0.14)"
                stroke="#FF4900"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                rx={2}
              />
            </g>
          )}
        </svg>
        </div>
      </div>

      {/* Панель инспектора и управления связями */}
      <div className="editor-details grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Объекты на плане
            </h3>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Выбранный объект
              <select
                aria-label="Выбранный объект"
                value={
                  selectedItems.length === 1
                    ? `${selectedItems[0].kind}:${selectedItems[0].id}`
                    : ""
                }
                onChange={(e) => {
                  if (!e.target.value) {
                    setSelectedItems([]);
                    return;
                  }
                  const [kind, id] = e.target.value.split(":") as [
                    SelectionItem["kind"],
                    string,
                  ];
                  setSelectedItems([{ kind, id }]);
                }}
                className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
              >
                <option value="">
                  {selectedItems.length > 1
                    ? `Выбрано объектов (${selectedItems.length})`
                    : "Выберите объект"}
                </option>
                {(
                  ["shapes", "pois", "nodes", "edges", "panoramas"] as const
                ).flatMap((kind) =>
                  doc[kind].map((item, i) => (
                    <option key={item.id} value={`${kind}:${item.id}`}>
                      {"title" in item
                        ? item.title
                        : "label" in item
                          ? item.label || `${kind} ${i + 1}`
                          : `${kind} ${i + 1}`}
                    </option>
                  )),
                )}
              </select>
            </label>
            <button
              type="button"
              disabled={selectedItems.length === 0}
              onClick={() => {
                if (selectedItems.length > 0) {
                  const count = selectedItems.length;
                  commit(removeMultiSelection(doc, selectedItems));
                  setSelectedItems([]);
                  onNotify(count > 1 ? `Удалено объектов: ${count}` : "Объект удалён");
                }
              }}
              className="w-full px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-xl transition disabled:opacity-40 cursor-pointer"
            >
              {selectedItems.length > 1
                ? `Удалить объекты (${selectedItems.length})`
                : "Удалить объект"}
            </button>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Проход между узлами
            </h3>
            <p className="text-xs text-slate-500">
              Соедините узлы линией прохода для расчета маршрута от входа.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  commit(buildGraphFromDoors(doc));
                  onNotify("Граф построен по дверям и объектам");
                } catch (e) {
                  onNotify((e as Error).message);
                }
              }}
              className="w-full px-4 py-2.5 rounded-xl text-xs font-black bg-[#1D6860] hover:bg-[#155049] text-white shadow-sm transition"
            >
              Собрать граф по дверям
            </button>
            <p className="text-[11px] text-slate-500">
              Расставит узлы в каждом проёме и соединит только те, между которыми нет стены.
              Ручные правки графа ниже сохраняются отдельно.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["От узла", edgeA, setEdgeA],
                  ["К узлу", edgeB, setEdgeB],
                ] as const
              ).map(([label, value, setter]) => (
                <label
                  key={label}
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  {label}
                  <select
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E31B23]/40 focus:border-[#E31B23]"
                  >
                    <option value="">Выберите узел</option>
                    {doc.nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {nodeLabel(doc, node.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  commit(connectNodes(doc, edgeA, edgeB));
                  onNotify("Проход добавлен");
                } catch (e) {
                  onNotify((e as Error).message);
                }
              }}
              className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
            >
              Добавить проход
            </button>
          </div>
        </section>

        {selectedItems.length > 1 ? (
          <section className="inspector bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Выбрано объектов
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-[#FF4900]">
                {selectedItems.length} шт.
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <p>
                Выделено несколько элементов плана ({selectedItems.length} шт.).
              </p>
              <p>
                Вы можете перемещать их вместе стрелками на клавиатуре или перетаскиванием мыши, а также удалить одновременно.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const count = selectedItems.length;
                commit(removeMultiSelection(doc, selectedItems));
                setSelectedItems([]);
                onNotify(`Удалено объектов: ${count}`);
              }}
              className="w-full px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Удалить выбранные объекты ({selectedItems.length})
            </button>
          </section>
        ) : selection ? (
          <Inspector
            doc={doc}
            selection={selection}
            width={width}
            height={height}
            change={commit}
          />
        ) : (
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
            <svg className="w-8 h-8 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Объект не выбран
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs">
              Кликните на любую точку, стену, комнату или узел на плане, чтобы переместить их стрелками или настроить название и категорию.
            </p>
          </div>
        )}
      </div>
      {captureSlot}
    </section>
  );
}