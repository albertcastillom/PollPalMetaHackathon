import assert from 'node:assert/strict'
import test from 'node:test'

import { createTranslationService } from './translation-service.js'

test('translates a batch with Meta Muse Spark structured output and caches the results', async () => {
  const calls = []
  const service = createTranslationService({
    modelClient: {
      model: 'muse-spark-1.3',
      async generateJson(request) {
        calls.push(request)
        return { translations: ['Hola votante', 'Día de las elecciones'] }
      },
    },
  })

  const source = ['Hello voter', 'Election Day']
  const first = await service.translate({ texts: source, targetLanguage: 'es' })
  const second = await service.translate({ texts: source, targetLanguage: 'es' })

  assert.deepEqual(first, ['Hola votante', 'Día de las elecciones'])
  assert.deepEqual(second, first)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].schemaName, 'voter_information_translations')
  assert.equal(calls[0].schema.properties.translations.minItems, 2)
  assert.deepEqual(JSON.parse(calls[0].input), {
    targetLanguage: 'Spanish',
    sourceTexts: source,
  })
})

test('reports a safe unavailable error when Meta Model API is not configured', async () => {
  const service = createTranslationService()

  await assert.rejects(
    service.translate({ texts: ['Election Day'], targetLanguage: 'vi' }),
    (error) => error.status === 503 && error.code === 'translation_unavailable',
  )
})

test('returns English without calling the provider', async () => {
  const service = createTranslationService({
    modelClient: {
      async generateJson() {
        throw new Error('provider should not be called')
      },
    },
  })

  assert.deepEqual(
    await service.translate({ texts: ['Election Day'], targetLanguage: 'en' }),
    ['Election Day'],
  )
})
