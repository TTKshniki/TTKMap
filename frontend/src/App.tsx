import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Hotspot,
  MapDocument,
  MapSummary,
  OrganizerMap,
  Panorama,
  PublicMap,
  RouteResponse,
} from '../../CONTRACTS/types';
import {
  AdminView,
  AuthView,
  CabinetView,
  UserProfile,
} from './features/organizer';
import { PanoramaViewer } from './features/panorama';
import { MapNavigationView, PublicSpacePage, SpacesHeroView } from './features/visitor';
import { apiClient, ApiClientError } from './shared/api';
import { Icon } from './shared/Icon';
import {
  i18n,
  initialSpacesData,
  Lang,
  mergePublicMapIntoSpace,
  RichPoiItem,
  SLUG_TO_SPACE_KEY,
  SPACE_KEY_TO_SLUG,
  SpaceDefinition,
} from './shared/spacesData';

type ViewMode = 'spaces' | 'map' | 'cabinet' | 'admin' | 'auth';

function createFallbackDocument(space: SpaceDefinition): MapDocument {
  return {
    title: space.name,
    description: space.desc,
    is_published: true,
    scale_m_per_unit: 0.05,
    max_walk_gap_units: 80,
    background_asset_id: null,
    shapes: [
      {
        id: '00000000-0000-4000-8000-000000001001',
        kind: 'room',
        label: 'Зона ресепшн',
        points: [
          { x: 40, y: 40 },
          { x: 220, y: 40 },
          { x: 220, y: 460 },
          { x: 40, y: 460 },
        ],
      },
      {
        id: '00000000-0000-4000-8000-000000001002',
        kind: 'room',
        label: 'Переговорная Альфа',
        points: [
          { x: 220, y: 40 },
          { x: 480, y: 40 },
          { x: 480, y: 250 },
          { x: 220, y: 250 },
        ],
      },
    ],
    nodes: space.pois.map((p) => ({
      id: p.navNodeId || p.id,
      x: p.planX,
      y: p.planY,
    })),
    edges:
      space.pois.length >= 2
        ? space.pois.slice(0, -1).map((p, idx) => {
            const next = space.pois[idx + 1];
            return {
              id: `00000000-0000-4000-8000-00000000300${idx + 1}`,
              a: p.navNodeId || p.id,
              b: next.navNodeId || next.id,
            };
          })
        : [],
    pois: space.pois.map((p) => ({
      id: p.id,
      title: p.name,
      category: p.category,
      category_label: p.category === 'custom' ? p.categoryName : null,
      description: p.description,
      x: p.planX,
      y: p.planY,
      nav_node_id: p.navNodeId || p.id,
    })),
    panoramas: [],
    hotspots: [],
  };
}

