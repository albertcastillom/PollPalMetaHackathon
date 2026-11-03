import assert from 'node:assert/strict'
import test from 'node:test'

import express from 'express'

import { createTranslationRouter } from './translations.js'

async function withServer(router, callback) {
  const app = express()
  app.use(express.json())
  app.use('/api/translations', router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('returns supported public languages without exposing model language codes', async () => {
  const router = createTranslationRouter({
    translationService: { isConfigured: true, model: 'facebook/nllb-200-distilled-600M' },
  })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/translations/languages`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.available, true)
    assert.ok(body.languages.some((language) => language.code === 'es'))
    assert.equal(body.languages[0].modelCode, undefined)
  })
})

test('validates and translates a batch', async () => {
  const router = createTranslationRouter({
    translationService: {
      async translate(request) {
        assert.deepEqual(request, { texts: ['Election Day'], targetLanguage: 'es' })
        return ['Día de las elecciones']
      },
    },
  })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/translations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: ['Election Day'], targetLanguage: 'es' }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).translations, ['Día de las elecciones'])
  })
})

test('rejects oversized batches before invoking the provider', async () => {
  const router = createTranslationRouter({ translationService: {} })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/translations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: Array.from({ length: 41 }, () => 'text'), targetLanguage: 'es' }),
    })
    assert.equal(response.status, 400)
  })
})
