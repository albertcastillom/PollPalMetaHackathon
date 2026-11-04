import T from '../context/T'
import { useTranslation } from '../context/useTranslation'

// Shown above lookup results when the backend is in demo mode. Sample data (addresses
// outside Washington) gets a stronger warning than real Washington data shown with a demo date.
function DemoNotice({ demo }) {
  const { translate } = useTranslation(demo?.notice ? [demo.notice] : [])
  if (!demo) return null

  const sample = Boolean(demo.sample)
  return (
    <div
      role="note"
      className={`flex gap-3 rounded-xl border p-4 text-sm ${
        sample ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'
      }`}
    >
      <span aria-hidden="true" className="text-lg leading-none">{sample ? '⚠' : 'ℹ'}</span>
      <p>
        <strong>{sample ? <T>Sample data for demonstration only.</T> : <T>Demo mode.</T>}</strong>{' '}
        {translate(demo.notice)}
      </p>
    </div>
  )
}

export default DemoNotice
