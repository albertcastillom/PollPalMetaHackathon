import { useEffect, useState } from 'react'
import { fetchElectionsByZip } from './api'

// Loads elections for a ZIP code whenever the ZIP changes. Pass an empty string for "no search yet".
export function useElections(zip) {
  const [result, setResult] = useState({ zip: '', data: null, error: null })

  useEffect(() => {
    if (!zip) return undefined

    const controller = new AbortController()

    fetchElectionsByZip(zip, { signal: controller.signal })
      .then((data) => setResult({ zip, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ zip, data: null, error })
      })

    return () => controller.abort()
  }, [zip])

  const isCurrent = result.zip === zip

  return {
    loading: Boolean(zip) && !isCurrent,
    data: isCurrent ? result.data : null,
    error: isCurrent ? result.error : null,
  }
}