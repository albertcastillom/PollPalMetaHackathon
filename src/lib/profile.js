import { supabase } from './supabase'

// Data access for the logged-in person's profile, friends, and reminder settings.
// Every call runs as the logged-in user; row level security in Supabase keeps each
// person's data private. Each function throws an Error with a message safe to show.

const PROFILE_COLUMNS = 'id, email, display_name, created_at, voted_at'

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}

function client() {
  if (!supabase) throw new Error('Login is not set up yet.')
  return supabase
}

export async function getProfile(userId) {
  return check(await client().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle())
}

export async function updateDisplayName(userId, displayName) {
  const value = displayName.trim() || null
  return check(
    await client()
      .from('profiles')
      .update({ display_name: value, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .single(),
  )
}

// Marks (or unmarks) that the person voted. Returns the updated profile.
export async function setVoted(userId, voted) {
  const now = new Date().toISOString()
  return check(
    await client()
      .from('profiles')
      .update({ voted_at: voted ? now : null, updated_at: now })
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .single(),
  )
}

export async function getReminderPreferences(userId) {
  return check(
    await client()
      .from('account_preferences')
      .select('email_subscribed, address, normalized_location, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
  )
}

const REMINDER_COLUMNS = 'email_subscribed, address, normalized_location, updated_at'

// Every account gets an account_preferences row when it signs up, so this updates that row.
// It doesn't use upsert: an upsert also rewrites user_id, which logged-in users are not
// allowed to change, and Postgres rejects the whole save. The insert is only a fallback for
// an account whose row is missing.
export async function saveReminderPreferences(userId, { emailEnabled, address, normalizedLocation }) {
  const values = {
    email_subscribed: emailEnabled,
    address: address || null,
    normalized_location: normalizedLocation || null,
    updated_at: new Date().toISOString(),
  }
  const updated = check(
    await client().from('account_preferences').update(values).eq('user_id', userId).select(REMINDER_COLUMNS).maybeSingle(),
  )
  if (updated) return updated
  return check(
    await client().from('account_preferences').insert({ user_id: userId, ...values }).select(REMINDER_COLUMNS).single(),
  )
}

export async function listFriends() {
  return check(await client().rpc('list_friends')) ?? []
}

// Returns 'requested', 'accepted' (they had already asked you), or 'already_friends'.
export async function sendFriendRequest(email) {
  return check(await client().rpc('send_friend_request', { friend_email: email }))
}

export async function acceptFriendRequest(friendshipId) {
  check(await client().rpc('accept_friend_request', { friendship_id: friendshipId }))
}

// Removes a friend, declines an incoming request, or cancels an outgoing one.
export async function removeFriendship(friendshipId) {
  check(await client().from('friendships').delete().eq('id', friendshipId))
}
