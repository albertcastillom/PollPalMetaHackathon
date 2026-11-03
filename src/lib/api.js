const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const ZIP_LOOKUP_URL = 'https://api.zippopotam.us/us'

function isAbort(error) {
  return error?.name === 'AbortError'
}

// Turns a 5-digit ZIP code into the coordinates of its center point using the free
// Zippopotam.us service. The backend only accepts a full address or coordinates, so the
// ZIP step happens here in the browser and the backend code stays unchanged.
async function lookupZip(zip, signal) {
  let response

  try {
    response = await fetch(`${ZIP_LOOKUP_URL}/${zip}`, { signal })
  } catch (error) {
    if (isAbort(error)) throw error
    throw new Error('ZIP code lookup is temporarily unavailable. Please try again.', { cause: error })
  }

  if (response.status === 404) throw new Error('That ZIP code was not found.')
  if (!response.ok) throw new Error('ZIP code lookup is temporarily unavailable. Please try again.')

  const body = await response.json().catch(() => null)
  const places = Array.isArray(body?.places) ? body.places : []
  // A few ZIP codes cross state lines. Prefer the Washington part when there is one.
  const place = places.find((item) => item['state abbreviation'] === 'WA') ?? places[0]

  if (!place) throw new Error('That ZIP code was not found.')
  if (place['state abbreviation'] !== 'WA') {
    throw new Error('Right now we only cover Washington state. Try a Washington ZIP code.')
  }

  const latitude = Number(place.latitude)
  const longitude = Number(place.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('That ZIP code was not found.')
  }

  return { latitude, longitude, label: `${place['place name']}, WA ${zip}` }
}

// Looks up upcoming elections, voting locations and contests for a 5-digit ZIP code.
// Throws an Error with a message that is safe to show to the user.
export async function fetchElectionsByZip(zip, { signal } = {}) {
  const { latitude, longitude, label } = await lookupZip(zip, signal)

  let response

  try {
    response = await fetch(`${API_URL}/api/elections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coordinates: { latitude, longitude } }),
      signal,
    })
  } catch (error) {
    if (isAbort(error)) throw error
    throw new Error('Could not reach the PollPal server. Make sure the backend is running.', { cause: error })
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body?.error?.message ?? 'Something went wrong. Please try again.'
    throw Object.assign(new Error(message), { code: body?.error?.code })
  }

  return {
    ...body,
    normalizedLocation: label,
    // The backend only saw coordinates, so mark the result as a ZIP-code estimate here.
    query: { ...body.query, type: 'zip', precision: 'zip_centroid' },
  }
}