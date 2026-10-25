import React, { useState } from 'react';
import { AuthFormState, TranslationDictionary } from '../types';

interface AuthViewProps {
  t: TranslationDictionary;
  authForm: AuthFormState;
  setAuthForm: React.Dispatch<React.SetStateAction<AuthFormState>>;
  loginUser: (targetRole?: 'user' | 'organizer') => void;
  registerUser?: (targetRole?: 'user' | 'organizer') => void;
  busy: boolean;
  error: string;
}

export const AuthView: React.FC<AuthViewProps> = ({
  t,
  authForm,
  setAuthForm,
  loginUser,
  registerUser,
  busy,
  error,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(authForm.mode ?? 'login');
  const [accountType, setAccountType] = useState<'user' | 'organizer'>('organizer');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'register' && registerUser) {
      registerUser(accountType);
    } else {
      loginUser(accountType);
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center min-h-[580px] bg-slate-50 dark:bg-slate-950">
      {/* Карточка авторизации/регистрации */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 max-w-sm sm:max-w-md w-full shadow-xl space-y-6">
        {/* Логотип ТТК крупно */}
        <div className="flex flex-col items-center pt-1 text-center">
          <img src="/ttk-logo.png" alt="ТТК" className="h-10 sm:h-12 w-auto object-contain mb-1" />
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2">
            {mode === 'register' ? 'Регистрация аккаунта' : 'Вход в аккаунт'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'register'
              ? 'Выберите тип кабинета и создайте учетную запись'
              : 'Доступ к картам, навигации и личным настройкам'}
          </p>
        </div>

        {/* Переключатель табов: Вход / Регистрация */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setAuthForm((prev) => ({ ...prev, mode: 'login' }));
            }}
            className={`py-2 px-3 text-xs sm:text-sm font-bold rounded-xl transition ${
              mode === 'login'
                ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setAuthForm((prev) => ({ ...prev, mode: 'register' }));
            }}
            className={`py-2 px-3 text-xs sm:text-sm font-bold rounded-xl transition ${
              mode === 'register'
                ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Выбор роли аккаунта */}
        <div className="space-y-1.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {mode === 'register' ? 'Тип аккаунта:' : 'Роль для входа:'}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAccountType('user')}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                accountType === 'user'
                  ? 'border-[#FF4900] bg-orange-50/40 dark:bg-orange-950/20 text-slate-900 dark:text-white shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
              }`}
            >
              <span className="text-xs font-bold">Пользователь</span>
              <span className="text-[10px] text-slate-400 leading-tight">Просмотр и навигация</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountType('organizer')}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                accountType === 'organizer'
                  ? 'border-[#FF4900] bg-orange-50/40 dark:bg-orange-950/20 text-slate-900 dark:text-white shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
              }`}
            >
              <span className="text-xs font-bold">Организатор</span>
              <span className="text-[10px] text-slate-400 leading-tight">Редактор планов и карт</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
            {accountType === 'user'
              ? 'ℹ️ У пользователя нет доступа к редактору. Доступны просмотр пространств, навигация и избранное.'
              : '⭐ Организатор создаёт и редактирует 2D-планы, размечает объекты и загружает панорамы.'}
          </p>
        </div>

        {/* Форма ввода */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="organizer-email"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Email
            </label>
            <input
              id="organizer-email"
              type="email"
              autoComplete="username"
              required
              value={authForm.email}
              onChange={(e) =>
                setAuthForm((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="organizer@example.org"
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs"
            />
          </div>

          <div>
            <label
              htmlFor="organizer-password"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Пароль
            </label>
            <div className="relative">
              <input
                id="organizer-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={12}
                maxLength={128}
                required
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Не менее 12 символов"
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-11 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1.5 focus:outline-none"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="organizer-confirm-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Повторите пароль
              </label>
              <div className="relative">
                <input
                  id="organizer-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={authForm.confirmPassword ?? ''}
                  onChange={(e) =>
                    setAuthForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                  }
                  placeholder="Повторите введенный пароль"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl pl-4 pr-11 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1.5 focus:outline-none"
                  aria-label={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  title={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showConfirmPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium" role="alert">
              {error}
            </div>
          )}

          {/* Основная кнопка отправки формы */}
          <button
            type="submit"
            disabled={busy}
            className="btn-ttk w-full bg-[#E31B23] hover:bg-[#FF4900] active:scale-[0.98] disabled:opacity-60 text-white font-bold h-12 sm:h-13 rounded-2xl transition shadow-md flex items-center justify-center text-sm sm:text-base mt-2"
          >
            {busy
              ? 'Обработка…'
              : mode === 'register'
              ? 'Зарегистрироваться'
              : 'Войти в систему'}
          </button>

          {mode === 'login' && (
            <div className="text-center pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  alert('Для сброса пароля обратитесь к куратору кейса @VLAADOS1.');
                }}
                className="text-xs font-semibold text-[#FF4900] hover:underline"
              >
                Забыли пароль?
              </button>
            </div>
          )}
        </form>

        {/* Второстепенная плашка-кнопка */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              const nextMode = mode === 'login' ? 'register' : 'login';
              setMode(nextMode);
              setAuthForm((prev) => ({ ...prev, mode: nextMode }));
            }}
            className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold h-12 rounded-2xl flex items-center justify-center transition text-xs sm:text-sm"
          >
            {mode === 'login' ? 'Создать новый аккаунт' : 'Уже зарегистрированы? Войти'}
          </button>
        </div>
      </div>
    </div>
  );
};