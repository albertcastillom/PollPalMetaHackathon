import { Router } from 'express'
import { z } from 'zod'

const contestIdSchema = z.string().uuid()

export function createContestRouter({ comparisonService }) {
  const router = Router()

  router.get('/:contestId/comparison', async (request, response, next) => {
    const parsed = contestIdSchema.safeParse(request.params.contestId)
    if (!parsed.success) {
      return response.status(400).json({ error: { code: 'invalid_contest_id', message: 'Contest ID is invalid.' } })
    }
    try {
      const comparison = await comparisonService.compareContest(parsed.data)
      if (!comparison) {
        return response.status(404).json({ error: { code: 'contest_not_found', message: 'Candidate race was not found.' } })
      }
      return response.json(comparison)
    } catch (error) {
      return next(error)
    }
  })

  return router
}
