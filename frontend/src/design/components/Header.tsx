import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Moon,
  Sun,
  User,
  LogIn,
  MapPin,
  ChevronDown,
  Menu,
} from '../icons';
import { Language, TranslationDictionary, UserProfile, ViewType } from '../types';

interface HeaderProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  t: TranslationDictionary;
  attemptAdminAccess: () => void;
  topSearchQuery: string;
  setTopSearchQuery: (q: string) => void;
  executeTopSearch: () => void;
  lang: Language;
  switchLanguage: (lang: Language) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  user: UserProfile | null;
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasCreatedPlan?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  t,
  attemptAdminAccess,
  topSearchQuery,
  setTopSearchQuery,
  executeTopSearch,
  lang,
  switchLanguage,
  darkMode,
  toggleDarkMode,
  user,
  selectedCity,
  setSelectedCity,
  mobileMenuOpen,
  setMobileMenuOpen,
  hasCreatedPlan = false,
}: HeaderProps) => {
  const [cityOpen, setCityOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(event.target as Node)
      ) {
        setCityOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="ttk-site-header bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-40 shadow-xs w-full">
      <div className="ttk-site-header__inner max-w-7xl mx-auto px-1 sm:px-2 h-16 flex items-center justify-between gap-3">
        {/* Левая группа: Логотип и меню навигации, сдвинутые максимально влево */}
        <div className="flex items-center space-x-3 lg:space-x-4 shrink-0">
          {/* Блок логотипа ТТК и статуса официального партнера */}
          <div
            className="ttk-site-header__logo flex items-center cursor-pointer select-none shrink-0"
            onClick={() => setCurrentView('spaces')}
          >
            <div className="flex flex-col items-start leading-none">
              <img src="/ttk-logo.png" alt="ТТК" className="h-7 w-auto object-contain" />
              <span className="text-[8px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                {t.officialPartner}
              </span>
            </div>
          </div>

          {/* Центральное десктопное меню навигации с равными интервалами */}
          <nav className="hidden md:flex items-center space-x-1.5 lg:space-x-2.5 whitespace-nowrap">
            <button
              onClick={() => setCurrentView('spaces')}
              className={`px-3 py-1.5 rounded-xl text-xs transition-all duration-200 text-center ${
                currentView === 'spaces'
                  ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t.navSpaces}
            </button>

            {/* Кнопка "Карта здания" появляется ТОЛЬКО когда пользователь создал план здания с помещениями и дверями */}
            {hasCreatedPlan && (
              <button
                onClick={() => setCurrentView('map')}
                className={`px-3 py-1.5 rounded-xl text-xs transition-all duration-200 text-center ${
                  currentView === 'map'
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.navMap}
              </button>
            )}

            {user && (
              <button
                onClick={() => setCurrentView('cabinet')}
                className={`px-3 py-1.5 rounded-xl text-xs transition-all duration-200 text-center ${
                  currentView === 'cabinet'
                    ? 'bg-slate-100 dark:bg-slate-800 text-brand-600 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.navCabinet}
              </button>
            )}
          </nav>
        </div>

        <form
          className="ttk-site-header__search hidden lg:flex items-center gap-1 min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            executeTopSearch();
          }}
          role="search"
        >
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="search"
            value={topSearchQuery}
            onChange={(event) => setTopSearchQuery(event.target.value)}
            aria-label="Ссылка или код карты"
            placeholder="Ссылка или код карты"
            className="min-w-0 w-44 xl:w-56 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
          />
          <button type="submit" className="px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
            Открыть
          </button>
        </form>

        {/* Правая группа системных элементов управления */}
        <div className="ttk-site-header__actions flex items-center space-x-2 shrink-0">
          {/* Переключатель языка интерфейса RU / EN */}
          <div className="ttk-site-header__language flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              onClick={() => switchLanguage('ru')}
              className={`px-2 py-1 rounded-lg transition ${
                lang === 'ru'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              RU
            </button>
            <button
              onClick={() => switchLanguage('en')}
              className={`px-2 py-1 rounded-lg transition ${
                lang === 'en'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              EN
            </button>
          </div>

          {/* Переключатель цветовой темы сайта (Dark / Light) */}
          <button
            onClick={toggleDarkMode}
            className="ttk-site-header__theme w-8 h-8 rounded-xl text-base hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 flex items-center justify-center leading-none"
            title="Переключить тему"
            aria-label="Переключить тему"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          {/* Кнопка авторизации / профиля пользователя */}
          {user ? (
            <button
              onClick={() => setCurrentView('cabinet')}
              className="ttk-site-header__auth flex items-center space-x-1.5 bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="ttk-site-header__auth-label hidden sm:inline">{user.name}</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentView('auth')}
              className="ttk-site-header__auth flex items-center space-x-1.5 bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span className="ttk-site-header__auth-label">{t.navLogin}</span>
            </button>
          )}

          {/* Селектор выбора города (ПОСЛЕДНЯЯ КНОПКА СПРАВА С МИНИМАЛЬНЫМ ИНТЕРВАЛОМ ДО КРАЯ) */}
          <div className="ttk-site-header__city relative shrink-0" ref={cityDropdownRef}>
            <button
              onClick={() => setCityOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition shadow-xs whitespace-nowrap"
            >
              <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span>{selectedCity}</span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {cityOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-2 z-50 text-xs font-medium">
                <button
                  onClick={() => {
                    setSelectedCity('г. Ростов-на-Дону');
                    setCityOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-brand-600 font-bold"
                >
                  <span>г. Ростов-на-Дону</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
                </button>

                <button
                  onClick={() => {
                    setSelectedCity('г. Москва');
                    setCityOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  г. Москва
                </button>

                <button
                  onClick={() => {
                    setSelectedCity('г. Санкт-Петербург');
                    setCityOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  г. Санкт-Петербург
                </button>

                <button
                  onClick={() => {
                    setSelectedCity('г. Краснодар');
                    setCityOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  г. Краснодар
                </button>
              </div>
            )}
          </div>

          {/* Кнопка гамбургер-меню для мобильных устройств */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="ttk-site-header__menu md:hidden p-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Выпадающий список мобильной навигации */}
      {mobileMenuOpen && (
        <div className="ttk-site-header__mobile-menu md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-4 space-y-3">
          <form
            className="ttk-site-header__mobile-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              executeTopSearch();
              setMobileMenuOpen(false);
            }}
          >
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5" htmlFor="mobile-map-search">
              Открыть карту по ссылке или коду
            </label>
            <div className="flex gap-2">
              <input
                id="mobile-map-search"
                type="search"
                value={topSearchQuery}
                onChange={(event) => setTopSearchQuery(event.target.value)}
                placeholder="Вставьте ссылку / slug"
                className="min-w-0 flex-1 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
              <button type="submit" className="px-4 rounded-xl bg-brand-600 text-white text-xs font-bold">
                Открыть
              </button>
            </div>
          </form>

          <button
            onClick={() => {
              setCurrentView('spaces');
              setMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-2 rounded-xl font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t.navSpaces}
          </button>

          {hasCreatedPlan && (
            <button
              onClick={() => {
                setCurrentView('map');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2 rounded-xl font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t.navMap}
            </button>
          )}

          {user && (
            <button
              onClick={() => {
                setCurrentView('cabinet');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-2 rounded-xl font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t.navCabinet}
            </button>
          )}

          <div className="ttk-site-header__settings flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span className="text-[11px] font-bold text-slate-400 mr-auto">Настройки</span>
            <select
              value={selectedCity}
              onChange={(event) => setSelectedCity(event.target.value)}
              aria-label="Город"
              className="max-w-[9rem] min-h-[40px] px-2 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-0"
            >
              <option>г. Ростов-на-Дону</option>
              <option>г. Москва</option>
              <option>г. Санкт-Петербург</option>
              <option>г. Краснодар</option>
            </select>
            <button
              type="button"
              onClick={() => switchLanguage(lang === 'ru' ? 'en' : 'ru')}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              {lang === 'ru' ? 'EN' : 'RU'}
            </button>
            <button
              type="button"
              onClick={toggleDarkMode}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              {darkMode ? 'Светлая тема' : 'Тёмная тема'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
