import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { darkColors, lightColors, type ThemeColors } from './colors';

export function useTheme(): ThemeColors {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore(s => s.settings.themeMode);

  if (themeMode === 'light') return lightColors;
  if (themeMode === 'dark') return darkColors;
  return systemScheme === 'light' ? lightColors : darkColors;
}

export function useIsDark(): boolean {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore(s => s.settings.themeMode);

  if (themeMode === 'light') return false;
  if (themeMode === 'dark') return true;
  return systemScheme !== 'light';
}
