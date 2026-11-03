import { useState } from 'react'

// A ZIP code search box. Pass `key={zip}` from the parent so it resets when the URL changes.
function ZipForm({ id, initialZip = '', onSubmit, buttonLabel = 'Find elections', hint }) {
  const [value, setValue] = useState(initialZip)
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const zip = value.trim()

    if (!/^\d{5}$/.test(zip)) {
      setError('Enter a 5-digit ZIP code, like 98001.')
      return
    }

    setError('')
    onSubmit(zip)
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        ZIP code
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="e.g. 98001"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full flex-1 rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-700 px-6 py-3 font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          {buttonLabel}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {hint && !error && <p className="mt-3 text-xs text-slate-500">{hint}</p>}
    </form>
  )
}

export default ZipForm