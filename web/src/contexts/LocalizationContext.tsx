import { createContext, useEffect, useMemo, useState } from 'react'
import { messages, type SupportedLocale } from '../i18n/messages'

const LOCALE_STORAGE_KEY = 'esnag.locale'

interface LocalizationContextValue {
  locale: SupportedLocale
  direction: 'ltr' | 'rtl'
  setLocale: (locale: SupportedLocale) => void
  toggleLocale: () => void
  t: (key: string, fallback?: string) => string
}

const resolveInitialLocale = (): SupportedLocale => {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored === 'ar' || stored === 'en') {
    return stored
  }

  return 'en'
}

export const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined)

export const LocalizationProvider = ({ children }: { children: React.ReactNode }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(resolveInitialLocale)

  const direction: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale)
    document.documentElement.setAttribute('dir', direction)
    document.body.setAttribute('dir', direction)
  }, [direction, locale])

  const value = useMemo<LocalizationContextValue>(() => {
    const dictionary = messages[locale]

    return {
      locale,
      direction,
      setLocale: (nextLocale) => setLocaleState(nextLocale),
      toggleLocale: () => setLocaleState((current) => (current === 'en' ? 'ar' : 'en')),
      t: (key, fallback) => dictionary[key] ?? fallback ?? key,
    }
  }, [direction, locale])

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>
}

