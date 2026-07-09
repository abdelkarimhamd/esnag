export interface ThemeColors {
  background: string
  surface: string
  surfaceElevated: string
  text: string
  textMuted: string
  border: string
  divider: string
  primary: string
  primarySoft: string
  primaryContrast: string
  secondary: string
  secondarySoft: string
  success: string
  warning: string
  danger: string
  info: string
  badge: string
  overlay: string
  tabBar: string
}

export interface ThemeSpacing {
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

export interface ThemeRadius {
  sm: number
  md: number
  lg: number
  xl: number
  pill: number
}

export interface ThemeTypography {
  h1: number
  h2: number
  h3: number
  h4: number
  title: number
  body: number
  caption: number
  overline: number
}

export interface ThemeElevation {
  level0: number
  level1: number
  level2: number
}

export interface AppTheme {
  isDark: boolean
  reduceMotion: boolean
  colors: ThemeColors
  spacing: ThemeSpacing
  radius: ThemeRadius
  typography: ThemeTypography
  elevation: ThemeElevation
}

const spacing: ThemeSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
}

const radius: ThemeRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
}

const typography: ThemeTypography = {
  h1: 32,
  h2: 28,
  h3: 24,
  h4: 20,
  title: 18,
  body: 15,
  caption: 13,
  overline: 11,
}

const elevation: ThemeElevation = {
  level0: 0,
  level1: 2,
  level2: 6,
}

const lightColors: ThemeColors = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#F8FAFD',
  text: '#0B1A33',
  textMuted: '#5F6F86',
  border: '#D8E0EC',
  divider: '#E8EDF5',
  primary: '#1E3F88',
  primarySoft: '#E8EEFA',
  primaryContrast: '#FFFFFF',
  secondary: '#2487B8',
  secondarySoft: '#EAF6FC',
  success: '#178A5B',
  warning: '#A86A16',
  danger: '#C13C3C',
  info: '#3A77CC',
  badge: '#0E8AB6',
  overlay: 'rgba(8, 23, 52, 0.48)',
  tabBar: '#FFFFFF',
}

const darkColors: ThemeColors = {
  background: '#0A1324',
  surface: '#101D34',
  surfaceElevated: '#15243F',
  text: '#EEF4FF',
  textMuted: '#9FB0CC',
  border: '#213252',
  divider: '#1B2A47',
  primary: '#5D85D8',
  primarySoft: '#1A2C4E',
  primaryContrast: '#F7FAFF',
  secondary: '#50A6CE',
  secondarySoft: '#123249',
  success: '#33B57A',
  warning: '#D69B47',
  danger: '#E56969',
  info: '#7AAAF1',
  badge: '#57B7DF',
  overlay: 'rgba(4, 9, 18, 0.62)',
  tabBar: '#0F1B31',
}

export const buildTheme = (isDark: boolean, reduceMotion = false): AppTheme => ({
  isDark,
  reduceMotion,
  colors: isDark ? darkColors : lightColors,
  spacing,
  radius,
  typography,
  elevation,
})
