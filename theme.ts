import type { ColorSchemeName } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark' | 'glass';
export type EffectiveTheme = 'light' | 'dark';
export type ThemePalette = 'classic' | 'sage' | 'ocean' | 'plum'
  | 'classicPlus' | 'sagePlus' | 'oceanPlus' | 'plumPlus'
  | 'classicCool' | 'sageCool' | 'oceanCool' | 'plumCool'
  | 'equinox' | 'equinoxPlus' | 'equinoxCool'
  | 'monochrome' | 'monochromeWarm' | 'monochromeCool';
export type ThemeFamily = 'classic' | 'sage' | 'ocean' | 'plum' | 'equinox' | 'monochrome';
export type ThemeTemperature = 'standard' | 'warm' | 'cool';
export type GlassStyle = 'clear' | 'tint';

const paletteByFamily: Record<ThemeFamily, Record<ThemeTemperature, ThemePalette>> = {
  classic: { standard: 'classic', warm: 'classicPlus', cool: 'classicCool' },
  sage: { standard: 'sage', warm: 'sagePlus', cool: 'sageCool' },
  ocean: { standard: 'ocean', warm: 'oceanPlus', cool: 'oceanCool' },
  plum: { standard: 'plum', warm: 'plumPlus', cool: 'plumCool' },
  equinox: { standard: 'equinox', warm: 'equinoxPlus', cool: 'equinoxCool' },
  monochrome: { standard: 'monochrome', warm: 'monochromeWarm', cool: 'monochromeCool' },
};

export function paletteFor(family: ThemeFamily, temperature: ThemeTemperature): ThemePalette { return paletteByFamily[family][temperature]; }
export function familyFor(palette: ThemePalette): ThemeFamily {
  return (Object.keys(paletteByFamily) as ThemeFamily[]).find((family) => Object.values(paletteByFamily[family]).includes(palette)) ?? 'classic';
}
export function temperatureFor(palette: ThemePalette): ThemeTemperature {
  const family = familyFor(palette);
  return (Object.keys(paletteByFamily[family]) as ThemeTemperature[]).find((temperature) => paletteByFamily[family][temperature] === palette) ?? 'standard';
}
export function parseGlassStyle(value: string | null): GlassStyle { return value === 'clear' ? 'clear' : 'tint'; }
export function usesNativeGlass(mode: ThemeMode, glassAvailable: boolean): boolean { return glassAvailable && (mode === 'system' || mode === 'glass'); }

export function resolveEffectiveTheme(mode: ThemeMode, deviceScheme: ColorSchemeName, glassScheme?: EffectiveTheme): EffectiveTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  if (mode === 'glass' && glassScheme) return glassScheme;
  return deviceScheme === 'dark' ? 'dark' : 'light';
}

