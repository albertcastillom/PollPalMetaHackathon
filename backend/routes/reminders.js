import { Router } from 'express'
import { z } from 'zod'

import { requireUser } from '../services/supabase-auth.js'

const reminderKinds = [
  'voting_period_start',
  'registration_online_mail_deadline',
  'registration_in_person_deadline',
  'ballot_return_deadline',
  'election_day',
]

const subscriptionSchema = z.object({
  electionId: z.uuid(),
  timezone: z.literal('America/Los_Angeles').default('America/Los_Angeles'),
  preferences: z.array(z.object({
    kind: z.enum(reminderKinds),
    offsetDays: z.number().int().min(0).max(30),
  })).min(1).max(20),
}).superRefine((value, context) => {
  const keys = value.preferences.map(({ kind, offsetDays }) => `${kind}:${offsetDays}`)
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', message: 'Reminder preferences must be unique.' })
  }
})

const unsubscribeSchema = z.object({ token: z.string().min(32).max(200) })

function invalidBody(response, message) {
  return response.status(400).json({ error: { code: 'invalid_reminder_request', message } })
}

export function createReminderRouter({ authVerifier, reminderRepository, appUrl }) {
  const router = Router()
  const authenticated = requireUser(authVerifier)

  router.get('/', authenticated, async (request, response, next) => {
    try {
      return response.json({ subscriptions: await reminderRepository.listForUser(request.user.id) })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/', authenticated, async (request, response, next) => {
    const parsed = subscriptionSchema.safeParse(request.body)
    if (!parsed.success) return invalidBody(response, parsed.error.issues[0].message)

    try {
      const result = await reminderRepository.subscribe({
        userId: request.user.id,
        email: request.user.email,
        ...parsed.data,
      })
      return response.status(201).json({
        subscriptionId: result.subscriptionId,
        unsubscribeUrl: `${appUrl.replace(/\/$/, '')}/unsubscribe?token=${encodeURIComponent(result.unsubscribeToken)}`,
      })
    } catch (error) {
      return next(error)
    }
  })

  router.delete('/:subscriptionId', authenticated, async (request, response, next) => {
    const parsedId = z.uuid().safeParse(request.params.subscriptionId)
    if (!parsedId.success) return invalidBody(response, 'A valid subscription id is required.')

    try {
      const found = await reminderRepository.unsubscribeByUser({
        userId: request.user.id,
        subscriptionId: parsedId.data,
      })
      if (!found) {
        return response.status(404).json({
          error: { code: 'subscription_not_found', message: 'Reminder subscription not found.' },
        })
      }
      return response.status(204).end()
    } catch (error) {
      return next(error)
    }
  })

  router.post('/unsubscribe', async (request, response, next) => {
    const parsed = unsubscribeSchema.safeParse(request.body)
    if (!parsed.success) return invalidBody(response, parsed.error.issues[0].message)

    try {
      await reminderRepository.unsubscribeByToken(parsed.data.token)
      return response.json({ unsubscribed: true })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
