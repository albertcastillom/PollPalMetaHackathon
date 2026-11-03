import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { fetchElectionsByAddress } from '../lib/api'
import { formatDate } from '../lib/format'
import {
  acceptFriendRequest,
  getProfile,
  getReminderPreferences,
  listFriends,
  removeFriendship,
  saveReminderPreferences,
  sendFriendRequest,
  updateDisplayName,
} from '../lib/profile'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20'
const primaryButton =
  'rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryButton =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60'

function Card({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Message({ message }) {
  if (!message) return null
  const isError = message.type === 'error'
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={`mt-3 rounded-lg px-3 py-2 text-sm ${isError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}
    >
      {message.text}
    </p>
  )
}

function nameOf(person) {
  return person.display_name || person.email
}

function Avatar({ person, size = 'h-10 w-10 text-base' }) {
  const letter = (nameOf(person) ?? '?').trim().charAt(0).toUpperCase()
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-800 ${size}`}>
      {letter}
    </span>
  )
}

// ---------- Profile summary ----------

function ProfileSummary({ profile, onUpdated }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      onUpdated(await updateDisplayName(profile.id, name))
      setEditing(false)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar person={profile} size="h-16 w-16 text-2xl" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={handleSave} className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="display-name" className="sr-only">
                Display name
              </label>
              <input
                id="display-name"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className={inputClass}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className={primaryButton}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setName(profile.display_name ?? '')
                  }}
                  className={secondaryButton}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="truncate text-2xl font-bold text-slate-900">
                {profile.display_name || 'Your profile'}
              </h1>
              <p className="truncate text-sm text-slate-600">{profile.email}</p>
              {profile.created_at && (
                <p className="mt-1 text-xs text-slate-500">
                  Member since {formatDate(profile.created_at, { month: 'long', year: 'numeric' })}
                </p>
              )}
            </>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={`${secondaryButton} self-start sm:self-center`}>
            {profile.display_name ? 'Edit name' : 'Add your name'}
          </button>
        )}
      </div>
      <Message message={message} />
    </section>
  )
}

// ---------- Email reminders ----------

