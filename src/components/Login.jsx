import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20'

function Login() {
  const { user, loading, configured, signIn, signUp, signOut } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isSignUp = mode === 'signup'

  function switchMode() {
    setMode(isSignUp ? 'login' : 'signup')
    setError('')
    setNotice('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)

    const { data, error: authError } = isSignUp
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password)

    setSubmitting(false)

    if (authError) {
      setError(authError.message)
      return
    }

    // If email confirmation is turned on in Supabase, sign-up does not log the person in yet.
    if (isSignUp && !data?.session) {
      setNotice('Almost done. Check your email for a link to confirm your account, then log in.')
      return
    }

    navigate('/')
  }

  if (loading) {
    return <p className="px-4 py-16 text-center text-sm text-slate-500">Loading…</p>
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">You&apos;re logged in</h1>
          <p className="mt-2 break-all text-sm text-slate-600">{user.email}</p>
          <div className="mt-6 flex gap-3">
            <Link
              to="/"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Find elections
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">{isSignUp ? 'Create an account' : 'Log in'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Optional. An account lets you save your elections and get reminders.
        </p>

        {!configured && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Login is not set up yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code> and restart the dev server.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !configured}
            className="w-full rounded-lg bg-blue-700 py-3 font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" onClick={switchMode} className="font-medium text-blue-700 hover:underline">
            {isSignUp ? 'Log in' : 'Create an account'}
          </button>
        </p>

        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-sm text-slate-600">You don&apos;t need an account to use the site.</p>
          <Link to="/" className="mt-1 inline-block text-sm font-semibold text-blue-700 hover:underline">
            Continue without an account
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login