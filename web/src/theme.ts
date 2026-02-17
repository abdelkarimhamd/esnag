import { createTheme } from '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'

export const createAppTheme = (direction: 'ltr' | 'rtl') =>
  createTheme({
    direction,
    palette: {
      mode: 'light',
      primary: {
        main: '#24488F',
        dark: '#1A3466',
        light: '#4F6FB2',
      },
      secondary: {
        main: '#2F8FBE',
        dark: '#216A8E',
        light: '#69AFD4',
      },
      background: {
        default: '#F2F6FB',
        paper: '#FFFFFF',
      },
      text: {
        primary: '#142642',
        secondary: '#51627F',
      },
      success: {
        main: '#7A933D',
      },
      warning: {
        main: '#C08A23',
      },
      error: {
        main: '#B23B3B',
      },
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: '"Manrope", "Segoe UI", sans-serif',
      h1: {
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
      },
      h2: {
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
      },
      h3: {
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
      },
      h4: {
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.02em',
      },
      h5: {
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
        fontWeight: 700,
      },
      h6: {
        fontFamily: '"Space Grotesk", "Manrope", sans-serif',
        fontWeight: 700,
      },
      button: {
        textTransform: 'none',
        fontWeight: 700,
        letterSpacing: '0.01em',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background:
              'radial-gradient(circle at 8% -4%, rgba(36, 72, 143, 0.13) 0%, rgba(36, 72, 143, 0) 44%), radial-gradient(circle at 96% 0%, rgba(122, 147, 61, 0.12) 0%, rgba(122, 147, 61, 0) 40%), linear-gradient(180deg, #F7FAFF 0%, #EEF3FA 100%)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(23, 47, 92, 0.1)',
            boxShadow: '0 10px 28px rgba(23, 47, 92, 0.08)',
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,251,255,1) 100%)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backdropFilter: 'blur(12px)',
            backgroundColor: 'rgba(242, 246, 251, 0.88)',
            borderBottom: '1px solid rgba(23, 47, 92, 0.1)',
            color: '#142642',
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 18,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            paddingInline: 16,
          },
          contained: {
            boxShadow: '0 10px 18px rgba(36, 72, 143, 0.22)',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            fontWeight: 700,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: '#FFFFFF',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 700,
            color: '#1E3E73',
            backgroundColor: '#EEF3FB',
          },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(23, 47, 92, 0.12)',
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
          },
          columnHeaders: {
            borderBottom: '1px solid rgba(23, 47, 92, 0.12)',
            background: 'linear-gradient(180deg, #F6F9FF 0%, #EEF3FB 100%)',
          },
          row: {
            '&:hover': {
              backgroundColor: 'rgba(36, 72, 143, 0.05)',
            },
          },
          footerContainer: {
            borderTop: '1px solid rgba(23, 47, 92, 0.1)',
            backgroundColor: '#F8FAFF',
          },
        },
      },
    },
  })

