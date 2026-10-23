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
import { i18n, Lang, RichPoiItem, SpaceDefinition } from '../../shared/spacesData';
import { CaptureGuide } from '../capture';
import { PlanEditor } from '../plan';

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
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
        },
        true,
      );
      onNotify(lang === 'ru' ? 'Успешный вход в API ТТК!' : 'Successfully logged in!');
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 422 || err.status === 429)) {
        onNotify(err.message);
      } else {
        onLoginSuccess(
          {
            name: name.trim() || 'Алексей Шереметьев',
            email: email.trim(),
            role: 'Сотрудник ТТК',
          },
          false,
        );
        onNotify(lang === 'ru' ? 'Успешный вход!' : 'Successfully logged in!');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    if (!email.trim() || !password || !name.trim()) {
      onNotify(lang === 'ru' ? 'Заполните все поля регистрации!' : 'Fill in all registration fields!');
      return;
    }
    onLoginSuccess(
      {
        name: name.trim(),
        email: email.trim(),
        role,
      },
      false,
    );
    onNotify(lang === 'ru' ? 'Регистрация завершена!' : 'Registration complete!');
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 flex items-center justify-center custom-scrollbar animate-view-enter">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 my-auto">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{t.authTitle}</h2>
          <p className="text-xs text-slate-500">Личный кабинет сотрудника или организатора</p>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700">
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
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 flex items-center justify-between">
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
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alexey@ttk.ru"
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Роль</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm"
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
  user: UserProfile | null;
  currentSpace: SpaceDefinition;
  favorites: string[];
  onToggleFavorite: (poiId: string) => void;
  onSelectPoiOnMap: (poi: RichPoiItem) => void;
  onLogout: () => void;
  onOpenAdminEditor: () => void;
}

