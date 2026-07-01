import { NativeModules, Platform } from 'react-native';
import { ja, type LangStrings } from './ja';
import { en } from './en';

function detectLang(): 'ja' | 'en' {
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
      if (langs.length > 0) {
        return langs[0].startsWith('ja') ? 'ja' : 'en';
      }
      if (locale) return locale.startsWith('ja') ? 'ja' : 'en';
    }
    if (Platform.OS === 'android') {
      // 複数のモジュール名を試みる（Expo / RN バージョン差異対応）
      const locale =
        (NativeModules.I18nManager?.localeIdentifier as string | undefined) ??
        (NativeModules.RNI18nManager?.localeIdentifier as string | undefined) ??
        (NativeModules.AndroidConstants?.Locale as string | undefined);
      if (__DEV__) console.log('[i18n] Android locale:', locale);
      if (locale) return locale.startsWith('ja') ? 'ja' : 'en';
    }
    // 最終フォールバック: Intl API（実機では正確にデバイス言語を返す）
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (__DEV__) console.log('[i18n] Intl locale:', locale);
    return locale.startsWith('ja') ? 'ja' : 'en';
  } catch {
    return 'ja';
  }
}

export const lang: 'ja' | 'en' = detectLang();

const strings: LangStrings = lang === 'ja' ? ja : en;

export function t(key: keyof LangStrings): string {
  const val = strings[key];
  return Array.isArray(val) ? String(val) : String(val ?? key);
}

export function tArr(key: keyof LangStrings): string[] {
  const val = strings[key];
  return Array.isArray(val) ? (val as string[]) : [];
}
