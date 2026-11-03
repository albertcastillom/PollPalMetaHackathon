import { Router } from 'express'
import { z } from 'zod'

import { TRANSLATION_LANGUAGES } from '../services/translation-service.js'

const requestSchema = z
  .object({
    targetLanguage: z.string().min(2).max(8),
    texts: z.array(z.string().trim().min(1).max(1500)).min(1).max(40),
  })
  .refine(({ texts }) => texts.reduce((total, text) => total + text.length, 0) <= 12_000, {
    message: 'The translation request is too large.',
  })

export function createTranslationRouter({ translationService }) {
  const router = Router()

  router.get('/languages', (_request, response) => {
    response.json({
      available: translationService.isConfigured,
      model: translationService.model,
      languages: TRANSLATION_LANGUAGES.map(({ code, name, nativeName, direction }) => ({
        code,
        name,
        nativeName,
        ...(direction ? { direction } : {}),
      })),
    })
  })

  router.post('/', async (request, response, next) => {
    const parsed = requestSchema.safeParse(request.body)
    if (!parsed.success) {
      return response.status(400).json({
        error: { code: 'invalid_translation_request', message: parsed.error.issues[0].message },
      })
    }

    try {
      const translations = await translationService.translate(parsed.data)
      return response.json({ translations, targetLanguage: parsed.data.targetLanguage })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
