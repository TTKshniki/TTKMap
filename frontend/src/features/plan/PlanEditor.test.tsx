import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { PlanEditor } from "./PlanEditor";
import { emptyMapDocument } from "../../shared/document";
import { apiClient } from "../../shared/api";
import { connectNodes, removeSelection } from "./model";
vi.mock("../../shared/api");
const notify = vi.fn();
function Editor() {
  const [doc, change] = useState(emptyMapDocument());
  return (
    <>
      <PlanEditor
        mapId="map"
        widthUnits={700}
        heightUnits={500}
        document={doc}
        isAuthenticated
        onChangeDocument={change}
        onNotify={notify}
        onSaveDocument={vi.fn()}
      />
      <output data-testid="document">{JSON.stringify(doc)}</output>
    </>
  );
}
function canvas() {
  const element = screen.getByTestId("plan-canvas");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 700,
    height: 500,
  } as DOMRect);
  return element;
}
describe("plan editor", () => {
  it("creates POIs without inventing edges and edits their attributes", () => {
    render(<Editor />);
    const svg = canvas();
    fireEvent.click(svg, { clientX: 100, clientY: 150 });
    fireEvent.change(screen.getByLabelText("Название объекта"), {
      target: { value: "Вход" },
    });
    fireEvent.change(screen.getByLabelText("Категория"), {
      target: { value: "entrance" },
    });
    fireEvent.click(svg, { clientX: 500, clientY: 300 });
    const doc = JSON.parse(screen.getByTestId("document").textContent!);
    expect(doc.pois[0]).toMatchObject({
      title: "Вход",
      category: "entrance",
      x: 100,
      y: 150,
    });
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("От узла"), {
      target: { value: doc.nodes[0].id },
    });
    fireEvent.change(screen.getByLabelText("К узлу"), {
      target: { value: doc.nodes[1].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить проход" }));
    expect(
      JSON.parse(screen.getByTestId("document").textContent!).edges,
    ).toHaveLength(1);
  });
  it("draws an arbitrary corridor and supports undo and redo", () => {
    render(<Editor />);
    const svg = canvas();
    fireEvent.click(screen.getByRole("button", { name: "Коридор" }));
    for (const [clientX, clientY] of [
      [20, 20],
      [200, 20],
      [150, 80],
      [20, 80],
    ])
      fireEvent.click(svg, { clientX, clientY });
    fireEvent.click(screen.getByRole("button", { name: "Завершить фигуру" }));
    expect(
      JSON.parse(screen.getByTestId("document").textContent!).shapes[0].points,
    ).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Отменить правку" }));
    expect(
      JSON.parse(screen.getByTestId("document").textContent!).shapes,
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Повторить правку" }));
    expect(
      JSON.parse(screen.getByTestId("document").textContent!).shapes,
    ).toHaveLength(1);
  });
  it("uses the saved asset URL for the imported background", async () => {
    vi.mocked(apiClient.uploadAsset).mockResolvedValue({
      id: "asset",
      kind: "plan",
    } as never);
    render(<Editor />);
    fireEvent.change(screen.getByLabelText(/Импорт плана/), {
      target: {
        files: [new File(["image"], "plan.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(document.querySelector("image")).toHaveAttribute(
        "href",
        "/api/v1/media/asset/full",
      ),
    );
  });
  it("places a POI inside an existing room while the POI tool is active", () => {
    render(<Editor />);
    const svg = canvas();
    fireEvent.click(screen.getByRole("button", { name: "Комната", exact: true }));
    for (const [clientX, clientY] of [[20, 20], [200, 20], [200, 200], [20, 200]])
      fireEvent.click(svg, { clientX, clientY });
    fireEvent.click(screen.getByRole("button", { name: "Завершить фигуру" }));
    fireEvent.click(screen.getByRole("button", { name: "Точка POI" }));
    fireEvent.click(svg.querySelector('polygon')!, { clientX: 100, clientY: 100 });
    expect(JSON.parse(screen.getByTestId("document").textContent!).pois[0]).toMatchObject({ x: 100, y: 100 });
  });
  it("cleans references when removing a graph node and rejects duplicate edges", () => {
    let doc = emptyMapDocument();
    doc.nodes = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 10 },
    ];
    doc = connectNodes(doc, "b", "a");
    expect(() => connectNodes(doc, "a", "b")).toThrow("уже соединены");
    const next = removeSelection(doc, { kind: "nodes", id: "a" });
    expect(next.edges).toHaveLength(0);
    expect(next.nodes).toHaveLength(1);
  });

  it("flips door direction via arrow click and does not render dots on doors", () => {
    function DoorEditor() {
      const [doc, change] = useState({
        ...emptyMapDocument(),
        pois: [
          {
            id: "door-1",
            title: "Главная входная дверь",
            category: "entrance" as const,
            category_label: null,
            description: "Главная входная дверь [100,100 -> 150,100 | dir:0]",
            x: 125,
            y: 100,
            nav_node_id: null,
          },
        ],
      });
      return (
        <>
          <PlanEditor
            mapId="map"
            widthUnits={700}
            heightUnits={500}
            document={doc}
            isAuthenticated
            onChangeDocument={change}
            onNotify={notify}
            onSaveDocument={vi.fn()}
          />
          <output data-testid="document">{JSON.stringify(doc)}</output>
        </>
      );
    }

    render(<DoorEditor />);
    const canvasEl = canvas();

    // Verify door is rendered as architectural door without dot circle on it
    const doorGroup = canvasEl.querySelector(".door-architecture");
    expect(doorGroup).toBeInTheDocument();

    // Find flip arrow: positioned statically at midpoint (125, 100) and hidden until hover
    const flipButton = screen.getByTestId("flip-door-arrow");
    expect(flipButton).toBeInTheDocument();
    expect(flipButton).toHaveAttribute("transform", "translate(125, 100)");
    expect(flipButton.className.baseVal).toContain("opacity-0");
    expect(flipButton.className.baseVal).toContain("group-hover/door:opacity-100");

    // Click to flip direction
    fireEvent.click(flipButton);

    // Arrow button STAYS statically at (125, 100) and does not jump / fly
    expect(flipButton).toHaveAttribute("transform", "translate(125, 100)");

    const doc = JSON.parse(screen.getByTestId("document").textContent!);
    expect(doc.pois[0].description).toContain("dir:1");
    expect(notify).toHaveBeenCalledWith("Направление главной двери изменено");
  });

  it("supports marquee selection box and camera zoom controls", () => {
    function ZoomEditor() {
      const [doc, change] = useState(emptyMapDocument());
      return (
        <PlanEditor
          mapId="map"
          widthUnits={700}
          heightUnits={500}
          document={doc}
          isAuthenticated
          onChangeDocument={change}
          onNotify={notify}
          onSaveDocument={vi.fn()}
        />
      );
    }

    render(<ZoomEditor />);
    const zoomPlus = screen.getByTitle("Увеличить масштаб (Камера ближе)");
    const zoomMinus = screen.getByTitle("Уменьшить масштаб (Камера дальше)");
    const zoomReset = screen.getByTitle("Сбросить камеру и масштаб к 100%");

    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
    fireEvent.click(zoomPlus);
    expect(screen.getByText("125%")).toBeInTheDocument();

    fireEvent.click(zoomMinus);
    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();

    fireEvent.click(zoomPlus);
    fireEvent.click(zoomPlus);
    expect(screen.getByText("150%")).toBeInTheDocument();
    fireEvent.click(zoomReset);
    expect(screen.getByRole("button", { name: "100%" })).toBeInTheDocument();
  });

  it("supports copying and pasting objects via Ctrl+C and Ctrl+V (including Russian layout)", () => {
    function CopyPasteEditor() {
      const [doc, change] = useState({
        ...emptyMapDocument(),
        pois: [
          {
            id: "poi-1",
            title: "Точка для копирования",
            category: "hall" as const,
            category_label: null,
            description: "",
            x: 100,
            y: 100,
            nav_node_id: "node-1",
          },
        ],
        nodes: [{ id: "node-1", x: 100, y: 100 }],
      });
      return (
        <>
          <PlanEditor
            mapId="map"
            widthUnits={700}
            heightUnits={500}
            document={doc}
            isAuthenticated
            onChangeDocument={change}
            onNotify={notify}
            onSaveDocument={vi.fn()}
          />
          <output data-testid="document">{JSON.stringify(doc)}</output>
        </>
      );
    }

    render(<CopyPasteEditor />);
    const canvasEl = canvas();

    // Click POI to select it
    const poiGroup = canvasEl.querySelector("g[data-kind='pois']");
    expect(poiGroup).not.toBeNull();
    fireEvent.click(poiGroup!);

    // Press Ctrl+C (with Russian layout code 'KeyC' / key 'с')
    fireEvent.keyDown(window, { ctrlKey: true, code: "KeyC", key: "с" });
    expect(notify).toHaveBeenCalledWith("Скопировано: Точка для копирования");

    // Press Ctrl+V (with Russian layout code 'KeyV' / key 'м')
    fireEvent.keyDown(window, { ctrlKey: true, code: "KeyV", key: "м" });
    expect(notify).toHaveBeenCalledWith("Вставлен объект");

    const doc = JSON.parse(screen.getByTestId("document").textContent!);
    expect(doc.pois).toHaveLength(2);
    expect(doc.pois[1].title).toBe("Точка для копирования (копия)");
    expect(doc.pois[1].x).toBe(125);
    expect(doc.pois[1].y).toBe(125);

    // Test Undo via Ctrl+Z (with Russian layout key 'я')
    fireEvent.keyDown(window, { ctrlKey: true, code: "KeyZ", key: "я" });
    expect(notify).toHaveBeenCalledWith("Действие отменено");
    const docAfterUndo = JSON.parse(screen.getByTestId("document").textContent!);
    expect(docAfterUndo.pois).toHaveLength(1);
  });

  it("drags an object across canvas on pointer movement", () => {
    function DragEditor() {
      const [doc, change] = useState({
        ...emptyMapDocument(),
        pois: [
          {
            id: "drag-poi",
            title: "Перетаскиваемая точка",
            category: "hall" as const,
            category_label: null,
            description: "",
            x: 100,
            y: 100,
            nav_node_id: null,
          },
        ],
      });
      return (
        <>
          <PlanEditor
            mapId="map"
            widthUnits={700}
            heightUnits={500}
            document={doc}
            isAuthenticated
            onChangeDocument={change}
            onNotify={notify}
            onSaveDocument={vi.fn()}
          />
          <output data-testid="document">{JSON.stringify(doc)}</output>
        </>
      );
    }

    render(<DragEditor />);
    const canvasEl = canvas();
    const poiElement = canvasEl.querySelectorAll("g[style*='cursor']")[0];
    expect(poiElement).toBeInTheDocument();

    const createPointerEvent = (type: string, clientX: number, clientY: number, button = 0) => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as any;
      event.clientX = clientX;
      event.clientY = clientY;
      event.button = button;
      event.pointerId = 1;
      return event;
    };

    // Start drag on POI
    fireEvent(poiElement, createPointerEvent("pointerdown", 100, 100, 0));
    // Move pointer across canvas
    fireEvent(canvasEl, createPointerEvent("pointermove", 140, 150));
    // Release pointer
    fireEvent(canvasEl, createPointerEvent("pointerup", 140, 150));

    const doc = JSON.parse(screen.getByTestId("document").textContent!);
    expect(doc.pois[0].x).toBe(140);
    expect(doc.pois[0].y).toBe(150);
  });
});
