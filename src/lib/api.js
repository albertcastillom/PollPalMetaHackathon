const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

// Looks up upcoming elections, voting locations and contests for a full street address.
// The backend turns the address into coordinates (US Census geocoder) and does not store it.
// Throws an Error with a message that is safe to show to the user.
export async function fetchElectionsByAddress(address, { signal } = {}) {
  let response

  try {
    response = await fetch(`${API_URL}/api/elections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Could not reach the PollPal server. Make sure the backend is running.', { cause: error })
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body?.error?.message ?? 'Something went wrong. Please try again.'
    throw Object.assign(new Error(message), { code: body?.error?.code })
  }

  return body
}

export async function fetchTranslations(texts, targetLanguage, { signal } = {}) {
  let response

  try {
    response = await fetch(`${API_URL}/api/translations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts, targetLanguage }),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('AI translation is temporarily unavailable.', { cause: error })
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(
      new Error(body?.error?.message ?? 'AI translation is temporarily unavailable.'),
      { code: body?.error?.code },
    )
  }
  return body.translations
}
