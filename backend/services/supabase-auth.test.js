import assert from 'node:assert/strict'
import test from 'node:test'

import { createSupabaseAuthVerifier } from './supabase-auth.js'

test('verifies a bearer token with Supabase Auth and normalizes email', async () => {
  const calls = []
  const verifier = createSupabaseAuthVerifier({
    supabaseUrl: 'https://example.supabase.co/',
    publishableKey: 'publishable-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return Response.json({
        id: '33d30aca-e3e9-40d8-8c1d-eefb863d14c1',
        email: 'VOTER@EXAMPLE.COM',
        email_confirmed_at: '2026-11-02T20:00:00Z',
      })
    },
  })

  const user = await verifier.verify('access-token')

  assert.deepEqual(user, {
    id: '33d30aca-e3e9-40d8-8c1d-eefb863d14c1',
    email: 'voter@example.com',
  })
  assert.equal(calls[0].url, 'https://example.supabase.co/auth/v1/user')
  assert.equal(calls[0].options.headers.authorization, 'Bearer access-token')
})

test('rejects invalid Supabase sessions', async () => {
  const verifier = createSupabaseAuthVerifier({
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'publishable-key',
    fetchImpl: async () => new Response(null, { status: 401 }),
  })

  await assert.rejects(() => verifier.verify('bad-token'), { code: 'invalid_session', status: 401 })
})
