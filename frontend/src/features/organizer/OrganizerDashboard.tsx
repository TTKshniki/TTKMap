import React, { useEffect, useRef, useState } from 'react';
import type {
  AssetRef,
  MapDocument,
  MapSummary,
  OrganizerMap,
  Panorama,
} from '../../../../CONTRACTS/types';
import { apiClient, ApiClientError } from '../../shared/api';
import { Icon } from '../../shared/Icon';
import {
  i18n,
  Lang,
  poiName,
  RichPoiItem,
  spaceDesc,
  SpaceDefinition,
  spaceName,
} from '../../shared/spacesData';
import { CaptureGuide } from '../capture';
import { PlanEditor } from '../plan';

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  isAdmin?: boolean;
}

export interface AuthViewProps {
  lang: Lang;
  onLoginSuccess: (user: UserProfile, isBackendOrganizer: boolean) => void;
  onNotify: (msg: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ lang, onLoginSuccess, onNotify }: AuthViewProps) => {
  const t = i18n[lang];
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('Алексей Шереметьев');
  const [email, setEmail] = useState('alexey@ttk.ru');
  const [password, setPassword] = useState('ttkmap-organizer-2026');
  const [role, setRole] = useState('Организатор ТТК');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      onNotify(lang === 'ru' ? 'Заполните все поля!' : 'Please fill all fields!');
      return;
    }
    setLoading(true);
    try {
      const session = await apiClient.login({ email: email.trim(), password });
      onLoginSuccess(
        {
          id: session.user.id,
          name: name.trim() || 'Алексей Шереметьев',
          email: session.user.email,
          role: 'Организатор ТТК',
          isAdmin: true,
        },
        true,
      );
      onNotify(lang === 'ru' ? 'Успешный вход в личный кабинет!' : 'Successfully logged in!');
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 422 || err.status === 429)) {
        onNotify(err.message);
      } else {
        onLoginSuccess(
          {
            name: name.trim() || 'Алексей Шереметьев',
            email: email.trim(),
            role: 'Сотрудник ТТК',
            isAdmin: email.includes('admin'),
          },
          false,
        );
        onNotify(lang === 'ru' ? 'Успешный вход в личный кабинет!' : 'Successfully logged in!');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    if (!email.trim() || !password || !name.trim()) {
      onNotify(lang === 'ru' ? 'Заполните все поля регистрации!' : 'Fill all registration fields!');
      return;
    }
    onLoginSuccess(
      {
        name: name.trim(),
        email: email.trim(),
        role,
        isAdmin: false,
      },
      false,
    );
    onNotify(lang === 'ru' ? 'Регистрация успешно завершена!' : 'Registration complete!');
  };

  return (
    <div className="flex-1 p-4 sm:p-8 flex items-center justify-center min-h-[500px] custom-scrollbar animate-view-enter">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 max-w-md w-full shadow-2xl space-y-6 my-auto">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t.authTitle}</h2>
          <p className="text-xs text-slate-500">Личный кабинет сотрудника или организатора</p>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setAuthTab('login')}
            className={`flex-1 pb-3 text-center text-sm ${
              authTab === 'login' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            {t.loginTab}
          </button>
          <button
            onClick={() => setAuthTab('register')}
            className={`flex-1 pb-3 text-center text-sm ${
              authTab === 'register' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            {t.registerTab}
          </button>
        </div>

        {authTab === 'login' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alexey@ttk.ru"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Демо-организатор: alexey@ttk.ru / ttkmap-organizer-2026</span>
              <button
                type="button"
                onClick={() => {
                  setEmail('alexey@ttk.ru');
                  setPassword('ttkmap-organizer-2026');
                }}
                className="text-brand-600 font-bold hover:underline"
              >
                Подставить
              </button>
            </div>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition shadow-md"
            >
              {loading ? 'Вход...' : t.loginBtn}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Имя и Фамилия
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Алексей Шереметьев"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alexey@ttk.ru"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Роль</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="Организатор ТТК">Организатор ТТК</option>
                <option value="Сотрудник ТТК">Сотрудник ТТК</option>
              </select>
            </div>
            <button
              onClick={handleRegister}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition shadow-md"
            >
              {t.registerBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export interface CabinetViewProps {
  lang?: Lang;
  user: UserProfile | null;
  currentSpace: SpaceDefinition;
  spacesData?: Record<string, SpaceDefinition>;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectSpaceOnMap?: (spaceKey: string) => void;
  onSelectPoiOnMap: (poi: RichPoiItem, spaceKey?: string) => void;
  onLogout: () => void;
  onOpenAdminEditor: () => void;
}

interface FavoriteCardItem {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  kind: 'space' | 'poi';
  spaceKey: string;
  rawPoi?: RichPoiItem;
}

export const CabinetView: React.FC<CabinetViewProps> = ({
  lang = 'ru',
  user,
  currentSpace,
  spacesData,
  favorites,
  onToggleFavorite,
  onSelectSpaceOnMap,
  onSelectPoiOnMap,
  onLogout,
  onOpenAdminEditor,
}: CabinetViewProps) => {
  const t = i18n[lang];
  const allSpaces = spacesData || { [currentSpace.id]: currentSpace };

  const favoriteItemsList: FavoriteCardItem[] = [];
  for (const [key, space] of Object.entries(allSpaces)) {
    if (favorites.includes(space.id)) {
      favoriteItemsList.push({
        id: space.id,
        title: spaceName(space, lang),
        subtitle: spaceDesc(space, lang),
        image: space.image,
        kind: 'space',
        spaceKey: key,
      });
    }
    for (const poi of space.pois) {
      if (
        favorites.includes(poi.id) ||
        (poi.legacyId !== undefined && favorites.includes(String(poi.legacyId)))
      ) {
        favoriteItemsList.push({
          id: poi.id,
          title: poiName(poi, lang),
          subtitle:
            lang === 'ru'
              ? `Корпус ${poi.building}, Этаж ${poi.floor}`
              : `Building ${poi.building}, Floor ${poi.floor}`,
          image: poi.image,
          kind: 'poi',
          spaceKey: key,
          rawPoi: poi,
        });
      }
    }
  }

  return (
    <div className="p-4 sm:p-8 custom-scrollbar animate-view-enter">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-5">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-2xl shadow-inner">
              АШ
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {user ? user.name : 'Алексей Шереметьев'}
              </h1>
              <p className="text-sm text-slate-500">
                {user ? user.email : 'alexey.sheremetev@ttk.ru'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onOpenAdminEditor}
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 shadow-md"
            >
              <Icon name="shield-check" className="w-4 h-4 text-brand-500" />
              <span>{t.adminLinkTitle}</span>
            </button>
            <button
              onClick={onLogout}
              className="text-xs sm:text-sm text-rose-500 hover:underline font-bold px-3 py-2"
            >
              {lang === 'ru' ? 'Выйти' : 'Log Out'}
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {lang === 'ru' ? 'Избранные пространства и точки' : 'Favorite Spaces & Points'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoriteItemsList.length === 0 ? (
            <div className="col-span-full p-8 text-center text-sm text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              {lang === 'ru'
                ? 'В избранном пока нет объектов. Добавьте пространство или точку на карте!'
                : 'No favorite items yet. Bookmark a space or point on the map!'}
            </div>
          ) : (
            favoriteItemsList.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm relative group"
              >
                <div className="h-44 rounded-2xl overflow-hidden relative">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  <button
                    onClick={() => onToggleFavorite(item.id)}
                    className="absolute top-3 right-3 p-2 rounded-full bg-white/90 dark:bg-slate-800/90 text-rose-500 shadow-md hover:scale-110 transition"
                    title={lang === 'ru' ? 'Удалить из избранного' : 'Remove from favorites'}
                  >
                    <Icon name="trash-2" className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white">{item.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.subtitle}</p>
                </div>
                <button
                  onClick={() => {
                    if (item.kind === 'space' && onSelectSpaceOnMap) {
                      onSelectSpaceOnMap(item.spaceKey);
                    } else if (item.rawPoi) {
                      onSelectPoiOnMap(item.rawPoi, item.spaceKey);
                    }
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <span>{lang === 'ru' ? 'Перейти на карту' : 'Go to Map'}</span>
                  <Icon name="arrow-right" className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export interface AdminViewProps {
  lang: Lang;
  darkMode: boolean;
  isAuthenticated: boolean;
  currentSpace: SpaceDefinition;
  organizerMap: OrganizerMap | null;
  ownedMaps: MapSummary[];
  mapDoc: MapDocument;
  versionConflictRevision: number | null;
  onSelectOwnedMap: (mapId: string) => void;
  onCreateNewMap: (title: string) => Promise<void>;
  onChangeDocument: (next: MapDocument) => void;
  onSaveDocument: (next?: MapDocument) => Promise<void>;
  onReloadAfterConflict: () => Promise<void>;
  onOpenHotspotEditor: () => void;
  onNotify: (msg: string) => void;
}

const CHART_LABELS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const CHART_DATA = [140, 480, 920, 1150, 810, 430, 195];

export const AdminView: React.FC<AdminViewProps> = ({
  lang,
  darkMode,
  isAuthenticated,
  currentSpace,
  organizerMap,
  ownedMaps,
  mapDoc,
  versionConflictRevision,
  onSelectOwnedMap,
  onCreateNewMap,
  onChangeDocument,
  onSaveDocument,
  onReloadAfterConflict,
  onOpenHotspotEditor,
  onNotify,
}: AdminViewProps) => {
  const t = i18n[lang];
  const [adminTab, setAdminTab] = useState<'editor' | 'analytics'>('editor');
  const [newMapTitle, setNewMapTitle] = useState('');
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (adminTab !== 'analytics' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = (canvas.width = canvas.parentElement?.clientWidth || 720);
    const h = (canvas.height = 250);
    ctx.clearRect(0, 0, w, h);

    const padLeft = 48;
    const padRight = 24;
    const padTop = 20;
    const padBottom = 34;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const maxVal = 1200;

    ctx.strokeStyle = 'rgba(200, 200, 200, 0.1)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Roboto, sans-serif';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * i;
      const y = padTop + plotH - (val / maxVal) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(val)), 8, y + 4);
    }

    const points = CHART_DATA.map((val, idx) => ({
      x: padLeft + (idx / (CHART_DATA.length - 1)) * plotW,
      y: padTop + plotH - (val / maxVal) * plotH,
      label: CHART_LABELS[idx],
      val,
    }));

    // Area fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, padTop + plotH);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(227, 27, 35, 0.12)';
    ctx.fill();

    // Smooth line
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#E31B23';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Points & X labels
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#E31B23';
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(p.label, p.x - 14, h - 10);
    });
  }, [adminTab, darkMode, lang]);

  const activeMapId = organizerMap?.snapshot.id ?? currentSpace.mapId;
  const activeSlug = organizerMap?.snapshot.slug ?? currentSpace.slug;
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/m/${activeSlug}`;
  const embedUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${activeSlug}`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="600" style="border:0;border-radius:16px;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin" allowfullscreen title="${mapDoc.title}"></iframe>`;

  const handleTogglePublish = async () => {
    if (!mapDoc.is_published && mapDoc.pois.length === 0) {
      onNotify('Для публикации карты добавьте хотя бы одну точку интереса (POI)!');
      return;
    }
    const nextDoc: MapDocument = { ...mapDoc, is_published: !mapDoc.is_published };
    onChangeDocument(nextDoc);
    await onSaveDocument(nextDoc);
  };

  const handlePanoramaAssetReady = (asset: AssetRef, title: string, x: number, y: number) => {
    const newPano: Panorama = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `00000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
      asset_id: asset.id,
      title,
      x,
      y,
      nav_node_id: null,
      heading_offset_deg: 0,
    };
    const nextDoc: MapDocument = {
      ...mapDoc,
      panoramas: [...mapDoc.panoramas, newPano],
    };
    onChangeDocument(nextDoc);
  };

  return (
    <div className="p-4 sm:p-8 custom-scrollbar animate-view-enter">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header (Update Design + publish/share controls) */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              Редактор карты и панорам — Панель администратора ТТК
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Инструмент организатора для разметки 2D-планов и создания 360-съемок
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTogglePublish}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                mapDoc.is_published
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
              }`}
            >
              {mapDoc.is_published ? 'Опубликовано (Снять с публикации)' : 'Черновик (Опубликовать)'}
            </button>
            <button
              onClick={() => setShowEmbedModal(!showEmbedModal)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <Icon name="share-2" className="w-4 h-4 text-brand-500 shrink-0" />
              <span>Поделиться / Embed</span>
            </button>
            <button
              onClick={() => void onSaveDocument()}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-md"
            >
              Сохранить изменения
            </button>
          </div>
        </div>

        {/* Public Link & Safe Iframe Snippet Box */}
        {showEmbedModal && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 text-xs shadow-md animate-view-enter">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-sm">Стабильная публичная ссылка и код встраивания (Embed)</span>
              <span className="text-slate-400">Slug неизменен при обновлениях: {activeSlug}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Прямая ссылка для посетителей:</label>
                <input
                  readOnly
                  value={publicUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">HTML-код для встраивания (iframe):</label>
                <input
                  readOnly
                  value={iframeSnippet}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* 412 Version Conflict Alert */}
        {versionConflictRevision !== null && (
          <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 animate-view-enter">
            <div>
              <p className="font-bold">
                Конфликт версий (412 VERSION_CONFLICT): карта была изменена в другой сессии (ревизия{' '}
                {versionConflictRevision}).
              </p>
              <p>Ваши локальные правки сохранены в редакторе. Обновите снимок с сервера перед повторным сохранением.</p>
            </div>
            <button
              onClick={onReloadAfterConflict}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold"
            >
              Загрузить актуальную версию
            </button>
          </div>
        )}

        {/* Map Selector & Creation Bar */}
        {isAuthenticated && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-slate-500 shrink-0">Карта в редакторе:</span>
              <select
                value={activeMapId}
                onChange={(e) => onSelectOwnedMap(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 font-semibold max-w-full sm:max-w-[300px] truncate"
              >
                {ownedMaps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} (rev. {m.revision})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newMapTitle}
                onChange={(e) => setNewMapTitle(e.target.value)}
                placeholder="Название новой карты..."
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 min-w-[180px]"
              />
              <button
                onClick={() => {
                  if (newMapTitle.trim()) {
                    void onCreateNewMap(newMapTitle.trim());
                    setNewMapTitle('');
                  }
                }}
                className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 whitespace-nowrap"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>Создать карту</span>
              </button>
              <button
                onClick={onOpenHotspotEditor}
                className="bg-slate-900 dark:bg-slate-800 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 whitespace-nowrap"
              >
                <Icon name="rotate-3d" className="w-3.5 h-3.5" />
                <span>Разметка 360° хотспотов</span>
              </button>
            </div>
          </div>
        )}

        {/* Admin Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <button
            onClick={() => setAdminTab('editor')}
            className={`pb-3 px-4 text-sm whitespace-nowrap ${
              adminTab === 'editor' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            Редактор и Инструменты
          </button>
          <button
            onClick={() => setAdminTab('analytics')}
            className={`pb-3 px-4 text-sm whitespace-nowrap ${
              adminTab === 'analytics' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            {t.analyticsTitle}
          </button>
        </div>

        {/* TAB 1: Editor & Markup Tools */}
        {adminTab === 'editor' && (
          <PlanEditor
            mapId={activeMapId}
            widthUnits={organizerMap?.snapshot.width_units ?? 700}
            heightUnits={organizerMap?.snapshot.height_units ?? 500}
            document={mapDoc}
            darkMode={darkMode}
            isAuthenticated={isAuthenticated}
            onChangeDocument={onChangeDocument}
            onSaveDocument={onSaveDocument}
            onNotify={onNotify}
            captureSlot={
              <CaptureGuide
                mapId={activeMapId}
                isAuthenticated={isAuthenticated}
                onNotify={onNotify}
                onPanoramaAssetReady={handlePanoramaAssetReady}
              />
            }
          />
        )}

        {/* TAB 2: Analytics (Update Design Dark Cards & Chart) */}
        {adminTab === 'analytics' && (
          <div className="space-y-6 animate-view-enter">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-white">{t.analyticsTitle}</h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">{t.analyticsSub}</p>
              </div>
              <div className="bg-slate-800 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-700 self-start sm:self-auto flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{lang === 'ru' ? 'Обновлено: Сегодня' : 'Updated: Today'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-lg">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Просмотров карты
                </p>
                <div className="text-3xl sm:text-4xl font-black text-white">14,820</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-lg">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Построенных маршрутов
                </p>
                <div className="text-3xl sm:text-4xl font-black text-white">3,410</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-lg">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Просмотров 360-панорам
                </p>
                <div className="text-3xl sm:text-4xl font-black text-white">8,950</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-lg">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Офлайн сессий
                </p>
                <div className="text-3xl sm:text-4xl font-black text-white">1,120</div>
              </div>
            </div>

            <div className="border border-slate-800 rounded-3xl p-6 bg-slate-900 shadow-sm">
              <h4 className="font-bold text-slate-200 text-sm mb-4">
                Пиковые часы посещаемости объектов
              </h4>
              <div className="h-64 w-full">
                <canvas id="analyticsChart" ref={canvasRef} className="w-full h-full" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
