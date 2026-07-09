import { createContext, useEffect, useMemo, useState } from 'react';
import { messages } from '../i18n/messages';
const LOCALE_STORAGE_KEY = 'esnag.locale';
const resolveInitialLocale = () => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') {
        return stored;
    }
    return 'en';
};
export const LocalizationContext = createContext(undefined);
export const LocalizationProvider = ({ children }) => {
    const [locale, setLocaleState] = useState(resolveInitialLocale);
    const direction = locale === 'ar' ? 'rtl' : 'ltr';
    useEffect(() => {
        localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }, [locale]);
    useEffect(() => {
        document.documentElement.setAttribute('lang', locale);
        document.documentElement.setAttribute('dir', direction);
        document.body.setAttribute('dir', direction);
    }, [direction, locale]);
    const value = useMemo(() => {
        const dictionary = messages[locale];
        return {
            locale,
            direction,
            setLocale: (nextLocale) => setLocaleState(nextLocale),
            toggleLocale: () => setLocaleState((current) => (current === 'en' ? 'ar' : 'en')),
            t: (key, fallback) => dictionary[key] ?? fallback ?? key,
        };
    }, [direction, locale]);
    return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
};
