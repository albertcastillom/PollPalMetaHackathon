import assert from 'node:assert/strict'
import test from 'node:test'

import { createTranslationService } from './translation-service.js'

test('translates English text with Meta NLLB language codes and caches the result', async () => {
  const calls = []
  const service = createTranslationService({
    apiToken: 'test-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify([{ translation_text: 'Hola votante' }]), { status: 200 })
    },
  })

  const first = await service.translate({ texts: ['Hello voter'], targetLanguage: 'es' })
  const second = await service.translate({ texts: ['Hello voter'], targetLanguage: 'es' })

  assert.deepEqual(first, ['Hola votante'])
  assert.deepEqual(second, first)
  assert.equal(calls.length, 1)
  const payload = JSON.parse(calls[0].options.body)
  assert.equal(payload.parameters.src_lang, 'eng_Latn')
  assert.equal(payload.parameters.tgt_lang, 'spa_Latn')
  assert.match(calls[0].url, /facebook\/nllb-200-distilled-600M$/)
})

test('reports a safe unavailable error when no inference token is configured', async () => {
  const service = createTranslationService()

  await assert.rejects(
    service.translate({ texts: ['Election Day'], targetLanguage: 'vi' }),
    (error) => error.status === 503 && error.code === 'translation_unavailable',
  )
})

test('returns English without calling the provider', async () => {
  const service = createTranslationService({
    fetchImpl: async () => {
      throw new Error('provider should not be called')
    },
  })

  assert.deepEqual(
    await service.translate({ texts: ['Election Day'], targetLanguage: 'en' }),
    ['Election Day'],
  )
})
