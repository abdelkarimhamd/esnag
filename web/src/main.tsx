import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App'
import { createAppTheme } from './theme'
import { AuthProvider } from './contexts/AuthContext'
import { LocalizationProvider } from './contexts/LocalizationContext'
import { useLocalization } from './hooks/useLocalization'
import rtlPlugin from 'stylis-plugin-rtl'
import './index.css'

const ThemedApp = () => {
  const { direction } = useLocalization()

  const cache = useMemo(
    () =>
      createCache({
        key: direction === 'rtl' ? 'mui-rtl' : 'mui',
        stylisPlugins: direction === 'rtl' ? [rtlPlugin] : [],
      }),
    [direction],
  )

  const theme = useMemo(() => createAppTheme(direction), [direction])

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </CacheProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalizationProvider>
      <ThemedApp />
    </LocalizationProvider>
  </StrictMode>,
)

