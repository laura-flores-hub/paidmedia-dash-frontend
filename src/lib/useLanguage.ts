'use client'

import { useCallback, useEffect, useState } from 'react'
import { LANGUAGES, translate, type Language, type TranslationKey } from '@/lib/i18n'

const STORAGE_KEY = 'paidmedia-dash-language'

export function useLanguage() {
  const [language, setLanguage] = useState<Language>('pt')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && LANGUAGES.includes(stored as Language)) {
      setLanguage(stored as Language)
    }
  }, [])

  const cycleLanguage = useCallback(() => {
    setLanguage((current) => {
      const next = LANGUAGES[(LANGUAGES.indexOf(current) + 1) % LANGUAGES.length]
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  const t = useCallback((key: TranslationKey) => translate(language, key), [language])

  return { language, cycleLanguage, t }
}
