import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTranslations } from '../lib/api'
import { LANGUAGES, TranslationContext } from './translation-context'

const LANGUAGE_KEY = 'pollpal-language'
const CACHE_KEY = 'pollpal-translation-cache-v2'
// Wait briefly so every component on a newly opened page adds its text to the same batch.
const GATHER_MS = 40
// The backend accepts up to 40 strings per request and splits them into parallel model calls.
const REQUEST_SIZE = 40
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2500
// Keep the saved cache comfortably inside browser storage limits.
const MAX_CACHED_PER_LANGUAGE = 3000

function readStorage(storage, key) {
  try {
    return window[storage].getItem(key)
  } catch {
    return null
  }
}

function writeStorage(storage, key, value) {
  try {
    window[storage].setItem(key, value)
  } catch {
    // Full, private or disabled storage should never prevent translation.
  }
}

function initialLanguage() {
  const saved = readStorage('localStorage', LANGUAGE_KEY)
  return LANGUAGES.some(({ code }) => code === saved) ? saved : 'en'
}

function initialCache() {
  try {
    return JSON.parse(readStorage('localStorage', CACHE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function trimmed(translations) {
  return Object.fromEntries(
    Object.entries(translations).map(([language, entries]) => {
      const keys = Object.keys(entries)
      return [language, keys.length <= MAX_CACHED_PER_LANGUAGE ? entries : Object.fromEntries(keys.slice(-MAX_CACHED_PER_LANGUAGE).map((key) => [key, entries[key]]))]
    }),
  )
}

export default function TranslationProvider({ children }) {
  const [language, setLanguageState] = useState(initialLanguage)
  const [showOriginal, setShowOriginal] = useState(false)
  const [translations, setTranslations] = useState(initialCache)
  const [activeRequests, setActiveRequests] = useState(0)
  const [error, setError] = useState(null)
  // Refs mirror state for the request queue, which runs outside React renders.
  const languageRef = useRef(language)
  const translationsRef = useRef(translations)
  const queueRef = useRef(new Set())
  const inFlightRef = useRef(new Set())
  const attemptsRef = useRef(new Map())
  const timerRef = useRef(null)
  const flushRef = useRef(null)

  useEffect(() => {
    writeStorage('localStorage', LANGUAGE_KEY, language)
    const selected = LANGUAGES.find(({ code }) => code === language)
    document.documentElement.lang = language
    document.documentElement.dir = selected?.direction ?? 'ltr'
  }, [language])

  // Saved in localStorage so translations are instant on the next visit, not only this tab.
  useEffect(() => {
    const timer = window.setTimeout(() => writeStorage('localStorage', CACHE_KEY, JSON.stringify(trimmed(translations))), 500)
    return () => window.clearTimeout(timer)
  }, [translations])

  const schedule = useCallback((delay = GATHER_MS) => {
    if (timerRef.current || queueRef.current.size === 0) return
    timerRef.current = window.setTimeout(() => flushRef.current?.(), delay)
  }, [])

  useEffect(() => {
    async function send(requestLanguage, texts) {
      texts.forEach((text) => inFlightRef.current.add(`${requestLanguage}\u0000${text}`))
      setActiveRequests((count) => count + 1)
      let failed = texts
      try {
        const results = await fetchTranslations(texts, requestLanguage)
        if (!Array.isArray(results) || results.length !== texts.length) throw new Error('The translation response was incomplete.')
        const received = {}
        failed = []
        texts.forEach((text, index) => {
          if (typeof results[index] === 'string' && results[index]) received[text] = results[index]
          else failed.push(text)
        })
        translationsRef.current = {
          ...translationsRef.current,
          [requestLanguage]: { ...(translationsRef.current[requestLanguage] ?? {}), ...received },
        }
        setTranslations(translationsRef.current)
        if (failed.length === 0) setError(null)
      } catch (requestError) {
        setError(requestError)
      } finally {
        texts.forEach((text) => inFlightRef.current.delete(`${requestLanguage}\u0000${text}`))
        setActiveRequests((count) => Math.max(0, count - 1))
      }

      // Try strings that failed again a couple of times before giving up on them.
      if (failed.length > 0 && languageRef.current === requestLanguage) {
        const retry = failed.filter((text) => {
          const key = `${requestLanguage}\u0000${text}`
          const attempts = (attemptsRef.current.get(key) ?? 1) + 1
          attemptsRef.current.set(key, attempts)
          return attempts <= MAX_ATTEMPTS
        })
        if (retry.length > 0) {
          window.setTimeout(() => {
            if (languageRef.current !== requestLanguage) return
            retry.forEach((text) => queueRef.current.add(text))
            schedule(0)
          }, RETRY_DELAY_MS)
        } else {
          setError(new Error('Some text could not be translated.'))
        }
      }
    }

    // Sends everything waiting at once, in parallel requests, instead of one batch at a time.
    flushRef.current = () => {
      timerRef.current = null
      const requestLanguage = languageRef.current
      if (requestLanguage === 'en') {
        queueRef.current.clear()
        return
      }
      const cached = translationsRef.current[requestLanguage] ?? {}
      const texts = [...queueRef.current].filter(
        (text) => !cached[text] && !inFlightRef.current.has(`${requestLanguage}\u0000${text}`),
      )
      queueRef.current.clear()
      for (let index = 0; index < texts.length; index += REQUEST_SIZE) {
        send(requestLanguage, texts.slice(index, index + REQUEST_SIZE))
      }
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null
      flushRef.current = null
    }
  }, [schedule])

  const requestTranslations = useCallback((values) => {
    const currentLanguage = languageRef.current
    if (currentLanguage === 'en') return
    const cached = translationsRef.current[currentLanguage] ?? {}
    for (const value of values) {
      const text = typeof value === 'string' ? value.trim() : ''
      if (text && text.length <= 1500 && !cached[text]) queueRef.current.add(text)
    }
    schedule()
  }, [schedule])

  // Reads from state, not the refs, so a render always shows the newest translations.
  const translate = (value) => {
    if (typeof value !== 'string' || language === 'en' || showOriginal) return value
    return translations[language]?.[value.trim()] ?? value
  }

  const setLanguage = useCallback((nextLanguage) => {
    if (!LANGUAGES.some(({ code }) => code === nextLanguage)) return
    // Update the ref right away so text requested during the next render uses the new language.
    languageRef.current = nextLanguage
    queueRef.current.clear()
    attemptsRef.current.clear()
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
