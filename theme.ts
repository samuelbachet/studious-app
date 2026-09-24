import type { ColorSchemeName } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

export function resolveEffectiveTheme(mode: ThemeMode, deviceScheme: ColorSchemeName): EffectiveTheme {
  return mode === 'system' ? (deviceScheme === 'dark' ? 'dark' : 'light') : mode;
}

export function parseThemeMode(value: string | null): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export const lightTheme = {
  background: '#F3EBDD',
  surface: '#F8F3EA',
  surfaceMuted: '#EEE5D9',
  inputBackground: '#EEE5D9',
  navigationBackground: '#F3EBDD',
  text: '#20201D',
  textMuted: '#81786E',
  muted: '#81786E',
  accent: '#B96845',
  actionAccent: '#AD6040',
  accentForeground: '#F8F3EA',
  actionOnAccent: '#FFFFFF',
  sage: '#7F8E68',
  sageForeground: '#F8F3EA',
  border: '#E6DCCD',
  line: '#E6DCCD',
  control: '#EEE5D9',
  inactive: '#817F7A',
  iconSurface: '#E5E6D7',
  iconBorder: '#D6D9C3',
  shadow: '#8B765D',
  backdrop: 'rgba(32,32,29,0.32)',
} as const;

export type ThemeColors = { [Key in keyof typeof lightTheme]: string };

export const darkTheme: ThemeColors = {
  background: '#1E1B18',
  surface: '#29241F',
  surfaceMuted: '#332C26',
  inputBackground: '#302923',
  navigationBackground: '#26211D',
  text: '#F1E8DC',
  textMuted: '#B6AA9C',
  muted: '#B6AA9C',
  accent: '#D78662',
  actionAccent: '#D78662',
  accentForeground: '#1E1B18',
  actionOnAccent: '#1E1B18',
  sage: '#9AA684',
  sageForeground: '#1E1B18',
  border: '#443B33',
  line: '#443B33',
  control: '#332C26',
  inactive: '#B6AA9C',
  iconSurface: '#332C26',
  iconBorder: '#443B33',
  shadow: '#171310',
  backdrop: 'rgba(20,16,13,0.68)',
};

export const themes: Record<EffectiveTheme, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
};
