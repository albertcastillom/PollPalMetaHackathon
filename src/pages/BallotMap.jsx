const dropOffs = [
  { name: 'Drop-off location name', address: '123 Main Street', hours: 'Open 24 hours', distance: '0.8 mi' },
  { name: 'Drop-off location name', address: '456 Oak Avenue', hours: 'Mon–Fri, 8 AM – 5 PM', distance: '1.4 mi' },
  { name: 'Drop-off location name', address: '789 Civic Center Drive', hours: 'Open 24 hours', distance: '2.1 mi' },
]

const pins = [
  { top: '28%', left: '30%' },
  { top: '55%', left: '58%' },
  { top: '70%', left: '25%' },
]

function MapPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Ballot drop-off locations
        </h1>
        <p className="mt-2 text-slate-600">See where you can drop off your ballot near you.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Map placeholder */}
        <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:col-span-2 lg:min-h-[480px]">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {pins.map((pin, i) => (
            <div key={i} className="absolute -translate-x-1/2 -translate-y-full" style={pin}>
              <svg viewBox="0 0 24 24" className="h-9 w-9 text-blue-700 drop-shadow" fill="currentColor">
                <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
              </svg>
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 bg-white/90 px-4 py-3 text-center text-sm text-slate-500 backdrop-blur">
            Interactive map will appear here
          </div>
        </div>

        {/* Location list */}
        <div className="space-y-3">
          <label htmlFor="map-search" className="text-sm font-semibold text-slate-800">
            Address or ZIP code
          </label>
          <input
            id="map-search"
            type="text"
            placeholder="Search by address or ZIP"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
          {dropOffs.map((spot, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{spot.name}</p>
                <span className="shrink-0 text-xs font-medium text-slate-500">{spot.distance}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{spot.address}</p>
              <p className="mt-1 text-xs font-medium text-blue-700">{spot.hours}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MapPage