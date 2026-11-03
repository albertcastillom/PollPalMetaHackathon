import assert from 'node:assert/strict'
import test from 'node:test'

import express from 'express'

import { createReminderRouter } from './reminders.js'

async function withServer(router, callback) {
  const app = express()
  app.use(express.json())
  app.use('/api/reminders', router)
  app.use((error, _request, response, _next) => {
    void _next
    response.status(error.status ?? 500).json({ error: { code: error.code ?? 'internal_error' } })
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('creates a reminder subscription for the authenticated user', async () => {
  const calls = []
  const router = createReminderRouter({
    authVerifier: { async verify() { return { id: 'user-1', email: 'voter@example.com' } } },
    reminderRepository: {
      async subscribe(input) {
        calls.push(input)
        return { subscriptionId: 'ed06ac67-00dc-4763-93df-ec02d46c52a3', unsubscribeToken: 'x'.repeat(43) }
      },
    },
    appUrl: 'http://localhost:5173',
  })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reminders`, {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({
        electionId: 'ac131643-571a-4156-bb56-f9ff79e89d54',
        preferences: [{ kind: 'election_day', offsetDays: 1 }],
      }),
    })
    assert.equal(response.status, 201)
    assert.equal(calls[0].userId, 'user-1')
    assert.equal(calls[0].email, 'voter@example.com')
  })
})

test('requires authentication when listing reminders', async () => {
  const router = createReminderRouter({
    authVerifier: { async verify() { throw new Error('not called') } },
    reminderRepository: {},
    appUrl: 'http://localhost:5173',
  })

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/reminders`)
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error.code, 'authentication_required')
  })
})
