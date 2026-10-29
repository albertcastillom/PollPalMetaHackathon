import { Router } from 'express'
import { z } from 'zod'

const lookupSchema = z.object({
  address: z.string().trim().min(8).max(300).optional(),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
}).refine((value) => Boolean(value.address) !== Boolean(value.coordinates), {
  message: 'Provide exactly one of address or coordinates.',
})

export function createElectionRouter({ electionService }) {
  const router = Router()

  router.post('/', async (request, response, next) => {
    const parsed = lookupSchema.safeParse(request.body)

    if (!parsed.success) {
      return response.status(400).json({
        error: {
          code: 'invalid_location',
          message: parsed.error.issues[0].message,
        },
      })
    }

    try {
      const result = await electionService.findUpcoming(parsed.data)
      return response.json(result)
    } catch (error) {
      return next(error)
    }
  })

  return router
}
