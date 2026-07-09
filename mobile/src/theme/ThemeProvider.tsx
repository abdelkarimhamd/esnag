import { Appearance, AccessibilityInfo } from 'react-native'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { buildTheme, type AppTheme } from './tokens'

interface ThemeContextValue {
  theme: AppTheme
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const useReducedMotion = (): boolean => {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        setReduceMotion(value)
      }
    })

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduceMotion(value)
    })

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduceMotion
}

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [scheme, setScheme] = useState<'light' | 'dark'>(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light')
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme === 'dark' ? 'dark' : 'light')
    })

    return () => {
      subscription.remove()
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: buildTheme(scheme === 'dark', reduceMotion),
    }),
    [scheme, reduceMotion],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useAppTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider')
  }
  return context.theme
}
