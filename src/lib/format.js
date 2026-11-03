// Dates from the API are plain "YYYY-MM-DD" strings. Parse them as local dates so
// they never shift a day because of the viewer's time zone.
function parseDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDate(value, options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return ''
  return parseDate(value).toLocaleDateString('en-US', options)
}

// "20:00:00" -> "8:00 PM"
export function formatTime(value) {
  if (!value) return ''
  const [hours, minutes] = String(value).split(':').map(Number)
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Today as "YYYY-MM-DD" in the viewer's local time, for comparing with API dates.
export function todayString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Straight-line distance in miles. Used only to sort locations, never to decide
// whether a voter may use one.
export function distanceMiles(from, to) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const earthRadiusMiles = 3958.8
  const dLat = toRadians(to.latitude - from.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a))
}