function Reminders({ userId, email, initial }) {
  const [enabled, setEnabled] = useState(Boolean(initial?.email_enabled))
  const [address, setAddress] = useState(initial?.address ?? '')
  const [saved, setSaved] = useState(initial)
  const [elections, setElections] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  // Show the upcoming elections for the saved address, so people can see what they'll hear about.
  useEffect(() => {
    if (!saved?.email_enabled || !saved.address) return undefined
    const controller = new AbortController()
    fetchElectionsByAddress(saved.address, { signal: controller.signal })
      .then((data) => setElections(data.elections ?? []))
      .catch(() => {})
    return () => controller.abort()
  }, [saved])

  const dirty =
    enabled !== Boolean(saved?.email_enabled) || address.trim() !== (saved?.address ?? '')

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage(null)
    const cleanAddress = address.trim().replace(/\s+/g, ' ')

    if (enabled && (cleanAddress.length < 8 || !/\d/.test(cleanAddress))) {
      setMessage({ type: 'error', text: 'Enter your full street address, like 123 Main St, Auburn, WA 98001.' })
      return
    }

    setSaving(true)
    try {
      let normalizedLocation = cleanAddress === saved?.address ? saved?.normalized_location : null

      // Check the address with the elections lookup before turning reminders on.
      if (enabled && cleanAddress && cleanAddress !== saved?.address) {
        const data = await fetchElectionsByAddress(cleanAddress)
        normalizedLocation = data.normalizedLocation ?? null
        setElections(data.elections ?? [])
      }

      const next = await saveReminderPreferences(userId, {
        emailEnabled: enabled,
        address: cleanAddress,
        normalizedLocation,
      })
      setSaved(next)
      setAddress(next.address ?? '')
      if (!enabled) setElections(null)
      setMessage({
        type: 'success',
        text: enabled ? `Reminders are on. We'll email ${email} before key election dates.` : 'Email reminders are off.',
      })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Email reminders"
      description="Get an email before registration deadlines, ballot drop-off closings, and Election Day where you live."
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="reminders-label" className="text-sm font-medium text-slate-800">
              Email me about elections in my area
            </p>
            <p className="text-xs text-slate-500">Sent to {email}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="reminders-label"
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
              enabled ? 'bg-blue-700' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <div className="mt-4">
            <label htmlFor="reminder-address" className="block text-sm font-medium text-slate-700">
              Home address
            </label>
            <input
              id="reminder-address"
              type="text"
              autoComplete="street-address"
              maxLength={300}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="e.g. 123 Main St, Auburn, WA 98001"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Only you can see this. We use it to find which elections you can vote in. Currently covers Washington state.
            </p>
            {saved?.email_enabled && saved.normalized_location && (
              <p className="mt-2 text-xs text-slate-600">
                Matched to: <span className="font-medium">{saved.normalized_location}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={saving || !dirty} className={primaryButton}>
            {saving ? 'Saving…' : 'Save reminder settings'}
          </button>
        </div>
        <Message message={message} />
      </form>

      {saved?.email_enabled && elections && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-medium text-slate-800">Upcoming elections we&apos;ll remind you about</h3>
          {elections.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              None scheduled in our data yet. We&apos;ll email you when one is added.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {elections.map((election) => (
                <li key={election.id} className="flex justify-between gap-4">
                  <span className="text-slate-700">{election.name}</span>
                  <span className="shrink-0 text-slate-500">{formatDate(election.electionDay)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

// ---------- Friends ----------

function FriendRow({ friend, busy, children }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar person={friend} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{nameOf(friend)}</p>
        {friend.display_name && <p className="truncate text-xs text-slate-500">{friend.email}</p>}
      </div>
      <div className={`flex shrink-0 gap-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>{children}</div>
    </li>
  )
}

function Friends({ initial }) {
  const [friends, setFriends] = useState(initial)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState(null)

  const incoming = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming')
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing')
  const accepted = friends.filter((f) => f.status === 'accepted')

  async function refresh() {
    setFriends(await listFriends())
  }

  async function handleAdd(event) {
    event.preventDefault()
    const target = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMessage({ type: 'error', text: 'Enter your friend’s email address.' })
      return
    }
    setSending(true)
    setMessage(null)
    try {
      const result = await sendFriendRequest(target)
      await refresh()
      setEmail('')
      setMessage({
        type: 'success',
        text:
          result === 'accepted'
            ? `You and ${target} are now friends.`
            : result === 'already_friends'
              ? `You're already friends with ${target}.`
              : `Friend request sent to ${target}.`,
      })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setSending(false)
    }
  }

  async function act(friendshipId, action, successText) {
    setBusyId(friendshipId)
    setMessage(null)
    try {
      await action(friendshipId)
      await refresh()
      if (successText) setMessage({ type: 'success', text: successText })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card title="Friends" description="Add friends to remind each other to vote.">
      <form onSubmit={handleAdd} noValidate className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="friend-email" className="sr-only">
          Friend&apos;s email
        </label>
        <input
          id="friend-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="friend@example.com"
          className={inputClass}
        />
        <button type="submit" disabled={sending} className={`${primaryButton} shrink-0`}>
          {sending ? 'Sending…' : 'Add friend'}
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">Your friend needs a PollPal account with this email.</p>
      <Message message={message} />

      {incoming.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-slate-800">Requests for you ({incoming.length})</h3>
          <ul className="divide-y divide-slate-100">
            {incoming.map((friend) => (
              <FriendRow key={friend.friendship_id} friend={friend} busy={busyId === friend.friendship_id}>
                <button
                  type="button"
                  onClick={() => act(friend.friendship_id, acceptFriendRequest, `You and ${nameOf(friend)} are now friends.`)}
                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
                >
                  Accept
                </button>
                <button type="button" onClick={() => act(friend.friendship_id, removeFriendship)} className={secondaryButton}>
                  Decline
                </button>
              </FriendRow>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-800">Your friends ({accepted.length})</h3>
        {accepted.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No friends yet. Add someone by email above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accepted.map((friend) => (
              <FriendRow key={friend.friendship_id} friend={friend} busy={busyId === friend.friendship_id}>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove ${nameOf(friend)} from your friends?`)) {
                      act(friend.friendship_id, removeFriendship)
                    }
                  }}
                  className={secondaryButton}
                >
                  Remove
                </button>
              </FriendRow>
            ))}
          </ul>
        )}
      </div>

      {outgoing.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-slate-800">Waiting for a reply ({outgoing.length})</h3>
          <ul className="divide-y divide-slate-100">
            {outgoing.map((friend) => (
              <FriendRow key={friend.friendship_id} friend={friend} busy={busyId === friend.friendship_id}>
                <button type="button" onClick={() => act(friend.friendship_id, removeFriendship)} className={secondaryButton}>
                  Cancel
                </button>
              </FriendRow>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

// ---------- Page ----------

function Profile() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const [state, setState] = useState({ userId: null, data: null, error: null })

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false

    Promise.all([getProfile(userId), getReminderPreferences(userId), listFriends()])
      .then(([profile, reminders, friends]) => {
        if (!cancelled) setState({ userId, data: { profile, reminders, friends }, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ userId, data: null, error })
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  if (authLoading) {
    return <p className="px-4 py-16 text-center text-sm text-slate-500">Loading…</p>
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">Your profile</h1>
          <p className="mt-2 text-sm text-slate-600">
            Log in to add friends and get email reminders about elections where you live.
          </p>
          <Link to="/login" className={`mt-6 inline-block ${primaryButton}`}>
            Log in or create an account
          </Link>
        </div>
      </div>
    )
  }

  const isCurrent = state.userId === userId
  const { data, error } = isCurrent ? state : { data: null, error: null }
  // Fall back to the auth user if the profile row hasn't been created yet.
  const profile = data && (data.profile ?? { id: user.id, email: user.email, display_name: null, created_at: user.created_at })

  return (
    <div className="bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6 sm:py-16">
        {!isCurrent && (
          <p role="status" className="text-center text-sm text-slate-500">
            Loading your profile…
          </p>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            We couldn&apos;t load your profile. {error.message}
          </div>
        )}
        {data && (
          <>
            <ProfileSummary
              profile={profile}
              onUpdated={(next) => setState((previous) => ({ ...previous, data: { ...previous.data, profile: next } }))}
            />
            <Reminders userId={user.id} email={profile.email} initial={data.reminders} />
            <Friends initial={data.friends} />
          </>
        )}
      </div>
    </div>
  )
}

export default Profile
