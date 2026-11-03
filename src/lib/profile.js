import { supabase } from './supabase'

// Data access for the logged-in person's profile, friends, and reminder settings.
// Every call runs as the logged-in user; row level security in Supabase keeps each
// person's data private. Each function throws an Error with a message safe to show.

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}

function client() {
  if (!supabase) throw new Error('Login is not set up yet.')
  return supabase
}

export async function getProfile(userId) {
  return check(await client().from('profiles').select('id, email, display_name, created_at').eq('id', userId).maybeSingle())
}

export async function updateDisplayName(userId, displayName) {
  const value = displayName.trim() || null
  return check(
    await client()
      .from('profiles')
      .update({ display_name: value, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, display_name, created_at')
      .single(),
  )
}

export async function getReminderPreferences(userId) {
  return check(
    await client()
      .from('reminder_preferences')
      .select('email_enabled, address, normalized_location, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
  )
}

export async function saveReminderPreferences(userId, { emailEnabled, address, normalizedLocation }) {
  return check(
    await client()
      .from('reminder_preferences')
      .upsert({
        user_id: userId,
        email_enabled: emailEnabled,
        address: address || null,
        normalized_location: normalizedLocation || null,
        updated_at: new Date().toISOString(),
      })
      .select('email_enabled, address, normalized_location, updated_at')
      .single(),
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
  check(
    await client()
      .from('friendships')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', friendshipId),
  )
}

// Removes a friend, declines an incoming request, or cancels an outgoing one.
export async function removeFriendship(friendshipId) {
  check(await client().from('friendships').delete().eq('id', friendshipId))
}
