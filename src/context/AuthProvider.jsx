import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

const NOT_CONFIGURED = {
  data: null,
  error: { message: 'Login is not set up yet. Add the Supabase URL and key to .env.local.' },
}

// Keeps track of who is logged in. Logging in is always optional: when nobody is
// logged in, `user` is null and the rest of the site works the same.
function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      loading,
      configured: Boolean(supabase),
      signIn: (email, password) =>
        supabase ? supabase.auth.signInWithPassword({ email, password }) : Promise.resolve(NOT_CONFIGURED),
      signUp: (email, password) =>
        supabase ? supabase.auth.signUp({ email, password }) : Promise.resolve(NOT_CONFIGURED),
      signOut: () => (supabase ? supabase.auth.signOut() : Promise.resolve({ error: null })),
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider