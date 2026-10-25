import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Shape } from '../../../../CONTRACTS/types';
import type { VisitorPanorama, VisitorPoi } from '../visitor/model';
import { Icon } from '../../shared/Icon';
import './isometric.css';

export interface IsometricViewerProps {
  modelUrl?: string | null;
  widthUnits: number;
  heightUnits: number;
  scaleMPerUnit?: number | null;
  shapes: Shape[];
  pois: VisitorPoi[];
  panoramas: VisitorPanorama[];
  routePolyline?: Array<{ x: number; y: number }> | null;
  selectedPoiId?: string | null;
  compact?: boolean;
  onSelectPoi: (poi: VisitorPoi) => void;
  onOpenPanorama: (panorama: VisitorPanorama) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

type Marker = { id: string; x: number; y: number; kind: 'poi' | 'panorama'; title: string };

const COLORS: Record<Shape['kind'], number> = {
  room: 0x2d8177,
  corridor: 0xa6b9b2,
  wall: 0x203c3c,
};

function addFallbackGeometry(target: THREE.Group, shapes: Shape[], width: number, height: number, scale: number) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(width * scale, 1), 0.12, Math.max(height * scale, 1)),
    new THREE.MeshStandardMaterial({ color: 0xe7ece9, roughness: 0.9 }),
  );
  floor.position.set((width * scale) / 2, -0.06, (height * scale) / 2);
  target.add(floor);

  for (const shape of shapes) {
    if (shape.points.length < 2) continue;
    const color = COLORS[shape.kind];
    if (shape.kind === 'wall') {
      for (let index = 1; index < shape.points.length; index += 1) {
        const a = shape.points[index - 1];
        const b = shape.points[index];
        const ax = a.x * scale;
        const az = a.y * scale;
        const bx = b.x * scale;
        const bz = b.y * scale;
        const length = Math.hypot(bx - ax, bz - az);
        if (length < 0.001) continue;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(length, shape.height_m ?? 3, 0.15),
          new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
        );
        wall.position.set((ax + bx) / 2, (shape.height_m ?? 3) / 2, (az + bz) / 2);
        wall.rotation.y = -Math.atan2(bz - az, bx - ax);
        target.add(wall);
      }
      continue;
    }

    const polygon = new THREE.Shape();
    shape.points.forEach((point, index) => {
      const x = point.x * scale;
      const y = -point.y * scale;
      if (index === 0) polygon.moveTo(x, y);
      else polygon.lineTo(x, y);
    });
    polygon.closePath();
    const mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(polygon, { depth: 0.08, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: shape.kind === 'corridor' ? 0.72 : 0.82,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    target.add(mesh);
  }
}

function addRoute(target: THREE.Group, points: Array<{ x: number; y: number }>, scale: number, offset: THREE.Vector3) {
  if (points.length < 2) return;
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((point) => new THREE.Vector3(point.x * scale + offset.x, 0.28 + offset.y, point.y * scale + offset.z)),
  );
  const route = new THREE.Line(
    geometry,
    new THREE.LineDashedMaterial({ color: 0xe31b23, dashSize: 0.35, gapSize: 0.2 }),
  );
  route.computeLineDistances();
  target.add(route);
}

function makeMarkerWorldPosition(marker: Marker, scale: number, offset: THREE.Vector3) {
  return new THREE.Vector3(marker.x * scale + offset.x, 0.45 + offset.y, marker.y * scale + offset.z);
}

