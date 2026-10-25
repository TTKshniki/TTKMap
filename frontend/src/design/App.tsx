import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AuthFormState,
  CategoryFilter,
  FavoriteItem,
  Language,
  PoiItem,
  SpaceKey,
  UserProfile,
  ViewType,
} from './types';
import { i18n, spacesData as initialSpacesData, SPACE_LIST } from './data/spacesData';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SpacesView } from './components/SpacesView';
import { MapView } from './components/MapView';
import { AuthView } from './components/AuthView';
import { CabinetView } from './components/CabinetView';
import { Modals } from './components/Modals';
import { navigate } from '../shared/router';
import { validatePassword } from '../shared/passwordValidation';

export interface DesignAppProps {
  initialUser?: UserProfile | null;
  onLogin?: (email: string, password: string, role?: 'user' | 'organizer') => Promise<UserProfile>;
  onRegister?: (email: string, password: string, role?: 'user' | 'organizer') => Promise<UserProfile>;
  onLogout?: () => Promise<void>;
  onOrganizer?: () => void;
  onOpenPublicMap?: (slug: string) => void;
}

export const App: React.FC<DesignAppProps> = ({
  initialUser = null,
  onLogin,
  onRegister,
  onLogout,
  onOrganizer,
  onOpenPublicMap,
}) => {
  const [currentView, setCurrentView] = useState<ViewType>('spaces');
  const [lang, setLang] = useState<Language>('ru');
  const [selectedCity, setSelectedCity] = useState<string>('г. Ростов-на-Дону');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return true;
    }
    return false;
  });

  const [activeBuilding, setActiveBuilding] = useState<string>('A');
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [topSearchQuery, setTopSearchQuery] = useState<string>('');

  const [user, setUser] = useState<UserProfile | null>(initialUser);
  const [hasCreatedPlan, setHasCreatedPlan] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState<AuthFormState>({
    email: '',
    password: '',
  });

  const [favorites, setFavorites] = useState<Array<SpaceKey | number>>([
    'hub',
    'expo',
    'center',
  ]);

  const spaceList = SPACE_LIST;
  const spacesData = initialSpacesData;
  const [currentSpaceKey, setCurrentSpaceKey] = useState<SpaceKey>('hub');

  const currentSpace = useMemo(
    () => spacesData[currentSpaceKey] || spacesData.hub || spacesData[SPACE_LIST[0]],
    [spacesData, currentSpaceKey]
  );

  const t = useMemo(() => i18n[lang], [lang]);

  const [selectedPoi, setSelectedPoi] = useState<PoiItem | null>(() => {
    const initialSpace = initialSpacesData.hub || initialSpacesData[SPACE_LIST[0]];
    return initialSpace.pois && initialSpace.pois.length > 0
      ? initialSpace.pois[0]
      : null;
  });

  const [activePanoramaPoi, setActivePanoramaPoi] = useState<PoiItem | null>(null);
  const [panoramaModalOpen, setPanoramaModalOpen] = useState<boolean>(false);
  const [panoZoom, setPanoZoom] = useState<number>(100);
  const [panoRotationX, setPanoRotationX] = useState<number>(0);
  const [panoRotationY, setPanoRotationY] = useState<number>(0);
  const [isDraggingPano, setIsDraggingPano] = useState<boolean>(false);
  const [panoStartX, setPanoStartX] = useState<number>(0);
  const [panoStartY, setPanoStartY] = useState<number>(0);

  const [routeActive, setRouteActive] = useState<boolean>(true);
  const [routeFrom, setRouteFrom] = useState<string>('entrance');
  const [routeTo, setRouteTo] = useState<string>('living');

  const [notificationOpen, setNotificationOpen] = useState<boolean>(false);
  const [notificationText, setNotificationText] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const notificationTimerRef = useRef<number | null>(null);

  const showNotification = useCallback((text: string) => {
    setNotificationText(text);
    setNotificationOpen(true);
    if (notificationTimerRef.current) {
      window.clearTimeout(notificationTimerRef.current);
    }
    notificationTimerRef.current = window.setTimeout(() => {
      setNotificationOpen(false);
    }, 3500);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  const attemptAdminAccess = () => {
    if (user && (user.role === 'admin' || user.role === 'organizer' || user.role === 'Организатор')) {
      if (onOrganizer) onOrganizer();
    } else {
      showNotification(
        lang === 'ru'
          ? 'У пользователя нет доступа к редактору. Для редактирования планов войдите как организатор.'
          : 'User has no access to the editor. Please sign in as an organizer to edit plans.'
      );
    }
  };

  const favoriteItemsList = useMemo<FavoriteItem[]>(() => {
    const list: FavoriteItem[] = [];
    (Object.keys(spacesData) as SpaceKey[]).forEach((key) => {
      const space = spacesData[key];
      if (favorites.includes(space.id)) {
        list.push({
          id: space.id,
          name: space.name,
          desc: space.desc,
          image: space.image,
          type: 'space',
        });
      }
      if (space.pois) {
        space.pois.forEach((poi) => {
          if (favorites.includes(poi.id)) {
            list.push({
              id: poi.id,
              name: poi.name,
              desc: {
                ru: `Корпус ${poi.building}, Этаж ${poi.floor}`,
                en: `Building ${poi.building}, Floor ${poi.floor}`,
              },
              image: poi.image,
              type: 'poi',
              parentSpaceKey: key,
              rawPoi: poi,
            });
          }
        });
      }
    });
    return list;
  }, [spacesData, favorites]);

  const isFavorite = (id: SpaceKey | number) => favorites.includes(id);

  const toggleFavorite = (id: SpaceKey | number, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    if (favorites.includes(id)) {
      setFavorites((prev) => prev.filter((favId) => favId !== id));
      showNotification(
        lang === 'ru' ? 'Удалено из избранного' : 'Removed from favorites'
      );
    } else {
      setFavorites((prev) => [...prev, id]);
      showNotification(
        lang === 'ru' ? 'Добавлено в избранное' : 'Added to favorites'
      );
    }
  };

  const selectSpaceAndOpenMap = (key: SpaceKey) => {
    setCurrentSpaceKey(key);
    setActiveBuilding('A');
    setActiveFloor(1);
    const targetSpace = spacesData[key] || spacesData.plaza;
    if (targetSpace.pois && targetSpace.pois.length > 0) {
      setSelectedPoi(targetSpace.pois[0]);
    }
    setCurrentView('map');
    setRouteActive(true);
    showNotification(
      lang === 'ru'
        ? 'Объект загружен на карту и навигацию'
        : 'Space loaded to map'
    );
  };

  const openFavoriteItem = (item: FavoriteItem) => {
    if (
      item.type === 'space' ||
      (typeof item.id === 'string' && spacesData[item.id as SpaceKey])
    ) {
      selectSpaceAndOpenMap(item.id as SpaceKey);
    } else if (item.parentSpaceKey && item.rawPoi) {
      setCurrentSpaceKey(item.parentSpaceKey);
      setSelectedPoi(item.rawPoi);
      setActiveBuilding(item.rawPoi.building);
      setActiveFloor(item.rawPoi.floor);
      setCurrentView('map');
    }
  };

  const triggerMetallicFlash = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    el.classList.add('metallic-flash-active');
    showNotification(lang === 'ru' ? 'Каталог объектов пока не подключён' : 'The venue catalogue is not connected yet');
    window.setTimeout(() => {
      el.classList.remove('metallic-flash-active');
    }, 800);
  };

  const executeTopSearch = () => {
    if (!topSearchQuery || !topSearchQuery.trim()) return;
    const query = topSearchQuery.toLowerCase().trim();
    let found = false;

    for (const key of Object.keys(spacesData) as SpaceKey[]) {
      const space = spacesData[key];
      if (
        space.name.ru.toLowerCase().includes(query) ||
        space.name.en.toLowerCase().includes(query) ||
        space.desc.ru.toLowerCase().includes(query)
      ) {
        setCurrentSpaceKey(key);
        found = true;
        break;
      }
      if (space.pois) {
        for (const poi of space.pois) {
          if (
            poi.name.ru.toLowerCase().includes(query) ||
            poi.name.en.toLowerCase().includes(query) ||
            (poi.equipment && poi.equipment.toLowerCase().includes(query))
          ) {
            setCurrentSpaceKey(key);
            setSelectedPoi(poi);
            setActiveBuilding(poi.building);
            setActiveFloor(poi.floor);
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }

    if (!found) {
      const publicSlug = query.match(/(?:\/m\/)?([a-z2-7]{26})$/)?.[1];
      if (publicSlug && onOpenPublicMap) {
        onOpenPublicMap(publicSlug);
      } else {
        showNotification(lang === 'ru' ? 'Ничего не найдено' : 'No results found');
      }
      setTopSearchQuery('');
      return;
    }

    setCurrentView('map');
    showNotification(lang === 'ru' ? `Результаты поиска: "${topSearchQuery}"` : `Search results: "${topSearchQuery}"`);
    setTopSearchQuery('');
  };

  const switchLanguage = (newLang: Language) => {
    setLang(newLang);
    showNotification(
      newLang === 'ru'
        ? 'Язык изменен на Русский'
        : 'Language switched to English'
    );
  };

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const loginUser = async (targetRole?: 'user' | 'organizer') => {
    if (!authForm.email || !authForm.password) {
      showNotification(
        lang === 'ru'
          ? 'Пожалуйста, заполните все поля!'
          : 'Please fill all fields!'
      );
      return;
    }
    if (!onLogin) {
      setAuthError(lang === 'ru' ? 'Сервер авторизации не подключён.' : 'Authentication server is not connected.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const profile = await onLogin(authForm.email, authForm.password, targetRole);
      setUser(profile);
      showNotification(lang === 'ru' ? 'Вход выполнен! Переходим в кабинет…' : 'Signed in! Opening workspace…');
      if (targetRole === 'user') {
        setCurrentView('cabinet');
      } else if (onOrganizer) {
        onOrganizer();
      } else {
        setCurrentView('cabinet');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : (lang === 'ru' ? 'Не удалось войти.' : 'Sign-in failed.'));
    } finally {
      setAuthBusy(false);
    }
  };

  const registerUser = async (targetRole?: 'user' | 'organizer') => {
    if (!authForm.email || !authForm.password) {
      showNotification(
        lang === 'ru'
          ? 'Пожалуйста, заполните email и пароль!'
          : 'Please fill email and password!'
      );
      return;
    }
    const validation = validatePassword(authForm.password, authForm.email);
    if (!validation.valid) {
      setAuthError(validation.error || 'Ненадежный пароль.');
      return;
    }
    if (authForm.confirmPassword && authForm.password !== authForm.confirmPassword) {
      setAuthError(lang === 'ru' ? 'Пароли не совпадают.' : 'Passwords do not match.');
      return;
    }
    if (!onRegister) {
      setAuthError(lang === 'ru' ? 'Сервер регистрации не подключён.' : 'Registration server is not connected.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    try {
      const profile = await onRegister(authForm.email, authForm.password, targetRole);
      setUser(profile);
      showNotification(lang === 'ru' ? 'Регистрация успешна! Переходим в кабинет…' : 'Registration successful! Opening workspace…');
      if (targetRole === 'user') {
        setCurrentView('cabinet');
      } else if (onOrganizer) {
        onOrganizer();
      } else {
        setCurrentView('cabinet');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'body' in error) {
        const body = (error as any).body;
        if (body?.error?.issues?.length) {
          const issueMsg = body.error.issues
            .map((i: any) => String(i.message || '').replace(/^Value error,\s*/i, ''))
            .filter(Boolean)
            .join('; ');
          if (issueMsg) {
            setAuthError(issueMsg);
            return;
          }
        }
      }
      setAuthError(error instanceof Error ? error.message : (lang === 'ru' ? 'Не удалось зарегистрироваться.' : 'Registration failed.'));
    } finally {
      setAuthBusy(false);
    }
  };

  const logoutUser = async () => {
    try {
      if (onLogout) await onLogout();
      setUser(null);
      setCurrentView('spaces');
      showNotification(lang === 'ru' ? 'Вы вышли из системы' : 'Signed out');
    } catch (error) {
      showNotification(error instanceof Error ? error.message : (lang === 'ru' ? 'Не удалось выйти.' : 'Sign-out failed.'));
    }
  };

  const openPanorama = (poi?: PoiItem | null) => {
    const fallbackPoi =
      poi ||
      (currentSpace.pois && currentSpace.pois.length > 0
        ? currentSpace.pois[0]
        : null);
    setActivePanoramaPoi(fallbackPoi);
    setPanoRotationX(0);
    setPanoRotationY(0);
    setPanoZoom(100);
    setPanoramaModalOpen(true);
  };

  const openSpaceFullPage = (key: SpaceKey) => {
    setCurrentSpaceKey(key);
    const targetSpace = spacesData[key] || spacesData.plaza;
    if (targetSpace.pois && targetSpace.pois.length > 0) {
      const firstPoi = targetSpace.pois[0];
      setSelectedPoi(firstPoi);
      setActivePanoramaPoi(firstPoi);
      openPanorama(firstPoi);
    } else {
      openPanorama(null);
    }
  };

  const zoomInMap = () => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
  };

  const zoomOutMap = () => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.6));
  };

  const resetMapZoom = () => {
    setZoomLevel(1.0);
  };

  const startPanoDrag = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDraggingPano(true);
    const clientX =
      'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setPanoStartX(clientX - panoRotationX);
    setPanoStartY(clientY - panoRotationY);
  };

  const onPanoDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDraggingPano) return;
    const clientX =
      'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setPanoRotationX(clientX - panoStartX);
    setPanoRotationY(Math.max(-120, Math.min(120, clientY - panoStartY)));
  };

  const stopPanoDrag = () => {
    setIsDraggingPano(false);
  };

  const buildRoute = () => {
    setRouteActive(true);
    showNotification(
      lang === 'ru'
        ? 'Маршрут от главной двери построен'
        : 'Route from main door built'
    );
  };

  const clearRoute = () => {
    setRouteActive(false);
    setRouteFrom('');
    setRouteTo('');
    showNotification(lang === 'ru' ? 'Маршрут сброшен' : 'Route cleared');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans overflow-x-hidden">
      <Header
        currentView={currentView}
        setCurrentView={setCurrentView}
        t={t}
        attemptAdminAccess={attemptAdminAccess}
        topSearchQuery={topSearchQuery}
        setTopSearchQuery={setTopSearchQuery}
        executeTopSearch={executeTopSearch}
        lang={lang}
        switchLanguage={switchLanguage}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        user={user}
        selectedCity={selectedCity}
        setSelectedCity={setSelectedCity}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        hasCreatedPlan={hasCreatedPlan}
      />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 relative">
        {currentView === 'spaces' && (
          <SpacesView
            t={t}
            lang={lang}
            user={user}
            setCurrentView={setCurrentView}
            spaceList={spaceList}
            spacesData={spacesData}
            currentSpaceKey={currentSpaceKey}
            selectSpaceAndOpenMap={selectSpaceAndOpenMap}
            openSpaceFullPage={openSpaceFullPage}
            isFavorite={isFavorite}
            toggleFavorite={toggleFavorite}
            triggerMetallicFlash={triggerMetallicFlash}
            showNotification={showNotification}
          />
        )}

        {currentView === 'map' && (
          <MapView
            t={t}
            lang={lang}
            currentSpace={currentSpace}
            setCurrentView={setCurrentView}
            activeBuilding={activeBuilding}
            activeFloor={activeFloor}
            setActiveFloor={setActiveFloor}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            routeActive={routeActive}
            clearRoute={clearRoute}
            routeFrom={routeFrom}
            setRouteFrom={setRouteFrom}
            routeTo={routeTo}
            setRouteTo={setRouteTo}
            buildRoute={buildRoute}
            selectedPoi={selectedPoi}
            setSelectedPoi={setSelectedPoi}
            openPanorama={openPanorama}
            toggleFavorite={toggleFavorite}
            showNotification={showNotification}
            zoomLevel={zoomLevel}
            zoomInMap={zoomInMap}
            zoomOutMap={zoomOutMap}
            resetMapZoom={resetMapZoom}
          />
        )}

        {currentView === 'auth' && (
          <AuthView
            t={t}
            authForm={authForm}
            setAuthForm={setAuthForm}
            loginUser={loginUser}
            registerUser={registerUser}
            busy={authBusy}
            error={authError}
          />
        )}

        {currentView === 'cabinet' && (
          <CabinetView
            t={t}
            lang={lang}
            user={user}
            attemptAdminAccess={attemptAdminAccess}
            logoutUser={logoutUser}
            favoriteItemsList={favoriteItemsList}
            toggleFavorite={toggleFavorite}
            openFavoriteItem={openFavoriteItem}
          />
        )}

      </main>

      <Modals
        lang={lang}
        panoramaModalOpen={panoramaModalOpen}
        setPanoramaModalOpen={setPanoramaModalOpen}
        activePanoramaPoi={activePanoramaPoi}
        currentSpace={currentSpace}
        panoZoom={panoZoom}
        panoRotationX={panoRotationX}
        panoRotationY={panoRotationY}
        startPanoDrag={startPanoDrag}
        onPanoDrag={onPanoDrag}
        stopPanoDrag={stopPanoDrag}
        notificationOpen={notificationOpen}
        notificationText={notificationText}
      />

      <Footer t={t} />
    </div>
  );
};

export default App;
