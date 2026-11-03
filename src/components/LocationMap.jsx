import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const token = import.meta.env.VITE_MAPBOX_TOKEN
// Center of Washington state, used until the markers decide where to zoom.
const DEFAULT_CENTER = [-120.74, 47.4]

function buildPopup(location) {
  // Built with text nodes (not HTML) so location names can never inject markup.
  const wrapper = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = location.name
  const address = document.createElement('div')
  address.textContent = [location.address, location.city].filter(Boolean).join(', ')
  wrapper.append(title, address)
  return new mapboxgl.Popup({ offset: 28 }).setDOMContent(wrapper)
}

// Mapbox map with one marker per location and a dark dot for the searched address.
// `onSelect` should be a stable function (for example a useState setter).
function LocationMap({ center, locations, selectedId, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const entriesRef = useRef(new Map())

  // Create the map once.
  useEffect(() => {
    if (!token || !containerRef.current) return undefined

    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: 6,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Draw the markers whenever the locations change.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    const markers = []
    const entries = new Map()
    const bounds = new mapboxgl.LngLatBounds()

    if (center) {
      const dot = document.createElement('div')
      dot.title = 'Your address'
      dot.style.cssText =
        'width:16px;height:16px;border-radius:9999px;background:#0f172a;border:3px solid #ffffff;box-shadow:0 0 0 1px #0f172a;'
      const lngLat = [center.longitude, center.latitude]
      markers.push(new mapboxgl.Marker({ element: dot }).setLngLat(lngLat).addTo(map))
      bounds.extend(lngLat)
    }

    for (const location of locations) {
      if (!location.coordinates) continue

      const lngLat = [location.coordinates.longitude, location.coordinates.latitude]
      const popup = buildPopup(location)
      const marker = new mapboxgl.Marker({ color: '#1d4ed8' }).setLngLat(lngLat).setPopup(popup).addTo(map)
      marker.getElement().addEventListener('click', () => onSelect(location.id))

      markers.push(marker)
      entries.set(location.id, { marker, popup, lngLat })
      bounds.extend(lngLat)
    }

    entriesRef.current = entries
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 })
    }

    return () => {
      markers.forEach((marker) => marker.remove())
      entriesRef.current = new Map()
    }
  }, [center, locations, onSelect])

  // Fly to a location when it is chosen from the list.
  useEffect(() => {
    const map = mapRef.current
    const entry = selectedId ? entriesRef.current.get(selectedId) : null
    if (!map || !entry) return

    map.flyTo({ center: entry.lngLat, zoom: Math.max(map.getZoom(), 13), duration: 600 })
    if (!entry.popup.isOpen()) entry.marker.togglePopup()
  }, [selectedId])

  if (!token) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-slate-100 p-6 text-center">
        <p className="max-w-sm text-sm text-slate-600">
          The map needs a Mapbox token. Add <code className="rounded bg-white px-1">VITE_MAPBOX_TOKEN</code> to
          your <code className="rounded bg-white px-1">.env.local</code> file and restart the dev server. The
          list of locations still works without it.
        </p>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full min-h-[320px] w-full" />
}

export default LocationMap