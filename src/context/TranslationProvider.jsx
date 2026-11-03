import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTranslations } from '../lib/api'
import { LANGUAGES, TranslationContext } from './translation-context'

const LANGUAGE_KEY = 'pollpal-language'
const CACHE_KEY = 'pollpal-translation-cache-v1'

function initialLanguage() {
  const saved = window.localStorage.getItem(LANGUAGE_KEY)
  return LANGUAGES.some(({ code }) => code === saved) ? saved : 'en'
}

function initialCache() {
  try {
    return JSON.parse(window.sessionStorage.getItem(CACHE_KEY)) ?? {}
  } catch {
    return {}
  }
}

export default function TranslationProvider({ children }) {
  const [language, setLanguageState] = useState(initialLanguage)
  const [showOriginal, setShowOriginal] = useState(false)
  const [translations, setTranslations] = useState(initialCache)
  const [activeRequests, setActiveRequests] = useState(0)
  const [error, setError] = useState(null)
  const languageRef = useRef(language)
  const translationsRef = useRef(translations)
  const queueRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const timerRef = useRef(null)
  const flushRef = useRef(null)

  useEffect(() => {
    languageRef.current = language
    queueRef.current.clear()
    inFlightRef.current.clear()
    window.localStorage.setItem(LANGUAGE_KEY, language)
    const selected = LANGUAGES.find(({ code }) => code === language)
    document.documentElement.lang = language
    document.documentElement.dir = selected?.direction ?? 'ltr'
  }, [language])

  useEffect(() => {
    translationsRef.current = translations
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(translations))
    } catch {
      // A full or disabled session store should never prevent translation.
    }
  }, [translations])

  useEffect(() => {
    flushRef.current = async () => {
      timerRef.current = null
      const requestLanguage = languageRef.current
      if (requestLanguage === 'en') return

      const cached = translationsRef.current[requestLanguage] ?? {}
      const texts = [...queueRef.current]
        .filter((text) => !cached[text] && !inFlightRef.current.has(`${requestLanguage}\u0000${text}`))
        .slice(0, 40)
      texts.forEach((text) => queueRef.current.delete(text))
      if (texts.length === 0) return

      texts.forEach((text) => inFlightRef.current.add(`${requestLanguage}\u0000${text}`))
      setActiveRequests((count) => count + 1)
      try {
        const results = await fetchTranslations(texts, requestLanguage)
        if (results.length !== texts.length) throw new Error('The translation response was incomplete.')
        setTranslations((previous) => {
          const nextLanguage = { ...(previous[requestLanguage] ?? {}) }
          texts.forEach((text, index) => {
            nextLanguage[text] = results[index]
          })
          return { ...previous, [requestLanguage]: nextLanguage }
        })
        setError(null)
      } catch (requestError) {
        setError(requestError)
      } finally {
        texts.forEach((text) => inFlightRef.current.delete(`${requestLanguage}\u0000${text}`))
        setActiveRequests((count) => Math.max(0, count - 1))
        if (queueRef.current.size > 0 && !timerRef.current) {
          timerRef.current = window.setTimeout(() => flushRef.current(), 30)
        }
      }
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      flushRef.current = null
    }
  }, [])

  const requestTranslations = useCallback((values) => {
    const currentLanguage = languageRef.current
    if (currentLanguage === 'en') return
    const cached = translationsRef.current[currentLanguage] ?? {}
    for (const value of values) {
      const text = typeof value === 'string' ? value.trim() : ''
      if (text && text.length <= 1500 && !cached[text]) queueRef.current.add(text)
    }
    if (queueRef.current.size > 0 && !timerRef.current) {
      timerRef.current = window.setTimeout(() => flushRef.current(), 30)
    }
  }, [])

  const translate = (value) => {
    if (typeof value !== 'string' || languageRef.current === 'en' || showOriginal) return value
    return translationsRef.current[languageRef.current]?.[value] ?? value
  }

  const setLanguage = useCallback((nextLanguage) => {
    if (!LANGUAGES.some(({ code }) => code === nextLanguage)) return
    queueRef.current.clear()
    inFlightRef.current.clear()
    setShowOriginal(false)
    setError(null)
    setLanguageState(nextLanguage)
  }, [])

  const context = {
    language,
    setLanguage,
    showOriginal,
    setShowOriginal,
    translate,
    requestTranslations,
    translating: activeRequests > 0,
    error,
  }

  return <TranslationContext.Provider value={context}>{children}</TranslationContext.Provider>
}
