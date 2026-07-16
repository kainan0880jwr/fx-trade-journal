import { NativeModules, Platform } from 'react-native';
import { ja, type LangStrings } from './ja';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { es } from './es';
import { it } from './it';

export type SupportedLang = 'ja' | 'en' | 'de' | 'fr' | 'es' | 'it';

const SUPPORTED_LANGS: SupportedLang[] = ['ja', 'de', 'fr', 'es', 'it'];

function resolveLang(code: string): SupportedLang {
  const base = code.slice(0, 2).toLowerCase();
  return (SUPPORTED_LANGS as string[]).includes(base) ? (base as SupportedLang) : 'en';
}

function detectLang(): SupportedLang {
  try {
    if (Platform.OS === 'ios') {
      const langs: string[] =
        NativeModules.SettingsManager?.settings?.AppleLanguages ?? [];
      const locale: string =
        NativeModules.SettingsManager?.settings?.AppleLocale ?? '';
      if (__DEV__) {
        console.log('[i18n] AppleLanguages:', JSON.stringify(langs));
        console.log('[i18n] AppleLocale:', locale);
      }
      if (langs.length > 0) return resolveLang(langs[0]);
      if (locale) return resolveLang(locale);
    }
    if (Platform.OS === 'android') {
      // 複数のモジュール名を試みる（Expo / RN バージョン差異対応）
      const locale =
        (NativeModules.I18nManager?.localeIdentifier as string | undefined) ??
        (NativeModules.RNI18nManager?.localeIdentifier as string | undefined) ??
        (NativeModules.AndroidConstants?.Locale as string | undefined);
      if (__DEV__) console.log('[i18n] Android locale:', locale);
      if (locale) return resolveLang(locale);
    }
    // 最終フォールバック: Intl API（実機では正確にデバイス言語を返す）
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (__DEV__) console.log('[i18n] Intl locale:', locale);
    return resolveLang(locale);
  } catch {
    return 'ja';
  }
}

export const lang: SupportedLang = detectLang();

const LANG_MAP: Record<SupportedLang, LangStrings> = { ja, en, de, fr, es, it };

const strings: LangStrings = LANG_MAP[lang];

export function t(key: keyof LangStrings): string {
  const val = strings[key];
  return Array.isArray(val) ? String(val) : String(val ?? key);
}

export function tArr(key: keyof LangStrings): string[] {
  const val = strings[key];
  return Array.isArray(val) ? (val as string[]) : [];
}