export const IsometricViewerCanvas: React.FC<IsometricViewerProps> = ({
  modelUrl,
  widthUnits,
  heightUnits,
  scaleMPerUnit,
  shapes,
  pois,
  panoramas,
  routePolyline = null,
  selectedPoiId = null,
  compact = false,
  onSelectPoi,
  onOpenPanorama,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [error, setError] = useState<string | null>(null);
  const scale = scaleMPerUnit && scaleMPerUnit > 0 ? scaleMPerUnit : 1;
  const markers = useMemo<Marker[]>(
    () => [
      ...pois.map((poi) => ({ id: `poi:${poi.id}`, x: poi.x, y: poi.y, kind: 'poi' as const, title: poi.title })),
      ...panoramas.map((panorama) => ({
        id: `panorama:${panorama.id}`,
        x: panorama.x,
        y: panorama.y,
        kind: 'panorama' as const,
        title: panorama.title,
      })),
    ],
    [panoramas, pois],
  );

  useEffect(() => {
    const host = canvasHostRef.current;
    const viewport = viewportRef.current;
    if (!host || !viewport) return;

    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      setStatus('fallback');
      setError(null);
      return;
    }

    let disposed = false;
    let frame = 0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f6f4);
    const world = new THREE.Group();
    const routeLayer = new THREE.Group();
    scene.add(world, routeLayer);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatus('fallback');
      setError('WebGL недоступен — показана локальная изометрическая модель.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xf3f6f4, 1);
    renderer.domElement.setAttribute('aria-label', 'Изометрическая 3D-карта');
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x78908b, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(20, 35, 15);
    scene.add(sun);

    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 10000);
    cameraRef.current = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minZoom = 0.45;
    controls.maxZoom = 4;
    controls.rotateSpeed = 0.55;
    const offset = new THREE.Vector3();

    const fitCamera = () => {
      const box = new THREE.Box3().setFromObject(world);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.y, size.z, 1);
      const aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      camera.near = 0.1;
      camera.far = span * 30;
      camera.position.set(center.x + span * 1.25, center.y + span * 1.15, center.z + span * 1.25);
      camera.lookAt(center);
      controls.target.copy(center);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    };

    const buildFallback = () => {
      if (disposed) return;
      addFallbackGeometry(world, shapes, widthUnits, heightUnits, scale);
      offset.set(-(widthUnits * scale) / 2, 0, -(heightUnits * scale) / 2);
      world.position.copy(offset);
      addRoute(routeLayer, routePolyline ?? [], scale, offset);
      fitCamera();
      setStatus('fallback');
    };

    if (modelUrl) {
      setStatus('loading');
      setError(null);
      new GLTFLoader().load(
        modelUrl,
        (gltf) => {
          if (disposed) return;
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          offset.set(-center.x, -box.min.y, -center.z);
          world.add(gltf.scene);
          world.position.copy(offset);
          addRoute(routeLayer, routePolyline ?? [], scale, offset);
          fitCamera();
          setStatus('ready');
        },
        undefined,
        () => {
          if (!disposed) {
            setError('Серверная GLB-модель недоступна — показана локальная изометрическая модель.');
            buildFallback();
          }
        },
      );
    } else {
      buildFallback();
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const span = Math.max(camera.right - camera.left, camera.top - camera.bottom) / 2;
      const aspect = width / height;
      camera.left = -span * aspect;
      camera.right = span * aspect;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = () => {
      if (disposed) return;
      controls.update();
      const width = host.clientWidth;
      const height = host.clientHeight;
      for (const marker of markers) {
        const element = markerRefs.current.get(marker.id);
        if (!element || !width || !height) continue;
        const projected = makeMarkerWorldPosition(marker, scale, offset).project(camera);
        const visible = projected.z > -1 && projected.z < 1;
        element.style.display = visible ? 'inline-flex' : 'none';
        if (visible) {
          element.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
          element.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
        }
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      cameraRef.current = null;
      world.clear();
      routeLayer.clear();
    };
  }, [heightUnits, modelUrl, markers, routePolyline, scale, shapes, widthUnits]);

  useEffect(() => {
    for (const element of markerRefs.current.values()) {
      element.classList.toggle('is-selected', element.dataset.poiId === selectedPoiId);
    }
  }, [selectedPoiId]);

  const changeZoom = (amount: number) => {
    if (!cameraRef.current) {
      if (amount > 0) onZoomIn?.();
      else onZoomOut?.();
      return;
    }
    cameraRef.current.zoom = Math.max(.45, Math.min(4, cameraRef.current.zoom + amount));
    cameraRef.current.updateProjectionMatrix();
  };

  const resetZoom = () => {
    if (cameraRef.current) {
      cameraRef.current.zoom = 1;
      cameraRef.current.updateProjectionMatrix();
    }
    onResetZoom?.();
  };

  return (
    <div className={`ttk-isometric ${compact ? 'ttk-isometric--compact' : ''}`} data-testid="isometric-plan">
      <div className="ttk-isometric__toolbar">
        <span className="ttk-isometric__badge">
          <Icon name="cube" className="w-3.5 h-3.5" />
          {status === 'fallback' ? 'Локальная изометрия' : 'Изометрическая 3D-карта'}
        </span>
        {!compact && (
          <div className="ttk-isometric__zoom">
            <button type="button" onClick={() => changeZoom(-.2)} aria-label="Отдалить план" title="Отдалить">
              <Icon name="zoom-out" className="w-4 h-4" />
            </button>
            <button type="button" onClick={resetZoom} aria-label="Сбросить масштаб" title="Сбросить">
              <Icon name="maximize-2" className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => changeZoom(.2)} aria-label="Приблизить план" title="Приблизить">
              <Icon name="zoom-in" className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {error && <div className="ttk-isometric__notice" role="status">{error}</div>}
      <div ref={viewportRef} className="ttk-isometric__viewport">
        <div ref={canvasHostRef} className="ttk-isometric__canvas" />
        {routePolyline && routePolyline.length >= 2 && (
          <svg className="ttk-isometric__route-fallback" data-testid="route-polyline" viewBox={`0 0 ${widthUnits} ${heightUnits}`} aria-hidden="true">
            <polyline points={routePolyline.map((point) => `${point.x},${point.y}`).join(' ')} />
          </svg>
        )}
        <div className="ttk-isometric__markers" aria-label="Объекты на 3D-карте">
          {markers.map((marker) => {
            const poi = marker.kind === 'poi' ? pois.find((item) => item.id === marker.id.replace('poi:', '')) : null;
            const panorama = marker.kind === 'panorama' ? panoramas.find((item) => item.id === marker.id.replace('panorama:', '')) : null;
            return (
              <button
                key={marker.id}
                ref={(element) => {
                  if (element) markerRefs.current.set(marker.id, element);
                  else markerRefs.current.delete(marker.id);
                }}
                type="button"
                data-poi-id={poi?.id}
                className={`ttk-isometric__marker ttk-isometric__marker--${marker.kind}`}
                style={{ left: `${(marker.x / widthUnits) * 100}%`, top: `${(marker.y / heightUnits) * 100}%` }}
                onClick={() => {
                  if (poi) onSelectPoi(poi);
                  if (panorama) onOpenPanorama(panorama);
                }}
                aria-label={poi ? `3D-объект: ${poi.title}` : `360° в 3D: ${panorama?.title ?? marker.title}`}
                title={marker.title}
              >
                <span />
              </button>
            );
          })}
        </div>
        {status === 'loading' && <div className="ttk-isometric__loading" role="status">Загружаем 3D-модель…</div>}
      </div>
      <p className="ttk-isometric__hint">Поворачивайте карту жестом или мышью · колёсико меняет масштаб</p>
    </div>
  );
};
