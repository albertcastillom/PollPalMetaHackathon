export function createSupabaseAuthVerifier({ supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const configured = Boolean(supabaseUrl && publishableKey)

  return {
    async verify(accessToken) {
      if (!configured) {
        const error = new Error('Reminder authentication is not configured.')
        error.status = 503
        error.code = 'auth_not_configured'
        throw error
      }

      const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        const error = new Error('Your session is missing, invalid, or expired.')
        error.status = 401
        error.code = 'invalid_session'
        throw error
      }

      const user = await response.json()
      if (!user.id || !user.email || !user.email_confirmed_at) {
        const error = new Error('Verify your email before creating reminders.')
        error.status = 403
        error.code = 'email_not_verified'
        throw error
      }

      return { id: user.id, email: user.email.toLowerCase() }
    },
  }
}

export function requireUser(authVerifier) {
  return async (request, _response, next) => {
    const header = request.get('authorization') ?? ''
    const match = header.match(/^Bearer\s+(.+)$/i)

    if (!match) {
      const error = new Error('A Supabase access token is required.')
      error.status = 401
      error.code = 'authentication_required'
      return next(error)
    }

    try {
      request.user = await authVerifier.verify(match[1])
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
