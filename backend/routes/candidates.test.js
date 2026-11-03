import assert from 'node:assert/strict'
import test from 'node:test'

import express from 'express'

import { createCandidateRouter } from './candidates.js'

async function withServer(router, callback) {
  const app = express()
  app.use('/api/candidates', router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('returns a public candidate profile', async () => {
  const id = 'ac131643-571a-4156-bb56-f9ff79e89d54'
  const router = createCandidateRouter({
    candidateRepository: {
      async findCandidateProfile(candidateId) {
        return { id: candidateId, name: 'Candidate', profile: { education: 'University' } }
      },
    },
  })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/candidates/${id}`)
    assert.equal(response.status, 200)
    assert.equal((await response.json()).profile.education, 'University')
  })
})

test('streams an official candidate photo with a safe content type', async () => {
  const id = 'ac131643-571a-4156-bb56-f9ff79e89d54'
  const router = createCandidateRouter({
    candidateRepository: {
      async findCandidatePhoto() {
        return { photo: Buffer.from('photo bytes'), photo_mime_type: 'image/png' }
      },
    },
  })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/candidates/${id}/photo`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'photo bytes')
  })
})

test('rejects malformed candidate IDs before querying the database', async () => {
  const router = createCandidateRouter({ candidateRepository: {} })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/candidates/not-a-uuid`)
    assert.equal(response.status, 400)
  })
})