export function App() {
  // Detect initial URL route (/edit, /m/:slug, /embed/:slug)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isEmbedRoute = pathname.startsWith('/embed/');
  const initialSlugFromUrl = pathname.startsWith('/m/')
    ? pathname.slice(3).split('/')[0]
    : pathname.startsWith('/embed/')
      ? pathname.slice(7).split('/')[0]
      : null;
  const initialSpaceFromSlug =
    initialSlugFromUrl && SLUG_TO_SPACE_KEY[initialSlugFromUrl]
      ? SLUG_TO_SPACE_KEY[initialSlugFromUrl]
      : 'plaza';

  const [currentView, setCurrentView] = useState<ViewMode>(
    pathname.startsWith('/edit') ? 'admin' : initialSlugFromUrl ? 'map' : 'spaces',
  );
  const [lang, setLang] = useState<Lang>('ru');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Spaces & Public Map Snapshots
  const [spaceList] = useState<string[]>(['plaza', 'expo', 'hotel', 'hub']);
  const [carouselIndex, setCarouselIndex] = useState<number>(0);
  const [currentSpaceKey, setCurrentSpaceKey] = useState<string>(initialSpaceFromSlug);
  const [spacesData, setSpacesData] = useState<Record<string, SpaceDefinition>>(initialSpacesData);
  const [publicSnapshots, setPublicSnapshots] = useState<Record<string, PublicMap>>({});

  // Top Search & Offline Mode State
  const [topSearchQuery, setTopSearchQuery] = useState<string>('');
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  // Map Navigation State
  const [activeBuilding, setActiveBuilding] = useState<string>('A');
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedPoi, setSelectedPoi] = useState<RichPoiItem | null>(
    initialSpacesData[initialSpaceFromSlug]?.pois[0] ?? null,
  );
  const [routeActive, setRouteActive] = useState<boolean>(true);
  const [routeFrom, setRouteFrom] = useState<string>('');
  const [routeTo, setRouteTo] = useState<string>('');
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null);
  const [walkStepIndex, setWalkStepIndex] = useState<number>(0);

  // Favorites
  const [favorites, setFavorites] = useState<string[]>([
    'plaza',
    'expo',
    '00000000-0000-4000-8000-000000004001',
    '00000000-0000-4000-8000-000000004002',
    '101',
    '102',
  ]);

  // Auth & Organizer State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isBackendOrganizer, setIsBackendOrganizer] = useState<boolean>(false);
  const [ownedMaps, setOwnedMaps] = useState<MapSummary[]>([]);
  const [organizerMap, setOrganizerMap] = useState<OrganizerMap | null>(null);
  const [editorDoc, setEditorDoc] = useState<MapDocument>(() =>
    createFallbackDocument(initialSpacesData[initialSpaceFromSlug]),
  );
  const [versionConflictRevision, setVersionConflictRevision] = useState<number | null>(null);

  // Modals & Notifications
  const [adminPasswordModalOpen, setAdminPasswordModalOpen] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [photoSearchModalOpen, setPhotoSearchModalOpen] = useState<boolean>(false);
  const [panoramaModalOpen, setPanoramaModalOpen] = useState<boolean>(false);
  const [activePanoramaPoi, setActivePanoramaPoi] = useState<RichPoiItem | null>(null);
  const [activePanoramaObj, setActivePanoramaObj] = useState<Panorama | null>(null);
  const [panoInitialYaw, setPanoInitialYaw] = useState<number>(0);
  const [panoEditable, setPanoEditable] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const [notificationText, setNotificationText] = useState<string>('');

  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const notifyTimerRef = useRef<number | null>(null);
  const publicEtagsRef = useRef<Record<string, string>>({});

  const currentSpace = spacesData[currentSpaceKey] || spacesData.plaza;
  const currentPublicSnapshot = publicSnapshots[currentSpaceKey] || null;
  const t = i18n[lang];

  const showNotification = useCallback((message: string) => {
    setNotificationText(message);
    setNotificationOpen(true);
    if (notifyTimerRef.current) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => {
      setNotificationOpen(false);
    }, 3000);
  }, []);

  // Online / Offline event listeners
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      showNotification(lang === 'ru' ? 'Онлайн-режим восстановлен' : 'Online mode restored');
    };
    const onOffline = () => {
      setIsOffline(true);
      showNotification(
        lang === 'ru' ? 'Включен офлайн-режим (Кэш)' : 'Offline mode enabled (Cache)',
      );
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [lang, showNotification]);

  // Sync dark mode class on <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Sync public maps from backend API (initial + polling every 15s + visibilitychange)
  const syncPublicMaps = useCallback(async () => {
    const keys = Object.keys(SPACE_KEY_TO_SLUG);
    for (const key of keys) {
      const slug = SPACE_KEY_TO_SLUG[key];
      try {
        const res = await apiClient.getPublicMap(slug, publicEtagsRef.current[slug]);
        if (res.etag) {
          publicEtagsRef.current[slug] = res.etag;
        }
        if (res.status === 200 && res.map) {
          const snapshot = res.map;
          setPublicSnapshots((prev) => ({ ...prev, [key]: snapshot }));
          setSpacesData((prev) => {
            const base = prev[key] || initialSpacesData[key];
            if (!base) return prev;
            return {
              ...prev,
              [key]: mergePublicMapIntoSpace(snapshot, base),
            };
          });
        }
      } catch {
        // Offline or unpublished — keep local space data
      }
    }
  }, []);

  useEffect(() => {
    // A public link (/m/:slug, /embed/:slug) renders PublicSpacePage and loads
    // its own snapshot, so the demo carousel does not poll the API.
    if (initialSlugFromUrl) return;
    void syncPublicMaps();
    const interval = window.setInterval(() => {
      void syncPublicMaps();
    }, 15000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncPublicMaps();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [syncPublicMaps]);

  // Load owned maps when authenticated with backend
  const loadOrganizerMaps = useCallback(async (preferredMapId?: string) => {
    try {
      const items = await apiClient.listMaps();
      setOwnedMaps(items);
      const targetId = preferredMapId || items[0]?.id;
      if (targetId) {
        const { map: fullMap } = await apiClient.getMap(targetId);
        setOrganizerMap(fullMap);
        setEditorDoc(fullMap.snapshot.document);
        setVersionConflictRevision(null);
      }
    } catch {
      // Ignore if not logged in as backend organizer
    }
  }, []);

  // Check active session on mount
  useEffect(() => {
    if (initialSlugFromUrl) return;
    apiClient
      .session()
      .then((sess) => {
        setUser({
          id: sess.user.id,
          name: 'Алексей Шереметьев',
          email: sess.user.email,
          role: 'Организатор ТТК',
          isAdmin: true,
        });
        setIsBackendOrganizer(true);
        void loadOrganizerMaps();
      })
      .catch(() => {
        // Not logged in initially
      });
  }, [loadOrganizerMaps]);

  // Keep selectedPoi valid when space changes
  useEffect(() => {
    const space = spacesData[currentSpaceKey];
    if (!space) return;
    setSelectedPoi((prev) => {
      if (prev && space.pois.some((p) => p.id === prev.id)) {
        const matched = space.pois.find((p) => p.id === prev.id);
        if (
          matched &&
          matched.name === prev.name &&
          matched.x === prev.x &&
          matched.y === prev.y &&
          matched.floor === prev.floor &&
          matched.building === prev.building
        ) {
          return prev;
        }
        return matched || space.pois[0] || null;
      }
      return space.pois[0] || null;
    });
    if (!isBackendOrganizer) {
      const snap = publicSnapshots[currentSpaceKey];
      if (snap) {
        setEditorDoc(snap.document);
      } else {
        setEditorDoc(createFallbackDocument(space));
      }
    }
  }, [currentSpaceKey, spacesData, publicSnapshots, isBackendOrganizer]);

  const switchLanguage = (newLang: Lang) => {
    setLang(newLang);
    showNotification(newLang === 'ru' ? 'Язык изменен на Русский' : 'Language switched to English');
  };

  const toggleDarkMode = () => {
    setDarkMode((d) => !d);
  };

  const toggleOfflineMode = () => {
    setIsOffline((prev) => {
      const next = !prev;
      showNotification(
        next
          ? lang === 'ru'
            ? 'Активирован автономный режим (Кэш)'
            : 'Offline cache mode active'
          : lang === 'ru'
            ? 'Подключение к серверу активно'
            : 'Online connection active',
      );
      return next;
    });
  };

  const executeTopSearch = () => {
    const query = topSearchQuery.trim().toLowerCase();
    if (!query) return;

    for (const key of spaceList) {
      const sp = spacesData[key];
      if (!sp) continue;
      if (
        sp.name.toLowerCase().includes(query) ||
        (sp.nameEn && sp.nameEn.toLowerCase().includes(query)) ||
        sp.desc.toLowerCase().includes(query) ||
        (sp.descEn && sp.descEn.toLowerCase().includes(query))
      ) {
        selectSpace(key);
        showNotification(
          (lang === 'ru' ? 'Найдено пространство: ' : 'Space found: ') +
            (lang === 'en' && sp.nameEn ? sp.nameEn : sp.name),
        );
        return;
      }
      for (const poi of sp.pois) {
        if (
          poi.name.toLowerCase().includes(query) ||
          (poi.nameEn && poi.nameEn.toLowerCase().includes(query)) ||
          poi.equipment.toLowerCase().includes(query)
        ) {
          setCurrentSpaceKey(key);
          setActiveBuilding(poi.building);
          setActiveFloor(poi.floor);
          setSelectedPoi(poi);
          setCurrentView('map');
          showNotification(
            (lang === 'ru' ? 'Найден объект: ' : 'POI found: ') +
              (lang === 'en' && poi.nameEn ? poi.nameEn : poi.name),
          );
          return;
        }
      }
    }
    showNotification(
      lang === 'ru' ? 'По вашему запросу ничего не найдено' : 'No matching objects found',
    );
  };

  const attemptAdminAccess = () => {
    if (isBackendOrganizer || (user && user.isAdmin)) {
      setCurrentView('admin');
    } else {
      setAdminPasswordInput('');
      setAdminPasswordModalOpen(true);
    }
  };

  const verifyAdminPassword = () => {
    if (adminPasswordInput === 'admin2026') {
      setUser({
        name: 'Администратор ТТК',
        email: 'admin@ttk.ru',
        role: 'Главный инженер разметки',
        isAdmin: true,
      });
      setAdminPasswordModalOpen(false);
      setCurrentView('admin');
      showNotification(lang === 'ru' ? 'Доступ разрешен' : 'Access granted');
    } else {
      showNotification(lang === 'ru' ? 'Неверный пароль! (Подсказка: admin2026)' : 'Invalid password!');
    }
  };

  const prevSpace = () => {
    const nextIdx = (carouselIndex - 1 + spaceList.length) % spaceList.length;
    setCarouselIndex(nextIdx);
    setCurrentSpaceKey(spaceList[nextIdx]);
  };

  const nextSpace = () => {
    const nextIdx = (carouselIndex + 1) % spaceList.length;
    setCarouselIndex(nextIdx);
    setCurrentSpaceKey(spaceList[nextIdx]);
  };

  const selectSpace = (key: string) => {
    setCurrentSpaceKey(key);
    setActiveBuilding('A');
    setActiveFloor(1);
    const targetSpace = spacesData[key] || spacesData.plaza;
    setSelectedPoi(targetSpace.pois[0] || null);
    setRouteActive(true);
    setRouteResponse(null);
    setCurrentView('map');
    if (isBackendOrganizer) {
      const matchingMap = ownedMaps.find(
        (m) => m.slug === targetSpace.slug || m.id === targetSpace.mapId,
      );
      if (matchingMap) {
        void handleSelectOwnedMap(matchingMap.id);
      }
    }
  };

  const openSpaceFullPage = (key: string) => {
    const targetSpace = spacesData[key] || spacesData.plaza;
    const firstPoi = targetSpace.pois[0] || null;
    setCurrentSpaceKey(key);
    setActiveBuilding('A');
    setActiveFloor(1);
    setSelectedPoi(firstPoi);
    setCurrentView('map');
    if (firstPoi) {
      handleOpenPanoramaForPoi(firstPoi, key);
    }
  };

  const isFavorite = (id: string) => favorites.includes(id);

  const toggleFavorite = (id: string) => {
    if (favorites.includes(id)) {
      setFavorites((prev) => prev.filter((item) => item !== id));
      showNotification(lang === 'ru' ? 'Удалено из избранного' : 'Removed from favorites');
    } else {
      setFavorites((prev) => [...prev, id]);
      showNotification(lang === 'ru' ? 'Добавлено в избранное' : 'Added to favorites');
    }
  };

  const zoomInMap = () => setZoomLevel((z) => Math.min(z + 0.25, 2.5));
  const zoomOutMap = () => setZoomLevel((z) => Math.max(z - 0.25, 0.6));
  const resetMapZoom = () => setZoomLevel(1);

  const handleBuildRoute = async (overrideToPoiId?: string) => {
    const targetToId = overrideToPoiId || routeTo || selectedPoi?.id || '';
    if (!targetToId) {
      showNotification(lang === 'ru' ? 'Выберите конечную точку маршрута!' : 'Select destination point!');
      return;
    }
    const defaultFromId =
      routeFrom ||
      currentSpace.pois.find((p) => p.id !== targetToId)?.id ||
      currentSpace.pois[0]?.id ||
      '';
    setRouteFrom(defaultFromId);
    setRouteTo(targetToId);

    const fromPoi = currentSpace.pois.find((p) => p.id === defaultFromId);
    const destPoi = currentSpace.pois.find((p) => p.id === targetToId);
    if (destPoi) {
      setSelectedPoi(destPoi);
      setActiveBuilding(destPoi.building);
      setActiveFloor(destPoi.floor);
    }

    // Call real FastAPI route builder
    const slug = currentPublicSnapshot?.slug || currentSpace.slug;
    const fromNodeId = fromPoi?.navNodeId || defaultFromId;
    const toNodeId = destPoi?.navNodeId || targetToId;
    if (slug && fromNodeId && toNodeId && fromNodeId !== toNodeId) {
      try {
        const res = await apiClient.buildRoute(slug, {
          revision: currentPublicSnapshot?.revision ?? 1,
          from_node_id: fromNodeId,
          to_node_id: toNodeId,
        });
        setRouteResponse(res);
        setWalkStepIndex(0);
        setRouteActive(true);
        const distLabel =
          res.distance_m !== null
            ? `${res.distance_m.toFixed(1)} м`
            : `${Math.round(res.distance_units)} ед.`;
        showNotification(
          lang === 'ru'
            ? `Маршрут построен (${distLabel})`
            : `Route calculated (${distLabel})`,
        );
        return;
      } catch {
        // Fallback to visual curve if API unreachable or nodes disconnected
      }
    }

    setRouteResponse(null);
    setRouteActive(true);
    showNotification(lang === 'ru' ? 'Маршрут успешно построен' : 'Route calculated');
  };

  const handleClearRoute = () => {
    setRouteActive(false);
    setRouteResponse(null);
    setRouteFrom('');
    setRouteTo('');
    setWalkStepIndex(0);
    showNotification(lang === 'ru' ? 'Маршрут сброшен' : 'Route cleared');
  };

  const handleOpenPanoramaForPoi = (poi: RichPoiItem, spaceKeyOverride?: string) => {
    const key = spaceKeyOverride || currentSpaceKey;
    const snap = publicSnapshots[key];
    const doc = isBackendOrganizer && organizerMap ? editorDoc : snap?.document;
    const matchingPano =
      doc?.panoramas.find((p) => p.nav_node_id && p.nav_node_id === poi.navNodeId) ||
      doc?.panoramas.find(
        (p) => Math.hypot(p.x - poi.planX, p.y - poi.planY) < 90,
      ) ||
      doc?.panoramas[0] ||
      null;

    setActivePanoramaPoi(poi);
    setActivePanoramaObj(matchingPano);
    setPanoInitialYaw(0);
    setPanoEditable(false);
    setPanoramaModalOpen(true);
  };

  const handleStartWalkthroughStep = (stepIndex: number) => {
    if (!routeResponse || !routeResponse.walk.available) return;
    const step = routeResponse.walk.steps[stepIndex];
    if (!step) return;
    setWalkStepIndex(stepIndex);

    const doc = currentPublicSnapshot?.document || editorDoc;
    const pano =
      doc.panoramas.find((p) => p.id === step.panorama_id) ||
      doc.panoramas[0] ||
      null;
    const nearPoi =
      currentSpace.pois.find((p) => p.navNodeId === step.node_id) ||
      selectedPoi ||
      currentSpace.pois[0] ||
      null;

    setActivePanoramaPoi(nearPoi);
    setActivePanoramaObj(pano);
    setPanoInitialYaw(step.yaw_deg ?? 0);
    setPanoEditable(false);
    setPanoramaModalOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoSearchModalOpen(false);
      const foundPoi = currentSpace.pois[1] || currentSpace.pois[0];
      if (foundPoi) {
        setSelectedPoi(foundPoi);
        setActiveBuilding(foundPoi.building);
        setActiveFloor(foundPoi.floor);
        setCurrentView('map');
        setRouteTo(foundPoi.id);
        void handleBuildRoute(foundPoi.id);
      }
      showNotification(
        lang === 'ru' ? 'Объект успешно найден на фото!' : 'Object recognized on photo!',
      );
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Organizer handlers
  const handleSelectOwnedMap = async (mapId: string) => {
    try {
      const { map: full } = await apiClient.getMap(mapId);
      setOrganizerMap(full);
      setEditorDoc(full.snapshot.document);
      setVersionConflictRevision(null);
      const matchedSpaceKey = SLUG_TO_SPACE_KEY[full.snapshot.slug];
      if (matchedSpaceKey) {
        setCurrentSpaceKey(matchedSpaceKey);
      }
    } catch (err) {
      showNotification(
        err instanceof ApiClientError ? err.message : 'Не удалось загрузить карту',
      );
    }
  };

  const handleCreateNewMap = async (title: string) => {
    try {
      const { map: created } = await apiClient.createMap({
        title,
        description: 'Новое пространство ТТК',
        width_units: 700,
        height_units: 500,
        scale_m_per_unit: 0.05,
        max_walk_gap_units: 80,
      });
      setOrganizerMap(created);
      setEditorDoc(created.snapshot.document);
      const items = await apiClient.listMaps();
      setOwnedMaps(items);
      showNotification(lang === 'ru' ? `Карта «${title}» создана` : `Map "${title}" created`);
    } catch (err) {
      showNotification(err instanceof ApiClientError ? err.message : 'Ошибка создания карты');
    }
  };

  const handleSaveDocument = async (overrideDoc?: MapDocument) => {
    const docToSave = overrideDoc || editorDoc;
    if (overrideDoc) {
      setEditorDoc(overrideDoc);
    }

    if (isBackendOrganizer && organizerMap) {
      try {
        const { map: updated } = await apiClient.replaceMapDocument(
          organizerMap.snapshot.id,
          docToSave,
        );
        setOrganizerMap(updated);
        setEditorDoc(updated.snapshot.document);
        setVersionConflictRevision(null);
        await syncPublicMaps();
        const items = await apiClient.listMaps();
        setOwnedMaps(items);
        showNotification(
          lang === 'ru'
            ? `Сохранено в БД (ревизия #${updated.snapshot.revision})`
            : `Saved to DB (revision #${updated.snapshot.revision})`,
        );
        return;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          const conflictRev =
            err.body?.error.current_revision ?? (organizerMap.snapshot.revision || 1) + 1;
          setVersionConflictRevision(conflictRev);
          showNotification(
            lang === 'ru'
              ? 'Конфликт версий: документ был изменён в другой вкладке'
              : 'Version conflict',
          );
          return;
        }
        showNotification(err instanceof ApiClientError ? err.message : 'Ошибка сохранения');
        return;
      }
    }

    // Local preview update when not logged into backend
    setSpacesData((prev) => {
      const base = prev[currentSpaceKey] || initialSpacesData.plaza;
      const fakePublic: PublicMap = {
        id: base.mapId,
        slug: base.slug,
        revision: 1,
        width_units: 700,
        height_units: 500,
        updated_at: new Date().toISOString(),
        assets: currentPublicSnapshot?.assets || [],
        document: docToSave,
      };
      return {
        ...prev,
        [currentSpaceKey]: mergePublicMapIntoSpace(fakePublic, base),
      };
    });
    showNotification(lang === 'ru' ? 'Изменения применены к карте' : 'Changes applied to map');
  };

  const handleReloadAfterConflict = async () => {
    if (!organizerMap) return;
    await handleSelectOwnedMap(organizerMap.snapshot.id);
    showNotification(lang === 'ru' ? 'Загружена актуальная ревизия' : 'Reloaded latest revision');
  };

  const handleOpenHotspotEditor = () => {
    const firstPano = editorDoc.panoramas[0] || null;
    setActivePanoramaObj(firstPano);
    setActivePanoramaPoi(currentSpace.pois[0] || null);
    setPanoInitialYaw(0);
    setPanoEditable(true);
    setPanoramaModalOpen(true);
  };

  const handleAddHotspot = (hotspot: Omit<Hotspot, 'id'>) => {
    const nextHotspot: Hotspot = {
      ...hotspot,
      id: crypto.randomUUID(),
    };
    const nextDoc: MapDocument = {
      ...editorDoc,
      hotspots: [...editorDoc.hotspots, nextHotspot],
    };
    setEditorDoc(nextDoc);
    showNotification(lang === 'ru' ? 'Хотспот добавлен на панораму' : 'Hotspot added');
  };

  const handleDeleteHotspot = (hotspotId: string) => {
    const nextDoc: MapDocument = {
      ...editorDoc,
      hotspots: editorDoc.hotspots.filter((h) => h.id !== hotspotId),
    };
    setEditorDoc(nextDoc);
    showNotification(lang === 'ru' ? 'Хотспот удалён' : 'Hotspot deleted');
  };

  const activeDocForViewer =
    panoEditable || (isBackendOrganizer && organizerMap?.snapshot.slug === currentSpace.slug)
      ? editorDoc
      : currentPublicSnapshot?.document || editorDoc;

  const activeAssetsForViewer =
    (isBackendOrganizer && organizerMap?.snapshot.assets) ||
    currentPublicSnapshot?.assets ||
    [];

  const panoramaImageUrl = (() => {
    if (activePanoramaObj) {
      const matchedAsset = activeAssetsForViewer.find((a) => a.id === activePanoramaObj.asset_id);
      return matchedAsset?.full_url || `/api/v1/media/${activePanoramaObj.asset_id}/full`;
    }
    if (activePanoramaPoi) {
      return activePanoramaPoi.image;
    }
    return currentSpace.image;
  })();

  // Public visitor link: any published map slug is rendered by its own screen,
  // independent of the demo space catalogue.
  if (initialSlugFromUrl) {
    return <PublicSpacePage slug={initialSlugFromUrl} mode={isEmbedRoute ? 'embed' : 'viewer'} />;
  }

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-100 flex flex-col antialiased justify-between bg-white dark:bg-slate-950 font-sans">
      {/* Header Navigation (hidden in compact /embed/:slug mode) */}
      {!isEmbedRoute && (
        <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-40 shadow-xs shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
            {/* Logo Section */}
            <div
              className="flex items-center space-x-3 cursor-pointer select-none shrink-0"
              onClick={() => setCurrentView('spaces')}
            >
              <div className="flex flex-col items-start leading-none">
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-brand-600">
                  TTK
                </span>
                <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                  Официальный партнер
                </span>
              </div>
            </div>

            {/* Centered Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6 lg:space-x-8 whitespace-nowrap justify-center flex-1">
              <button
                onClick={() => setCurrentView('spaces')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 ${
                  currentView === 'spaces'
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.navSpaces}
              </button>

              <button
                onClick={() => setCurrentView('map')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 ${
                  currentView === 'map'
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.navMap}
              </button>

              <button
                onClick={() => setCurrentView('cabinet')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 ${
                  currentView === 'cabinet'
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.navCabinet}
              </button>

              <button
                onClick={attemptAdminAccess}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 flex items-center gap-2 ${
                  currentView === 'admin'
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon name="shield-check" className="w-4 h-4 text-brand-600 shrink-0" />
                <span>{t.navAdmin}</span>
              </button>
            </nav>

            {/* Right Controls */}
            <div className="flex items-center space-x-3 shrink-0">
              <div className="relative hidden xl:block w-48">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Icon name="search" className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  value={topSearchQuery}
                  onChange={(e) => setTopSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') executeTopSearch();
                  }}
                  placeholder={t.searchPlaceholder}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-600 transition-all"
                />
              </div>

              <button
                onClick={toggleOfflineMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition shadow-xs cursor-pointer ${
                  isOffline
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                <span>{isOffline ? t.offlineModeOn : t.offlineModeOff}</span>
              </button>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => switchLanguage('ru')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    lang === 'ru'
                      ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  RU
                </button>
                <button
                  onClick={() => switchLanguage('en')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    lang === 'en'
                      ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  EN
                </button>
              </div>

              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Переключить тему"
              >
                {!darkMode ? (
                  <Icon name="moon" className="w-4 h-4" />
                ) : (
                  <Icon name="sun" className="w-4 h-4 text-amber-400" />
                )}
              </button>

              {user ? (
                <button
                  onClick={() => setCurrentView('cabinet')}
                  className="flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-sm"
                >
                  <Icon name="user" className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline truncate max-w-[140px]">{user.name}</span>
                </button>
              ) : (
                <button
                  onClick={() => setCurrentView('auth')}
                  className="flex items-center space-x-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-sm whitespace-nowrap"
                >
                  <Icon name="log-in" className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.navLogin}</span>
                </button>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen((o) => !o)}
                className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Icon name="menu" className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setCurrentView('spaces');
                  setMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800"
              >
                {t.navSpaces}
              </button>
              <button
                onClick={() => {
                  setCurrentView('map');
                  setMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800"
              >
                {t.navMap}
              </button>
              <button
                onClick={() => {
                  setCurrentView('cabinet');
                  setMobileMenuOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800"
              >
                {t.navCabinet}
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  attemptAdminAccess();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-brand-600"
              >
                {t.navAdmin}
              </button>
            </div>
          )}
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {currentView === 'spaces' && (
          <SpacesHeroView
            lang={lang}
            spaceList={spaceList}
            spacesData={spacesData}
            currentSpaceKey={currentSpaceKey}
            carouselIndex={carouselIndex}
            isFavorite={isFavorite}
            onPrevSpace={prevSpace}
            onNextSpace={nextSpace}
            onSelectSpace={selectSpace}
            onOpenSpaceFullPage={openSpaceFullPage}
            onOpenMap={() => setCurrentView('map')}
            onOpenPhotoSearch={() => setPhotoSearchModalOpen(true)}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {currentView === 'map' && (
          <MapNavigationView
            lang={lang}
            currentSpace={currentSpace}
            publicSnapshot={currentPublicSnapshot}
            activeBuilding={activeBuilding}
            activeFloor={activeFloor}
            zoomLevel={zoomLevel}
            routeActive={routeActive}
            routeFrom={routeFrom}
            routeTo={routeTo}
            routeResponse={routeResponse}
            walkStepIndex={walkStepIndex}
            selectedPoi={selectedPoi}
            isEmbed={isEmbedRoute}
            isFavorite={isFavorite}
            onBackToSpaces={() => setCurrentView('spaces')}
            onChangeBuilding={(b) => {
              setActiveBuilding(b);
              setActiveFloor(1);
            }}
            onChangeFloor={setActiveFloor}
            onChangeRouteFrom={setRouteFrom}
            onChangeRouteTo={setRouteTo}
            onBuildRoute={(targetId) => void handleBuildRoute(targetId)}
            onClearRoute={handleClearRoute}
            onSelectPoi={setSelectedPoi}
            onOpenPanorama={(poi) => handleOpenPanoramaForPoi(poi)}
            onStartWalkthroughStep={handleStartWalkthroughStep}
            onToggleFavorite={toggleFavorite}
            onZoomIn={zoomInMap}
            onZoomOut={zoomOutMap}
            onResetZoom={resetMapZoom}
          />
        )}

        {currentView === 'auth' && (
          <AuthView
            lang={lang}
            onLoginSuccess={(loggedInUser, backendFlag) => {
              setUser(loggedInUser);
              setIsBackendOrganizer(backendFlag);
              if (backendFlag) {
                void loadOrganizerMaps();
              }
              setCurrentView('cabinet');
            }}
            onNotify={showNotification}
          />
        )}

        {currentView === 'cabinet' && (
          <CabinetView
            lang={lang}
            user={user}
            currentSpace={currentSpace}
            spacesData={spacesData}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onSelectSpaceOnMap={selectSpace}
            onSelectPoiOnMap={(poi, spaceKey) => {
              if (spaceKey) {
                setCurrentSpaceKey(spaceKey);
              }
              setSelectedPoi(poi);
              setActiveBuilding(poi.building);
              setActiveFloor(poi.floor);
              setCurrentView('map');
            }}
            onLogout={async () => {
              if (isBackendOrganizer) {
                try {
                  await apiClient.logout();
                } catch {
                  // Ignore logout error
                }
              }
              setUser(null);
              setIsBackendOrganizer(false);
              setCurrentView('spaces');
              showNotification(lang === 'ru' ? 'Вы вышли из системы' : 'Logged out');
            }}
            onOpenAdminEditor={attemptAdminAccess}
          />
        )}

        {currentView === 'admin' && (
          <AdminView
            lang={lang}
            darkMode={darkMode}
            isAuthenticated={isBackendOrganizer}
            currentSpace={currentSpace}
            organizerMap={organizerMap}
            ownedMaps={ownedMaps}
            mapDoc={editorDoc}
            versionConflictRevision={versionConflictRevision}
            onSelectOwnedMap={(id) => void handleSelectOwnedMap(id)}
            onCreateNewMap={handleCreateNewMap}
            onChangeDocument={setEditorDoc}
            onSaveDocument={handleSaveDocument}
            onReloadAfterConflict={handleReloadAfterConflict}
            onOpenHotspotEditor={handleOpenHotspotEditor}
            onNotify={showNotification}
          />
        )}
      </main>

      {/* MODAL: ADMIN PASSWORD PROMPT */}
      {adminPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t.adminAuthPromptTitle}</h3>
              <button
                onClick={() => setAdminPasswordModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">{t.adminAuthPromptDesc}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t.adminPasswordLabel}
                </label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') verifyAdminPassword();
                  }}
                  placeholder="admin2026"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              <button
                onClick={verifyAdminPassword}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition shadow-md text-xs"
              >
                {t.adminLoginBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NATIVE PHOTO SEARCH ACCESS */}
      {photoSearchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Поиск объекта по фото</h3>
              <button
                onClick={() => setPhotoSearchModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <input
              ref={photoFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />

            <div
              onClick={() => photoFileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center cursor-pointer hover:border-brand-600 transition bg-slate-50 dark:bg-slate-950"
            >
              <Icon name="camera" className="w-10 h-10 mx-auto text-brand-600 mb-2" />
              <p className="text-sm font-semibold">Загрузите фото или сделайте снимок с камеры</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: 360 PANORAMA POPUP & HOTSPOT EDITOR */}
      <PanoramaViewer
        isOpen={panoramaModalOpen}
        onClose={() => setPanoramaModalOpen(false)}
        title={activePanoramaObj?.title || activePanoramaPoi?.name || 'Панорама 360°'}
        imageUrl={panoramaImageUrl}
        panorama={activePanoramaObj}
        panoramas={activeDocForViewer.panoramas}
        hotspots={activeDocForViewer.hotspots}
        pois={activeDocForViewer.pois}
        richPois={currentSpace.pois}
        assets={activeAssetsForViewer}
        initialYawDeg={panoInitialYaw}
        editable={panoEditable}
        onSelectPanorama={(targetPanoId) => {
          const nextPano = activeDocForViewer.panoramas.find((p) => p.id === targetPanoId) || null;
          if (nextPano) {
            setActivePanoramaObj(nextPano);
            showNotification(`Переход: ${nextPano.title}`);
          }
        }}
        onSelectPoi={(poiId) => {
          const found = currentSpace.pois.find((p) => p.id === poiId);
          if (found) {
            setSelectedPoi(found);
            setActiveBuilding(found.building);
            setActiveFloor(found.floor);
          }
        }}
        onAddHotspot={handleAddHotspot}
        onDeleteHotspot={handleDeleteHotspot}
      />

      {/* Toast Notification Box */}
      {notificationOpen && (
        <div className="fixed bottom-16 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-slate-800 text-xs font-medium animate-bounce">
          <Icon name="bell" className="w-4 h-4 text-brand-500 shrink-0" />
          <span>{notificationText}</span>
        </div>
      )}

      {/* Footer (hidden in compact /embed/:slug mode) */}
      {!isEmbedRoute && (
        <footer className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-8 text-xs text-slate-500 dark:text-slate-400">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <div>{t.footerCopy}</div>

            <div className="text-slate-600 dark:text-slate-300 font-medium">
              Сервис навигации внутри зданий и мероприятий.
            </div>

            <div className="flex items-center space-x-6 justify-center">
              <a
                href="#privacy"
                onClick={(e) => e.preventDefault()}
                className="hover:text-brand-600 transition"
              >
                {t.privacyApi}
              </a>
              <a
                href="#terms"
                onClick={(e) => e.preventDefault()}
                className="hover:text-brand-600 transition"
              >
                {t.termsLink}
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
export default App;
