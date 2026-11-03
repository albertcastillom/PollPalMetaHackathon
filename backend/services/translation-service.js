const DEFAULT_MODEL = 'facebook/nllb-200-distilled-600M'
const DEFAULT_ENDPOINT = 'https://router.huggingface.co/hf-inference/models'

export const TRANSLATION_LANGUAGES = Object.freeze([
  { code: 'en', name: 'English', nativeName: 'English', modelCode: 'eng_Latn' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', modelCode: 'spa_Latn' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文', modelCode: 'zho_Hans' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', modelCode: 'vie_Latn' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', modelCode: 'kor_Hang' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', modelCode: 'rus_Cyrl' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', modelCode: 'ukr_Cyrl' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali', modelCode: 'som_Latn' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', modelCode: 'tgl_Latn' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', modelCode: 'arb_Arab', direction: 'rtl' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', modelCode: 'hin_Deva' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', modelCode: 'pan_Guru' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', modelCode: 'jpn_Jpan' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', modelCode: 'amh_Ethi' },
])

const languageByCode = new Map(TRANSLATION_LANGUAGES.map((language) => [language.code, language]))

function translationFrom(body) {
  const result = Array.isArray(body) ? body[0] : body
  return result?.translation_text ?? result?.generated_text ?? null
}

function serviceError(message, { status = 502, code = 'translation_provider_error', cause } = {}) {
  return Object.assign(new Error(message, { cause }), { status, code })
}

export function createTranslationService({
  apiToken,
  model = DEFAULT_MODEL,
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = fetch,
  cacheSize = 2000,
} = {}) {
  const cache = new Map()
  const modelUrl = endpoint.endsWith(model) ? endpoint : `${endpoint.replace(/\/$/, '')}/${model}`

  function remember(key, value) {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, value)
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value)
  }

  async function translateOne(text, targetLanguage) {
    const cacheKey = `${targetLanguage.code}\u0000${text}`
    const cached = cache.get(cacheKey)
    if (cached) return cached

    let response
    try {
      response = await fetchImpl(modelUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          parameters: {
            src_lang: 'eng_Latn',
            tgt_lang: targetLanguage.modelCode,
            clean_up_tokenization_spaces: true,
            truncation: 'longest_first',
          },
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      throw serviceError('The translation service could not be reached.', { cause: error })
    }

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = typeof body?.error === 'string' ? body.error : `Provider returned HTTP ${response.status}.`
      throw serviceError(`Translation failed: ${detail}`)
    }

    const translated = translationFrom(body)?.trim()
    if (!translated) throw serviceError('The translation service returned an empty translation.')
    remember(cacheKey, translated)
    return translated
  }

  async function translate({ texts, targetLanguage: targetCode }) {
    const targetLanguage = languageByCode.get(targetCode)
    if (!targetLanguage) {
      throw serviceError('That language is not supported.', { status: 400, code: 'unsupported_language' })
    }
    if (targetCode === 'en') return texts
    if (!apiToken) {
      throw serviceError('AI translation is not configured.', { status: 503, code: 'translation_unavailable' })
    }

    const results = new Array(texts.length)
    let nextIndex = 0
    const workers = Array.from({ length: Math.min(4, texts.length) }, async () => {
      while (nextIndex < texts.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await translateOne(texts[index], targetLanguage)
      }
    })
    await Promise.all(workers)
    return results
  }

  return {
    isConfigured: Boolean(apiToken),
    model,
    translate,
  }
}
