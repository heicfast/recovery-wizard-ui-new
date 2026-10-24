import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { zhCN } from './zh-CN';

export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = 'rw.ui.locale';

function detectLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh-CN') return stored;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: detectLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Contract ScanStage → i18n key. Lives here so tests can assert resolvability. */
export const SCAN_STAGE_I18N_KEYS = {
  'volume-analysis': 'scan.stageVolumeAnalysis',
  'quick-index': 'scan.stageQuickIndex',
  'deep-walk': 'scan.stageDeepWalk',
  carve: 'scan.stageCarve',
  'tree-build': 'scan.stageTreeBuild',
} as const;

export function setLocale(locale: AppLocale): void {
  void i18next.changeLanguage(locale);
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = locale;
}

document.documentElement.lang = i18next.language ?? 'en';

export { i18next };
