import React from 'react';
import { ShieldCheck, Trash2, ArrowRight } from '../icons';
import {
  FavoriteItem,
  Language,
  SpaceKey,
  TranslationDictionary,
  UserProfile,
} from '../types';

interface CabinetViewProps {
  t: TranslationDictionary;
  lang: Language;
  user: UserProfile | null;
  attemptAdminAccess: () => void;
  logoutUser: () => void;
  favoriteItemsList: FavoriteItem[];
  toggleFavorite: (id: SpaceKey | number, e?: React.MouseEvent) => void;
  openFavoriteItem: (item: FavoriteItem) => void;
}

export const CabinetView: React.FC<CabinetViewProps> = ({
  t,
  lang,
  user,
  attemptAdminAccess,
  logoutUser,
  favoriteItemsList,
  toggleFavorite,
  openFavoriteItem,
}) => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-xl shadow-inner">
              {user ? user.name.slice(0, 2).toUpperCase() : '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {user ? user.name : 'Гость'}
                </h1>
                {user && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                      user.role === 'admin' || user.role === 'organizer' || user.role === 'Организатор'
                        ? 'bg-red-100 text-[#E31B23] dark:bg-red-950/40'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {user.role === 'admin' || user.role === 'organizer' || user.role === 'Организатор'
                      ? 'Организатор'
                      : 'Пользователь'}
                  </span>
                )}
              </div>
              {user && <p className="text-xs text-slate-500">{user.email}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Кнопка "Управлять картами" отображается ТОЛЬКО администраторам и организаторам после входа */}
            {user && (user.role === 'admin' || user.role === 'organizer' || user.role === 'Организатор') && (
              <button
                onClick={attemptAdminAccess}
                className="btn-ttk bg-slate-900 hover:bg-[#FF4900] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs"
              >
                <ShieldCheck className="w-4 h-4 text-brand-500" />
                <span>{t.adminLinkTitle}</span>
              </button>
            )}
            {user && (
              <button
                onClick={logoutUser}
                className="text-xs text-rose-500 hover:text-rose-600 font-bold px-3 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
              >
                Выйти
              </button>
            )}
          </div>
        </div>

        <div className="border-b border-slate-200 dark:border-slate-800 pb-2">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
            {t.favoritesHeader}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoriteItemsList.map((item) => (
            <div
              key={String(item.id)}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-xs relative group"
            >
              <div className="h-40 rounded-xl overflow-hidden relative">
                <img
                  src={item.image}
                  alt={item.name[lang]}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
                <div className="absolute inset-0 bg-white/10 dark:bg-transparent pointer-events-none" />

                <button
                  onClick={(e) => toggleFavorite(item.id, e)}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-white/90 dark:bg-slate-800/90 text-rose-500 shadow-md hover:scale-110 transition z-10"
                  title="Удалить из избранного"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {item.name[lang] || String(item.name)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.desc ? item.desc[lang] : t.savedObjectDesc}
                </p>
              </div>
              <button
                onClick={() => openFavoriteItem(item)}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <span>{t.goToMapBtn}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
