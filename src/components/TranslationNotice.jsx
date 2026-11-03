import T from '../context/T'
import { useTranslation } from '../context/useTranslation'

export default function TranslationNotice() {
  const { language, showOriginal, setShowOriginal, translating, error } = useTranslation()
  if (language === 'en') return null

  return (
    <div className={`border-b px-4 py-2 text-sm ${error ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          {error ? (
            <T>Some text could not be translated. English is shown where a translation is unavailable.</T>
          ) : translating ? (
            <T>Translating this page with Meta Muse Spark…</T>
          ) : (
            <T>Machine translated with Meta Muse Spark. The official English source remains authoritative.</T>
          )}
        </p>
        <button
          type="button"
          onClick={() => setShowOriginal(!showOriginal)}
          className="font-semibold text-blue-800 underline underline-offset-2"
        >
          {showOriginal ? <T>Show translation</T> : <T>View original English</T>}
        </button>
      </div>
    </div>
  )
}
