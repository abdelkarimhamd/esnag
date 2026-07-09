import 'react-native-gesture-handler'
import 'react-native-reanimated'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { initializeDatabase } from './src/db/database'
import { AuthProvider, useAuth } from './src/providers/AuthProvider'
import { AppNavigator } from './src/navigation/AppNavigator'
import { AppThemeProvider, useAppTheme } from './src/theme/ThemeProvider'

const AppShell = () => {
  const theme = useAppTheme()
  const { token } = useAuth()

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <AppNavigator key={token ? 'authed' : 'guest'} />
    </>
  )
}

export default function App() {
  useEffect(() => {
    initializeDatabase()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppThemeProvider>
          <AppShell />
        </AppThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  )
}
