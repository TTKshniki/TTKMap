import React, { useState } from 'react';
import {
  Map,
  Heart,
  Rotate3d,
  Sparkles,
  ArrowRight,
  Search,
} from '../icons';
import {
  Language,
  SpaceItem,
  SpaceKey,
  TranslationDictionary,
  UserProfile,
  ViewType,
} from '../types';
import { SHOWCASE_MAP_SLUG } from '../../shared/showcase';

interface SpacesViewProps {
  t: TranslationDictionary;
  lang: Language;
  user: UserProfile | null;
  setCurrentView: (view: ViewType) => void;
  spaceList: SpaceKey[];
  spacesData: Record<SpaceKey, SpaceItem>;
  currentSpaceKey: SpaceKey;
  selectSpaceAndOpenMap: (key: SpaceKey) => void;
  openSpaceFullPage: (key: SpaceKey) => void;
  isFavorite: (id: SpaceKey | number) => boolean;
  toggleFavorite: (id: SpaceKey | number, e?: React.MouseEvent) => void;
  triggerMetallicFlash: (e: React.MouseEvent<HTMLDivElement>) => void;
  showNotification: (msg: string) => void;
  onOpenPublicMap?: (slug: string) => void;
}

export const SpacesView: React.FC<SpacesViewProps> = ({
  t,
  lang,
  user,
  setCurrentView,
  spaceList,
  spacesData,
  currentSpaceKey,
  selectSpaceAndOpenMap,
  openSpaceFullPage,
  isFavorite,
  toggleFavorite,
  triggerMetallicFlash,
  showNotification,
  onOpenPublicMap,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSpaces = spaceList.filter((key) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const space = spacesData[key];
    if (!space) return false;
    return (
      space.name[lang].toLowerCase().includes(q) ||
      space.desc[lang].toLowerCase().includes(q) ||
      space.type[lang].toLowerCase().includes(q)
    );
  });

  return (
    <div className="spaces-page p-4 sm:p-6 lg:p-8 custom-scrollbar relative">
      {/* Фоновый светлый градиент-аура */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-r from-red-100/40 via-rose-50/20 to-amber-50/30 blur-3xl pointer-events-none dark:hidden" />

      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        {/* Промо-баннер с белой полупрозрачной пленкой */}
        <div className="spaces-hero bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-[360px] relative">
          <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-between space-y-6 z-10 bg-white/90 dark:bg-slate-900/90 border-r-0 lg:border-r border-slate-200 dark:border-slate-800">
            <div className="space-y-4">
              <span className="bg-[#E31B23] text-white text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider inline-block shadow-xs">
                ТТК · КАРТА ПРОСТРАНСТВА
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-slate-900 dark:text-white">
                {t.heroTitle}
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                {t.heroDesc}
              </p>
            </div>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (user) {
                    setCurrentView('map');
                  } else {
                    showNotification(
                      lang === 'ru'
                        ? 'Войдите в аккаунт для просмотра интерактивной карты'
                        : 'Sign in to access interactive map'
                    );
                    setCurrentView('auth');
                  }
                }}
                className="btn-ttk bg-[#E31B23] hover:bg-[#FF4900] text-white font-bold px-5 py-2.5 rounded-xl shadow-md transition-all text-xs sm:text-sm flex items-center gap-2"
              >
                <Map className="w-4 h-4" />
                <span>{t.openMapBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenPublicMap?.(SHOWCASE_MAP_SLUG)}
                className="showcase-open-button bg-white text-[#1d6860] border border-[#b8d2c8] font-bold px-5 py-2.5 rounded-xl text-xs sm:text-sm flex items-center gap-2"
              >
                <Rotate3d className="w-4 h-4" />
                <span>Показать эталонную демо-карту</span>
              </button>
            </div>
          </div>

          {/* Изображение баннера */}
          <div
            className="relative bg-cover bg-center min-h-[260px] lg:min-h-full"
            style={{
              backgroundImage: "linear-gradient(135deg, rgba(32,60,60,.9), rgba(215,25,32,.35)), url('/photos/photo-4.jpg')",
              backgroundColor: '#dfe9e5',
            }}
          >
            <div className="absolute inset-0 bg-white/75 dark:bg-slate-950/60 backdrop-blur-[1px]" />
          </div>
        </div>

        <section className="showcase-capabilities" aria-label="Возможности TTKMap">
          <div>
            <span>01</span>
            <strong>План и изометрия</strong>
            <p>Переключение между 2D-планом и объёмной моделью.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Поиск и навигация</strong>
            <p>Категории объектов, маршруты и подсказки по проходу.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Панорамы 360°</strong>
            <p>Интерактивные точки и переходы между связанными панорамами.</p>
          </div>
          <div>
            <span>04</span>
            <strong>Организаторский контур</strong>
            <p>Редактор, публикация, мобильная съёмка и публичная ссылка.</p>
          </div>
          <p className="showcase-capabilities__note">
            В демо 360°-сцены — синтетические иллюстрации для показа интерфейса, не реальные фотографии и не результат склейки.
          </p>
        </section>

        {/* Сетка карточек пространств с поиском справа от заголовка */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {t.spacesTitle}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {t.spacesSub}
              </p>
            </div>

            {/* Поле поиска справа от надписи "Пространства и объекты" */}
            <div className="relative w-full sm:w-72 lg:w-80 shrink-0">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FF4900] shadow-xs text-slate-900 dark:text-white placeholder:text-slate-400 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Карточки объектов */}
            {filteredSpaces.map((key) => {
              const space = spacesData[key];
              if (!space) return null;
              return (
                <div
                  key={key}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 cursor-pointer group flex flex-col relative ${
                    currentSpaceKey === key ? 'ring-2 ring-brand-600' : ''
                  }`}
                  onClick={() => {
                    if (user) {
                      selectSpaceAndOpenMap(key);
                    } else {
                      showNotification(
                        lang === 'ru'
                          ? 'Войдите в аккаунт для просмотра карты здания'
                          : 'Sign in to view building map'
                      );
                      setCurrentView('auth');
                    }
                  }}
                >
                  <div className="space-card__image h-52 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                    <img
                      src={space.image}
                      alt={space.name[lang]}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />

                    {/* Белая пленка поверх картинки карточки для светлой темы */}
                    <div className="absolute inset-0 bg-white/20 dark:bg-transparent backdrop-blur-[0.5px] pointer-events-none" />

                    <div className="absolute top-3 left-3 bg-brand-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider shadow z-10">
                      {space.type[lang]}
                    </div>

                    {/* Избранное отображается только для авторизованных пользователей */}
                    {user && (
                      <button
                        onClick={(e) => toggleFavorite(space.id, e)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-md flex items-center justify-center transition hover:scale-110 z-10"
                      >
                        <Heart
                          className={`w-4 h-4 transition-colors ${
                            isFavorite(space.id)
                              ? 'fill-rose-500 text-rose-500'
                              : 'fill-transparent stroke-slate-500'
                          }`}
                        />
                      </button>
                    )}

                    <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-md text-white text-xs px-3 py-1 rounded-lg font-bold border border-white/10 z-10">
                      {space.price}
                    </div>
                  </div>

                  <div className="space-card__body p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                        <span>★</span>
                        <span>{space.rating}</span>
                        <span className="text-slate-400 font-normal">
                          ({space.reviewsCount})
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-brand-600 transition">
                        {space.name[lang]}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed line-clamp-2">
                        {space.desc[lang]}
                      </p>
                    </div>

                    <div className="space-card__actions flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (user) {
                            selectSpaceAndOpenMap(key);
                          } else {
                            showNotification(
                              lang === 'ru'
                                ? 'Войдите в аккаунт для просмотра карты здания'
                                : 'Sign in to view building map'
                            );
                            setCurrentView('auth');
                          }
                        }}
                        className="btn-ttk text-brand-600 hover:text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition"
                      >
                        <Map className="w-3.5 h-3.5" />
                        <span>{t.openMapBtn || 'Открыть карту'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openSpaceFullPage(key);
                        }}
                        className="btn-ttk bg-slate-100 hover:bg-[#FF4900] hover:text-white dark:bg-slate-800 dark:hover:bg-[#FF4900] text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 shadow-xs"
                      >
                        <span>{t.panoBtn || 'Панорама 360°'}</span>
                        <Rotate3d className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* СПЕЦИАЛЬНЫЙ БЛОК ДЛЯ ДОБАВЛЕНИЯ ПЛОЩАДКИ */}
            <div
              onClick={triggerMetallicFlash}
              className="bg-slate-50/80 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-3 flex flex-col items-center justify-center cursor-pointer group hover:border-brand-600 transition-all duration-300 shadow-xs relative overflow-hidden min-h-[320px]"
            >
              <div className="w-full h-full bg-white/90 dark:bg-slate-800/80 rounded-xl p-5 border border-slate-200/80 dark:border-slate-700/80 flex flex-col items-center justify-center text-center space-y-3 shadow-inner relative group-hover:bg-brand-50/30 dark:group-hover:bg-slate-800 transition">
                <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 flex items-center justify-center shadow-xs group-hover:scale-110 transition">
                  <Sparkles className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {t.moreVenuesTitle}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t.moreVenuesDesc}
                  </p>
                </div>

                <div className="btn-ttk inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-[#FF4900] text-white rounded-xl text-xs font-bold transition shadow-xs">
                  <span>{t.viewMoreBtn}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
