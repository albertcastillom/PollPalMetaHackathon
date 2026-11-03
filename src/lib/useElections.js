import { useEffect, useState } from 'react'
import { fetchElectionsByAddress } from './api'

// Loads elections for the shared search ({ address, attempt }). An empty address means
// "no search yet". A new `attempt` re-runs the lookup even when the address is unchanged.
export function useElections({ address, attempt }) {
  const [result, setResult] = useState({ attempt: -1, data: null, error: null })

  useEffect(() => {
    if (!address) return undefined

    const controller = new AbortController()

    fetchElectionsByAddress(address, { signal: controller.signal })
      .then((data) => setResult({ attempt, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ attempt, data: null, error })
      })

    return () => controller.abort()
  }, [address, attempt])

  const isCurrent = result.attempt === attempt

  return {
    loading: Boolean(address) && !isCurrent,
    data: isCurrent ? result.data : null,
    error: isCurrent ? result.error : null,
  }
}