export const CabinetView: React.FC<CabinetViewProps> = ({
  user,
  currentSpace,
  favorites,
  onToggleFavorite,
  onSelectPoiOnMap,
  onLogout,
  onOpenAdminEditor,
}: CabinetViewProps) => {
  const [cabinetTab, setCabinetTab] = useState<'favorites' | 'maps'>('favorites');
  const favoritePois = currentSpace.pois.filter(
    (p) => favorites.includes(p.id) || (p.legacyId !== undefined && favorites.includes(String(p.legacyId))),
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar animate-view-enter">
      <div className="max-w-5xl mx-auto space-y-6 pb-8">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-2xl">
              АШ
            </div>
            <div>
              <h1 className="text-xl font-bold">{user ? user.name : 'Алексей Шереметьев'}</h1>
              <p className="text-xs text-slate-500">{user ? user.email : 'alexey.sheremetev@ttk.ru'}</p>
              <span className="inline-block mt-1 text-[11px] bg-slate-100 dark:bg-slate-700 px-2.5 py-0.5 rounded-full font-semibold">
                {user?.role ?? 'Организатор ТТК'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAdminEditor}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition shadow-sm"
            >
              Перейти в редактор карт
            </button>
            <button onClick={onLogout} className="text-xs text-red-500 hover:underline font-semibold">
              Выйти
            </button>
          </div>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setCabinetTab('favorites')}
            className={`pb-3 px-4 text-sm ${
              cabinetTab === 'favorites' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            Избранные точки ({favoritePois.length})
          </button>
        </div>

        {cabinetTab === 'favorites' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {favoritePois.length === 0 ? (
              <div className="col-span-3 p-8 text-center text-sm text-slate-500 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                В избранном пока нет точек на выбранной карте. Нажмите на сердечко в карточке точки на карте!
              </div>
            ) : (
              favoritePois.map((poi) => (
                <div
                  key={poi.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3 shadow-sm"
                >
                  <div className="h-32 rounded-xl overflow-hidden relative">
                    <img src={poi.image} alt={poi.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => onToggleFavorite(poi.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-red-500"
                      title="Удалить"
                    >
                      <Icon name="trash-2" className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{poi.name}</h3>
                  <p className="text-xs text-slate-500">
                    Корпус {poi.building}, Этаж {poi.floor}
                  </p>
                  <button
                    onClick={() => onSelectPoiOnMap(poi)}
                    className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 py-2 rounded-xl text-xs font-semibold transition"
                  >
                    Показать на карте
                  </button>
                </div>
              ))
            )}
          </div>
        )}
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
const CHART_DATA = [120, 450, 890, 1100, 750, 410, 180];

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
  const [adminTab, setAdminTab] = useState<'analytics' | 'editor'>('analytics');
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

    ctx.strokeStyle = darkMode ? '#334155' : '#e2e8f0';
    ctx.fillStyle = darkMode ? '#94a3b8' : '#64748b';
    ctx.font = '11px Inter, sans-serif';
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
    ctx.fillStyle = 'rgba(227, 6, 19, 0.12)';
    ctx.fill();

    // Smooth line
    ctx.beginPath();
    points.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#E30613';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Points & X labels
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#E30613';
      ctx.fill();
      ctx.fillStyle = darkMode ? '#94a3b8' : '#64748b';
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
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
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
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar animate-view-enter">
      <div className="max-w-6xl mx-auto space-y-6 pb-8">
        {/* Header */}
        <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">Панель администратора и аналитика ТТК</h1>
            <p className="text-xs text-slate-400 mt-1">
              Управление объектами, статистика просмотров, съемка с камеры и ИИ-генерация планов
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTogglePublish}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition ${
                mapDoc.is_published
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
              }`}
            >
              {mapDoc.is_published ? 'Опубликовано (Снять с публикации)' : 'Черновик (Опубликовать)'}
            </button>
            <button
              onClick={() => setShowEmbedModal(!showEmbedModal)}
              className="bg-white/10 hover:bg-white/20 text-white px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Icon name="share-2" className="w-4 h-4 shrink-0" /> <span>Поделиться / Embed</span>
            </button>
          </div>
        </div>

        {/* Public Link & Safe Iframe Snippet Box */}
        {showEmbedModal && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-3 text-xs shadow-md animate-view-enter">
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
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">HTML-код для встраивания (iframe):</label>
                <input
                  readOnly
                  value={iframeSnippet}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* 412 Version Conflict Alert */}
        {versionConflictRevision !== null && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 animate-view-enter">
            <div>
              <p className="font-bold">Конфликт версий (412 VERSION_CONFLICT): карта была изменена в другой сессии (ревизия {versionConflictRevision}).</p>
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-slate-500 shrink-0">Карта в редакторе:</span>
              <select
                value={activeMapId}
                onChange={(e) => onSelectOwnedMap(e.target.value)}
                className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-1.5 font-semibold max-w-full sm:max-w-[300px] truncate"
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
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 min-w-[180px]"
              />
              <button
                onClick={() => {
                  if (newMapTitle.trim()) {
                    onCreateNewMap(newMapTitle.trim());
                    setNewMapTitle('');
                  }
                }}
                className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 whitespace-nowrap"
              >
                <Icon name="plus" className="w-3.5 h-3.5" /> <span>Создать карту</span>
              </button>
              <button
                onClick={onOpenHotspotEditor}
                className="bg-slate-900 dark:bg-slate-700 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 whitespace-nowrap"
              >
                <Icon name="rotate-3d" className="w-3.5 h-3.5" /> <span>Разметка 360° хотспотов</span>
              </button>
            </div>
          </div>
        )}

        {/* Admin Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <button
            onClick={() => setAdminTab('analytics')}
            className={`pb-3 px-4 text-sm whitespace-nowrap ${
              adminTab === 'analytics' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            Аналитика и Графика
          </button>
          <button
            onClick={() => setAdminTab('editor')}
            className={`pb-3 px-4 text-sm whitespace-nowrap ${
              adminTab === 'editor' ? 'border-b-2 border-brand-600 text-brand-600 font-bold' : 'text-slate-500'
            }`}
          >
            {t.editorTitle}
          </button>
        </div>

        {/* TAB 1: Analytics */}
        {adminTab === 'analytics' && (
          <div className="space-y-6 animate-view-enter">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-interactive p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">Просмотров карты</p>
                <p className="text-2xl font-bold mt-1">14,820</p>
                <span className="text-[11px] text-emerald-600 font-semibold">+18% за неделю</span>
              </div>
              <div className="card-interactive p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">Построенных маршрутов</p>
                <p className="text-2xl font-bold mt-1">3,410</p>
                <span className="text-[11px] text-emerald-600 font-semibold">+12% за неделю</span>
              </div>
              <div className="card-interactive p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">Просмотров 360-панорам</p>
                <p className="text-2xl font-bold mt-1">8,950</p>
                <span className="text-[11px] text-emerald-600 font-semibold">+24% за неделю</span>
              </div>
              <div className="card-interactive p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <p className="text-xs text-slate-500 font-medium">Офлайн сессий</p>
                <p className="text-2xl font-bold mt-1">1,120</p>
                <span className="text-[11px] text-slate-500 font-medium">PWA кэш</span>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 sm:p-6 bg-white dark:bg-slate-800 shadow-sm">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-4">
                Пиковые часы посещаемости объектов
              </h3>
              <div className="h-64 w-full">
                <canvas id="analyticsChart" ref={canvasRef} className="w-full h-full" />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Point Editor, Camera Panorama Capture & AI Blueprint Generator */}
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
      </div>
    </div>
  );
};
