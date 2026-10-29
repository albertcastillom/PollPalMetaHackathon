import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { createElectionRouter } from './routes/elections.js'

export function createApp({ electionService, clientOrigin = 'http://localhost:5173' }) {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: clientOrigin }))
  app.use(express.json({ limit: '16kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.use('/api/elections', createElectionRouter({ electionService }))

  app.use((error, _request, response, _next) => {
    void _next
    const status = Number.isInteger(error.status) ? error.status : 500
    const code = error.code ?? 'internal_error'

    if (status >= 500) {
      console.error(`[${code}] ${error.message}`)
    }

    response.status(status).json({
      error: {
        code,
        message: status >= 500 ? 'Election information is temporarily unavailable.' : error.message,
      },
    })
  })

  return app
}
