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

function fakeModel({ fail = () => false, delayMs = 0 } = {}) {
  const calls = []
  return {
    calls,
    model: 'muse-spark-1.3',
    async generateJson(request) {
      const { sourceTexts } = JSON.parse(request.input)
      calls.push({ ...request, sourceTexts })
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (fail(sourceTexts, calls.length)) throw new Error('model down')
      return { translations: sourceTexts.map((text) => `es:${text}`) }
    },
  }
}

test('uses minimal reasoning and splits large pages into parallel batches', async () => {
  const model = fakeModel({ delayMs: 20 })
  const service = createTranslationService({ modelClient: model })
  const texts = Array.from({ length: 30 }, (_, index) => `String ${index}`)

  const result = await service.translate({ texts, targetLanguage: 'es' })

  assert.deepEqual(result, texts.map((text) => `es:${text}`))
  assert.equal(model.calls.length, 3)
  assert.ok(model.calls.every((call) => call.reasoningEffort === 'minimal'))
  assert.ok(model.calls.every((call) => call.sourceTexts.length <= 12))
})

test('retries a failed batch once', async () => {
  const model = fakeModel({ fail: (_texts, callNumber) => callNumber === 1 })
  const service = createTranslationService({ modelClient: model })

  assert.deepEqual(await service.translate({ texts: ['Vote'], targetLanguage: 'es' }), ['es:Vote'])
  assert.equal(model.calls.length, 2)
})

test('returns null for strings that could not be translated when others succeed', async () => {
  const model = fakeModel({ fail: (texts) => texts.includes('String 0') })
  const service = createTranslationService({ modelClient: model })
  const texts = Array.from({ length: 13 }, (_, index) => `String ${index}`)

  const result = await service.translate({ texts, targetLanguage: 'es' })

  assert.equal(result.filter((value) => value === null).length, 12)
  assert.equal(result[12], 'es:String 12')
})

test('shares one model call between simultaneous requests for the same text', async () => {
  const model = fakeModel({ delayMs: 20 })
  const service = createTranslationService({ modelClient: model })

  const [first, second] = await Promise.all([
    service.translate({ texts: ['Election Day'], targetLanguage: 'es' }),
    service.translate({ texts: ['Election Day'], targetLanguage: 'es' }),
  ])

  assert.deepEqual(first, ['es:Election Day'])
  assert.deepEqual(second, first)
  assert.equal(model.calls.length, 1)
})

test('keeps translations on disk across restarts', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const directory = await mkdtemp(join(tmpdir(), 'pollpal-translations-'))
  const cacheFile = join(directory, 'translations.json')

  try {
    const firstModel = fakeModel()
    const first = createTranslationService({ modelClient: firstModel, cacheFile, saveDelayMs: 0 })
    await first.translate({ texts: ['Find elections'], targetLanguage: 'es' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const secondModel = fakeModel()
    const second = createTranslationService({ modelClient: secondModel, cacheFile })
    assert.deepEqual(await second.translate({ texts: ['Find elections'], targetLanguage: 'es' }), ['es:Find elections'])
    assert.equal(secondModel.calls.length, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
