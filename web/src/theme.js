import { createTheme } from '@mui/material/styles';

// ---------------------------------------------------------------------------
// Morganti eSnag — identity redesign design tokens.
// The design system is built straight from the brand palette: one flat
// navigation, IBM Plex type, and a five-colour snag-lifecycle status scale
// reused by every pin, chip and column. These exports are the single source
// of truth for screens that need raw tokens (mono font, status colours).
// ---------------------------------------------------------------------------
export const FONT_SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace";

export const BRAND = {
  navy: '#24488F', // primary
  navyDark: '#1A3466',
  navyLight: '#4F6FB2',
  teal: '#2F8FBE', // accent
  tealDark: '#216A8E',
  tealLight: '#69AFD4',
  green: '#6E8C3A', // closed / success
  amber: '#C08A23', // review / warning
  red: '#B23B3B', // critical / error
  ink: '#142642', // primary text
  inkSoft: '#51627F', // secondary text
  muted: '#8A97AC', // mono labels / captions
  canvas: '#EBEEF4', // brand canvas (dot grid)
  screen: '#F4F6FA', // app content background
  panel: '#FFFFFF',
  border: 'rgba(20,38,66,0.09)',
  borderHair: 'rgba(20,38,66,0.07)',
  borderStrong: 'rgba(20,38,66,0.14)',
};

// Snag lifecycle → status colours. Each entry drives a pill/chip: `dot` is the
// leading indicator, `text` the label colour, `tint` the pill background.
// Reused across board columns, list rows, drawing pins and reports.
export const STATUS = {
  new: { label: 'New', dot: '#6B7A93', text: '#51627F', tint: '#F1F3F8' },
  assigned: { label: 'Assigned', dot: '#24488F', text: '#24488F', tint: 'rgba(36,72,143,0.10)' },
  in_progress: { label: 'In progress', dot: '#2F8FBE', text: '#2276A0', tint: 'rgba(47,143,190,0.12)' },
  review: { label: 'Review', dot: '#C08A23', text: '#9C6E14', tint: 'rgba(192,138,35,0.13)' },
  closed: { label: 'Closed', dot: '#6E8C3A', text: '#56702C', tint: 'rgba(110,140,58,0.15)' },
  rejected: { label: 'Rejected', dot: '#B23B3B', text: '#B23B3B', tint: 'rgba(178,59,59,0.10)' },
};

// Snag severity → colours (item 12, BR-FR-027). A distinct axis from the
// lifecycle STATUS scale above: drives the severity-coloured drawing pins and
// the D4 aggregated-overlay legend. Order is major → low (most to least severe).
export const SEVERITY = {
  major: { label: 'Major', dot: '#B23B3B', text: '#B23B3B', tint: 'rgba(178,59,59,0.12)' },
  high: { label: 'High', dot: '#C0561F', text: '#9C4315', tint: 'rgba(192,86,31,0.13)' },
  medium: { label: 'Medium', dot: '#C08A23', text: '#9C6E14', tint: 'rgba(192,138,35,0.13)' },
  low: { label: 'Low', dot: '#6E8C3A', text: '#56702C', tint: 'rgba(110,140,58,0.14)' },
};

export const severityStyle = (severity) => SEVERITY[severity] ?? { label: severity || 'Unspecified', dot: '#8A97AC', text: '#51627F', tint: '#F1F3F8' };

export const createAppTheme = (direction) =>
  createTheme({
    direction,
    palette: {
      mode: 'light',
      primary: { main: BRAND.navy, dark: BRAND.navyDark, light: BRAND.navyLight, contrastText: '#FFFFFF' },
      secondary: { main: BRAND.teal, dark: BRAND.tealDark, light: BRAND.tealLight, contrastText: '#FFFFFF' },
      success: { main: BRAND.green, contrastText: '#FFFFFF' },
      warning: { main: BRAND.amber, contrastText: '#FFFFFF' },
      error: { main: BRAND.red, contrastText: '#FFFFFF' },
      background: { default: BRAND.screen, paper: BRAND.panel },
      text: { primary: BRAND.ink, secondary: BRAND.inkSoft },
      divider: BRAND.border,
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: FONT_SANS,
      fontFamilyMono: FONT_MONO,
      h1: { fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: '-0.025em' },
      h2: { fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: '-0.02em' },
      h3: { fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: '-0.02em' },
      h4: { fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontFamily: FONT_SANS, fontWeight: 700, letterSpacing: '-0.01em' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: BRAND.screen },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${BRAND.border}`,
            boxShadow: '0 1px 2px rgba(20,38,66,0.04)',
          },
          elevation0: { boxShadow: 'none' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            border: `1px solid ${BRAND.border}`,
            boxShadow: '0 1px 2px rgba(20,38,66,0.04)',
            backgroundImage: 'none',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: BRAND.panel,
            color: BRAND.ink,
            backgroundImage: 'none',
            borderBottom: `1px solid ${BRAND.border}`,
            boxShadow: 'none',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 11, paddingInline: 15 },
          contained: {
            boxShadow: '0 8px 18px -8px rgba(36,72,143,0.6)',
            '&:hover': { boxShadow: '0 10px 22px -8px rgba(36,72,143,0.7)' },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 600 },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 11, backgroundColor: BRAND.panel },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 700, color: BRAND.navy, backgroundColor: '#F1F3F8' },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            backgroundColor: BRAND.panel,
            overflow: 'hidden',
          },
          columnHeaders: {
            borderBottom: `1px solid ${BRAND.border}`,
            backgroundColor: '#F1F3F8',
          },
          row: { '&:hover': { backgroundColor: 'rgba(36,72,143,0.05)' } },
          footerContainer: {
            borderTop: `1px solid ${BRAND.border}`,
            backgroundColor: BRAND.screen,
          },
        },
      },
    },
  });
