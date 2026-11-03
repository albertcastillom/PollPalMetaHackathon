import { Router } from 'express'
import { z } from 'zod'

const candidateIdSchema = z.string().uuid()

export function createCandidateRouter({ candidateRepository }) {
  const router = Router()

  router.get('/:candidateId', async (request, response, next) => {
    const parsed = candidateIdSchema.safeParse(request.params.candidateId)
    if (!parsed.success) {
      return response.status(400).json({ error: { code: 'invalid_candidate_id', message: 'Candidate ID is invalid.' } })
    }
    try {
      const candidate = await candidateRepository.findCandidateProfile(parsed.data)
      if (!candidate) {
        return response.status(404).json({ error: { code: 'candidate_not_found', message: 'Candidate was not found.' } })
      }
      return response.json(candidate)
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:candidateId/photo', async (request, response, next) => {
    const parsed = candidateIdSchema.safeParse(request.params.candidateId)
    if (!parsed.success) {
      return response.status(400).json({ error: { code: 'invalid_candidate_id', message: 'Candidate ID is invalid.' } })
    }
    try {
      const photo = await candidateRepository.findCandidatePhoto(parsed.data)
      if (!photo?.photo) {
        return response.status(404).json({ error: { code: 'candidate_photo_not_found', message: 'Candidate photo was not found.' } })
      }
      response.set({
        'content-type': photo.photo_mime_type,
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      })
      return response.send(photo.photo)
    } catch (error) {
      return next(error)
    }
  })

  return router
}