export function parseThemeMode(value: string | null, glassAvailable: boolean): ThemeMode {
  if (value === 'glass') return glassAvailable ? 'glass' : 'system';
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function nextThemeMode(mode: ThemeMode, glassAvailable: boolean): ThemeMode {
  const modes: ThemeMode[] = glassAvailable ? ['system', 'light', 'dark', 'glass'] : ['system', 'light', 'dark'];
  return modes[(modes.indexOf(mode) + 1) % modes.length];
}

export function parseThemePalette(value: string | null): ThemePalette {
  return value === 'sage' || value === 'ocean' || value === 'plum'
    || value === 'classicPlus' || value === 'sagePlus' || value === 'oceanPlus' || value === 'plumPlus'
    || value === 'classicCool' || value === 'sageCool' || value === 'oceanCool' || value === 'plumCool'
    || value === 'equinox' || value === 'equinoxPlus' || value === 'equinoxCool'
    || value === 'monochrome' || value === 'monochromeWarm' || value === 'monochromeCool'
    ? value : 'classic';
}

export const lightTheme = {
  background: '#F3EBDD',
  surface: '#F8F3EA',
  surfaceMuted: '#EEE5D9',
  selectionSurface: '#E4E0DA',
  completedSurface: '#EEDCCF',
  inputBackground: '#EEE5D9',
  navigationBackground: '#F3EBDD',
  navigationSelectedBackground: '#E6D8C7',
  text: '#20201D',
  textMuted: '#6E675F',
  muted: '#6E675F',
  accent: '#A65335',
  actionAccent: '#AD6040',
  accentForeground: '#F8F3EA',
  actionOnAccent: '#FFFFFF',
  sage: '#9C4E34',
  sageText: '#87432D',
  sageForeground: '#FFFFFF',
  danger: '#AE4541',
  dangerForeground: '#FFFFFF',
  archiveAccent: '#866423',
  archiveAccentForeground: '#FFFFFF',
  border: '#E6DCCD',
  line: '#E6DCCD',
  control: '#EEE5D9',
  inactive: '#817F7A',
  iconSurface: '#EFE0D4',
  iconBorder: '#DFC9B9',
  shadow: '#8B765D',
  backdrop: 'rgba(32,32,29,0.32)',
} as const;

export type ThemeColors = { [Key in keyof typeof lightTheme]: string };

export const darkTheme: ThemeColors = {
  background: '#1E1B18',
  surface: '#29241F',
  surfaceMuted: '#332C26',
  selectionSurface: '#342F2A',
  completedSurface: '#493328',
  inputBackground: '#302923',
  navigationBackground: '#26211D',
  navigationSelectedBackground: '#1A1714',
  text: '#F1E8DC',
  textMuted: '#B6AA9C',
  muted: '#B6AA9C',
  accent: '#D78662',
  actionAccent: '#D78662',
  accentForeground: '#1E1B18',
  actionOnAccent: '#1E1B18',
  sage: '#DEA383',
  sageText: '#E4AD8F',
  sageForeground: '#1E1B18',
  danger: '#E38F87',
  dangerForeground: '#281714',
  archiveAccent: '#B89A5A',
  archiveAccentForeground: '#1E1B18',
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

const sageLightTheme: ThemeColors = {
  ...lightTheme,
  background: '#DCEADB',
  surface: '#F2F9EF',
  surfaceMuted: '#D9E6D5',
  selectionSurface: '#D0DFC9',
  completedSurface: '#D0E2C9',
  inputBackground: '#E0EBDB',
  navigationBackground: '#D7E7D4',
  navigationSelectedBackground: '#C7DABF',
  text: '#1F3022',
  textMuted: '#566B59',
  muted: '#566B59',
  accent: '#486B43',
  actionAccent: '#486B43',
  accentForeground: '#FFFFFF',
  actionOnAccent: '#FFFFFF',
  sage: '#466B46',
  sageText: '#3E603F',
  sageForeground: '#FFFFFF',
  border: '#C3D5BF',
  line: '#C3D5BF',
  control: '#DBE8D7',
  inactive: '#4D6652',
  iconSurface: '#D3E5CF',
  iconBorder: '#B8D2B3',
  shadow: '#537052',
  backdrop: 'rgba(19,42,29,0.34)',
};

const sageDarkTheme: ThemeColors = {
  ...darkTheme,
  background: '#10291C',
  surface: '#1A3626',
  surfaceMuted: '#294133',
  selectionSurface: '#314B3A',
  completedSurface: '#31543B',
  inputBackground: '#294133',
  navigationBackground: '#142D1F',
  navigationSelectedBackground: '#0B1E13',
  text: '#E9F4E8',
  textMuted: '#AFC9B4',
  muted: '#AFC9B4',
  accent: '#B4D6A8',
  actionAccent: '#B4D6A8',
  accentForeground: '#14231B',
  actionOnAccent: '#14231B',
  sage: '#B9DDB0',
  sageText: '#C4E5BA',
  sageForeground: '#241912',
  border: '#3B5744',
  line: '#3B5744',
  control: '#294133',
  inactive: '#A7BFA9',
  iconSurface: '#31543B',
  iconBorder: '#456E50',
  shadow: '#08140C',
  backdrop: 'rgba(6,15,9,0.70)',
};

const oceanLightTheme: ThemeColors = {
  ...lightTheme,
  background: '#F0F5F5',
  surface: '#FAFDFC',
  surfaceMuted: '#E6EFF0',
  selectionSurface: '#DCE8EC',
  completedSurface: '#D6EAF3',
  inputBackground: '#E6EFF0',
  navigationBackground: '#F0F5F5',
  navigationSelectedBackground: '#DCEAF0',
  text: '#1D2D33',
  textMuted: '#5D7179',
  muted: '#5D7179',
  accent: '#315F77',
  actionAccent: '#315F77',
  accentForeground: '#FAFDFC',
  actionOnAccent: '#FFFFFF',
  sage: '#366A84',
  sageText: '#315F77',
  sageForeground: '#FFFFFF',
  border: '#D4E0E2',
  line: '#D4E0E2',
  control: '#E6EFF0',
  inactive: '#667B82',
  iconSurface: '#DCEAEF',
  iconBorder: '#C4D9DF',
};

const oceanDarkTheme: ThemeColors = {
  ...darkTheme,
  background: '#151F25',
  surface: '#202D34',
  surfaceMuted: '#283840',
  selectionSurface: '#2B3C44',
  completedSurface: '#294656',
  inputBackground: '#283840',
  navigationBackground: '#1B282F',
  navigationSelectedBackground: '#101B21',
  text: '#E9F3F4',
  textMuted: '#A8C0C7',
  muted: '#A8C0C7',
  accent: '#8EC7E0',
  actionAccent: '#8EC7E0',
  accentForeground: '#152027',
  actionOnAccent: '#152027',
  sage: '#9CD5EA',
  sageText: '#A9DDEF',
  sageForeground: '#152027',
  border: '#3D515B',
  line: '#3D515B',
  control: '#283840',
  inactive: '#A8C0C7',
  iconSurface: '#2A3E46',
  iconBorder: '#405762',
};

const plumLightTheme: ThemeColors = {
  ...lightTheme,
  background: '#F6F1F6',
  surface: '#FFFAFE',
  surfaceMuted: '#EEE4EF',
  selectionSurface: '#EADFEA',
  completedSurface: '#EEE0F0',
  inputBackground: '#EEE4EF',
  navigationBackground: '#F6F1F6',
  navigationSelectedBackground: '#EBDDEC',
  text: '#302433',
  textMuted: '#766A79',
  muted: '#766A79',
  accent: '#704C75',
  actionAccent: '#704C75',
  accentForeground: '#FFFAFE',
  actionOnAccent: '#FFFFFF',
  sage: '#704C75',
  sageText: '#68446D',
  sageForeground: '#FFFFFF',
  border: '#E3D7E4',
  line: '#E3D7E4',
  control: '#EEE4EF',
  inactive: '#79707B',
  iconSurface: '#E7DDE9',
  iconBorder: '#D9C7DC',
};

const plumDarkTheme: ThemeColors = {
  ...darkTheme,
  background: '#211B24',
  surface: '#2E2632',
  surfaceMuted: '#382D3C',
  selectionSurface: '#3E3142',
  completedSurface: '#493750',
  inputBackground: '#382D3C',
  navigationBackground: '#28202C',
  navigationSelectedBackground: '#1C1720',
  text: '#F2EAF3',
  textMuted: '#C1B1C3',
  muted: '#C1B1C3',
  accent: '#CBA1D2',
  actionAccent: '#CBA1D2',
  accentForeground: '#211B24',
  actionOnAccent: '#211B24',
  sage: '#D7B1DD',
  sageText: '#E0BCE5',
  sageForeground: '#211B24',
  border: '#4C3D50',
  line: '#4C3D50',
  control: '#382D3C',
  inactive: '#C1B1C3',
  iconSurface: '#3C3040',
  iconBorder: '#58465D',
};

// The + variants keep each palette's action colors but move the surrounding UI
// to the same warm ivory or near-black canvas.
const warmLightCanvas = {
  background: '#FFFAE9',
  surface: '#FFFEF9',
  surfaceMuted: '#F4F0E5',
  selectionSurface: '#EDE7D9',
  inputBackground: '#F5F0E5',
  navigationBackground: '#FFFAE9',
  navigationSelectedBackground: '#EFE8D8',
  text: '#25211C',
  textMuted: '#6B6258',
  muted: '#6B6258',
  border: '#E4DDCE',
  line: '#E4DDCE',
  control: '#F3EEE2',
  inactive: '#70675E',
  iconSurface: '#F0E9D9',
  iconBorder: '#E1D6C3',
  shadow: '#766958',
  backdrop: 'rgba(37,33,28,0.35)',
} satisfies Partial<ThemeColors>;

const warmDarkCanvas = {
  background: '#100E0C',
  surface: '#201C19',
  surfaceMuted: '#29241F',
  selectionSurface: '#302A24',
  inputBackground: '#29241F',
  navigationBackground: '#171411',
  navigationSelectedBackground: '#080706',
  text: '#F6F0E7',
  textMuted: '#BDB1A3',
  muted: '#BDB1A3',
  border: '#40372F',
  line: '#40372F',
  control: '#29241F',
  inactive: '#BDB1A3',
  iconSurface: '#302A24',
  iconBorder: '#4D4238',
  shadow: '#050403',
  backdrop: 'rgba(5,4,3,0.75)',
} satisfies Partial<ThemeColors>;

function warmPlusPalette(light: ThemeColors, dark: ThemeColors): Record<EffectiveTheme, ThemeColors> {
  return {
    light: { ...light, ...warmLightCanvas },
    dark: { ...dark, ...warmDarkCanvas },
  };
}

const coolLightCanvas = {
  background: '#E0F0FF', surface: '#F8FCFF', surfaceMuted: '#E2EFFB', selectionSurface: '#D6E7F5',
  inputBackground: '#E4F0FB', navigationBackground: '#E0F0FF', navigationSelectedBackground: '#D4E6F5',
  text: '#1B2834', textMuted: '#536575', muted: '#536575', border: '#D3DFE9', line: '#D3DFE9',
  control: '#E5EEF6', inactive: '#586B7A', iconSurface: '#DFEAF3', iconBorder: '#CADAE6',
  shadow: '#536879', backdrop: 'rgba(15,31,45,0.36)',
} satisfies Partial<ThemeColors>;

const coolDarkCanvas = {
  background: '#05152E', surface: '#14283D', surfaceMuted: '#20354B', selectionSurface: '#283E53',
  inputBackground: '#20354B', navigationBackground: '#0B1E35', navigationSelectedBackground: '#030C18',
  text: '#F0F5FA', textMuted: '#B4C4D2', muted: '#B4C4D2', border: '#394B5C', line: '#394B5C',
  control: '#263442', inactive: '#B4C4D2', iconSurface: '#2A3948', iconBorder: '#425568',
  shadow: '#060B11', backdrop: 'rgba(4,9,15,0.74)',
} satisfies Partial<ThemeColors>;

function coolPalette(light: ThemeColors, dark: ThemeColors): Record<EffectiveTheme, ThemeColors> {
  return { light: { ...light, ...coolLightCanvas }, dark: { ...dark, ...coolDarkCanvas } };
}

// Equinox is inspired by the balanced teal/ivory relationship of Solarized,
// but uses its own UI colors and contrast-tuned action states.
const equinoxLight: ThemeColors = {
  ...lightTheme,
  background: '#F9F3E2', surface: '#FFFBEF', surfaceMuted: '#EEE8D7', selectionSurface: '#E5DFCC',
  completedSurface: '#F0DDC7', inputBackground: '#EEE8D7', navigationBackground: '#F9F3E2',
  navigationSelectedBackground: '#E8E1CC', text: '#193642', textMuted: '#536C72', muted: '#536C72',
  accent: '#9D451C', actionAccent: '#9D451C', accentForeground: '#FFFFFF', actionOnAccent: '#FFFFFF',
  sage: '#955127', sageText: '#85451F', sageForeground: '#FFFFFF', danger: '#AA3836',
  archiveAccent: '#805C18', border: '#DCD7C5', line: '#DCD7C5', control: '#EEE8D7',
  inactive: '#566B70', iconSurface: '#F0E0C8', iconBorder: '#DECBAE', shadow: '#6D756A',
};

const equinoxDark: ThemeColors = {
  ...darkTheme,
  background: '#092C36', surface: '#123945', surfaceMuted: '#1C4550', selectionSurface: '#234D57',
  completedSurface: '#584735', inputBackground: '#1C4550', navigationBackground: '#0D323D',
  navigationSelectedBackground: '#05202A', text: '#F3EFDE', textMuted: '#B4C8C4', muted: '#B4C8C4',
  accent: '#F0B17A', actionAccent: '#F0B17A', accentForeground: '#183039', actionOnAccent: '#183039',
  sage: '#F3C79A', sageText: '#F3C79A', sageForeground: '#173037', danger: '#F1A09A',
  archiveAccent: '#E2CA8A', archiveAccentForeground: '#183039', border: '#365762', line: '#365762',
  control: '#1C4550', inactive: '#B4C8C4', iconSurface: '#244B55', iconBorder: '#3E6470', shadow: '#061C23',
};

const daylight: ThemeColors = {
  ...lightTheme,
  background: '#EFF2F5', surface: '#FFFFFF', surfaceMuted: '#E5E9ED', selectionSurface: '#DCE2E7',
  completedSurface: '#DDE3E8', inputBackground: '#E5E9ED', navigationBackground: '#EFF2F5',
  navigationSelectedBackground: '#DCE2E7', text: '#181C20', textMuted: '#525B64', muted: '#525B64',
  accent: '#343C44', actionAccent: '#343C44', accentForeground: '#FFFFFF', actionOnAccent: '#FFFFFF',
  sage: '#45515B', sageText: '#39444E', sageForeground: '#FFFFFF', danger: '#424B54',
  archiveAccent: '#48525C', border: '#D3DAE0', line: '#D3DAE0', control: '#E5E9ED',
  inactive: '#58616A', iconSurface: '#E1E6EA', iconBorder: '#CFD6DC', shadow: '#717980',
};

const midnight: ThemeColors = {
  ...darkTheme,
  background: '#101317', surface: '#20252A', surfaceMuted: '#2A3036', selectionSurface: '#31383F',
  completedSurface: '#343B41', inputBackground: '#2A3036', navigationBackground: '#171C21',
  navigationSelectedBackground: '#090C0F', text: '#F3F5F6', textMuted: '#B5BDC4', muted: '#B5BDC4',
  accent: '#E1E5E8', actionAccent: '#E1E5E8', accentForeground: '#20252A', actionOnAccent: '#20252A',
  sage: '#C5CDD3', sageText: '#D8DFE4', sageForeground: '#20252A', danger: '#E6EAED',
  dangerForeground: '#20252A', archiveAccent: '#CCD4D9', archiveAccentForeground: '#20252A',
  border: '#414950', line: '#414950', control: '#2A3036', inactive: '#B5BDC4',
  iconSurface: '#30373E', iconBorder: '#4B545D', shadow: '#080A0C',
};

const daylightWarm: ThemeColors = {
  ...daylight, ...warmLightCanvas,
  completedSurface: '#E8E1D5', sage: '#514B44', sageText: '#423D36',
  accent: '#3D3832', actionAccent: '#3D3832', danger: '#49413A', archiveAccent: '#51483F',
};

const midnightWarm: ThemeColors = {
  ...midnight, ...warmDarkCanvas,
  completedSurface: '#3D3730', sage: '#D3C7B8', sageText: '#DED3C5',
  accent: '#E8DED0', actionAccent: '#E8DED0', danger: '#EBDED0', archiveAccent: '#D5C7B5',
};

export function glassTheme(colors: ThemeColors): ThemeColors {
  return {
    ...colors,
    surface: `${colors.surface}C8`, surfaceMuted: `${colors.surfaceMuted}C0`,
    selectionSurface: `${colors.selectionSurface}C8`, inputBackground: `${colors.inputBackground}CE`,
    navigationBackground: `${colors.navigationBackground}B8`,
    control: `${colors.control}C8`, iconSurface: `${colors.iconSurface}C8`,
  };
}

export const themePalettes: Record<ThemePalette, Record<EffectiveTheme, ThemeColors>> = {
  classic: themes,
  sage: { light: sageLightTheme, dark: sageDarkTheme },
  ocean: { light: oceanLightTheme, dark: oceanDarkTheme },
  plum: { light: plumLightTheme, dark: plumDarkTheme },
  classicPlus: warmPlusPalette(lightTheme, darkTheme),
  sagePlus: warmPlusPalette(sageLightTheme, sageDarkTheme),
  oceanPlus: warmPlusPalette(oceanLightTheme, oceanDarkTheme),
  plumPlus: warmPlusPalette(plumLightTheme, plumDarkTheme),
  classicCool: coolPalette(lightTheme, darkTheme),
  sageCool: coolPalette(sageLightTheme, sageDarkTheme),
  oceanCool: coolPalette(oceanLightTheme, oceanDarkTheme),
  plumCool: coolPalette(plumLightTheme, plumDarkTheme),
  equinox: { light: equinoxLight, dark: equinoxDark },
  monochrome: { light: daylight, dark: midnight },
  monochromeWarm: { light: daylightWarm, dark: midnightWarm },
  equinoxPlus: warmPlusPalette(equinoxLight, equinoxDark),
  equinoxCool: coolPalette(equinoxLight, equinoxDark),
  monochromeCool: coolPalette(daylight, midnight),
};
