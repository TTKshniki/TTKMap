import React from 'react';
import { TranslationDictionary } from '../types';

interface FooterProps {
  t?: TranslationDictionary;
}

export const Footer: React.FC<FooterProps> = () => {
  return (
    <footer className="w-full mt-auto py-8 px-4 sm:px-8 bg-transparent text-slate-500 dark:text-slate-400 text-xs border-t border-slate-200/40 dark:border-slate-800/40">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1">
          <span className="font-semibold text-slate-700 dark:text-slate-200 tracking-tight">Pixel minds</span>
          <span className="text-slate-400 dark:text-slate-500 text-[10px] font-semibold uppercase">TM</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>2026</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>Все права защищены</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-slate-400 dark:text-slate-500">Не является коммерческим продуктом</span>
        </div>

        <div className="flex items-center space-x-1.5 text-xs">
          <span>Связь:</span>
          <a
            href="https://t.me/C_PrIvEt0M"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium transition"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
            </svg>
            <span>@C_PrIvEt0M</span>
          </a>
        </div>
      </div>
    </footer>
  );
};
