import { useEffect, useState } from 'react'
import { API_URL, fetchContestComparison } from '../lib/api'

// Source labels shown on every piece of information, so a voter always knows whether they
// are reading an official filing, the candidate's own words, or an AI summary of those words.
function SourceTag({ type }) {
  const styles = {
    official_filing: 'bg-slate-100 text-slate-700',
    candidate_statement: 'bg-amber-50 text-amber-800',
    ai_summary: 'bg-blue-50 text-blue-700',
  }
  const labels = {
    official_filing: 'Official filing',
    candidate_statement: "Candidate's own statement",
    ai_summary: 'AI summary',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  )
}

function Muted({ children }) {
  return <p className="text-sm italic text-slate-500">{children}</p>
}

function RecordCell({ record }) {
  if (!record?.text) return <Muted>Not listed</Muted>
  return (
    <div>
      <SourceTag type={record.sourceType} />
      <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{record.text}</p>
    </div>
  )
}

function AnswerCell({ answer, voterGuideUrl }) {
  if (!answer) return <Muted>Not available</Muted>
  if (answer.status === 'no_statement') return <Muted>No statement submitted to the voters&apos; guide</Muted>
  if (answer.status === 'not_addressed') return <Muted>Not addressed in their statement</Muted>
  if (answer.status === 'not_verified') {
    return (
      <Muted>
        We couldn&apos;t verify a summary against their statement.{' '}
        {voterGuideUrl && (
          <a href={voterGuideUrl} target="_blank" rel="noreferrer" className="not-italic text-blue-700 hover:underline">
            Read it directly
          </a>
        )}
      </Muted>
    )
  }

  return (
    <div className="space-y-2">
      <div>
        <SourceTag type="ai_summary" />
        <p className="mt-1 text-sm text-slate-800">{answer.summary}</p>
      </div>
      {answer.quotes.map((quote) => (
        <blockquote key={quote.text} className="border-l-2 border-amber-300 pl-3">
          <p className="text-sm text-slate-700">&ldquo;{quote.text}&rdquo;</p>
          <footer className="mt-0.5 text-[11px] text-amber-800">Candidate&apos;s own statement · {quote.label}</footer>
        </blockquote>
      ))}
    </div>
  )
}

function CandidateComparison({ contestId }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    fetchContestComparison(contestId, { signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ loading: false, data: null, error })
      })
    return () => controller.abort()
  }, [contestId])

  if (state.loading) {
    return (
      <p role="status" className="mt-4 text-sm text-slate-600">
        Building a side-by-side comparison from each candidate&apos;s official statement…
      </p>
    )
  }
  if (state.error) {
    return (
      <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {state.error.message}
      </div>
    )
  }

  const { candidates, questions, recordRows, ai, audit, notices } = state.data
  const showAnswers = ai.status !== 'not_configured'

  return (
    <div className="mt-5">
      <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">How to read this comparison</p>
        <p><SourceTag type="official_filing" /> {notices.officialFiling}</p>
        <p><SourceTag type="candidate_statement" /> {notices.candidateStatement}</p>
        {showAnswers && <p><SourceTag type="ai_summary" /> {notices.aiSummary}</p>}
        <p>Candidates are listed in ballot order. PollPal does not endorse or rank candidates.</p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full table-fixed border-collapse text-left" style={{ minWidth: `${160 + candidates.length * 240}px` }}>
          <colgroup>
            <col style={{ width: '160px' }} />
            {candidates.map((candidate) => <col key={candidate.id} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 align-top">
              <th scope="col" className="p-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Question</th>
              {candidates.map((candidate) => (
                <th key={candidate.id} scope="col" className="p-3">
                  <div className="flex items-center gap-3">
                    {candidate.photoUrl ? (
                      <img src={`${API_URL}${candidate.photoUrl}`} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div aria-hidden="true" className="h-10 w-10 rounded-full bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{candidate.name}</p>
                      {candidate.voterGuideUrl && (
                        <a href={candidate.voterGuideUrl} target="_blank" rel="noreferrer" className="text-xs font-normal text-blue-700 hover:underline">
                          Official voters&apos; guide entry
                        </a>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50">
              <th colSpan={candidates.length + 1} scope="colgroup" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                From official records
              </th>
            </tr>
            {recordRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <th scope="row" className="p-3 text-sm font-medium text-slate-700">{row.label}</th>
                {candidates.map((candidate) => (
                  <td key={candidate.id} className="p-3"><RecordCell record={candidate.records[row.id]} /></td>
                ))}
              </tr>
            ))}

            <tr className="bg-slate-50">
              <th colSpan={candidates.length + 1} scope="colgroup" className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                In their own words
              </th>
            </tr>
            {showAnswers ? (
              questions.map((question) => (
                <tr key={question.id} className="border-t border-slate-100 align-top">
                  <th scope="row" className="p-3 text-sm font-medium text-slate-700">{question.text}</th>
                  {candidates.map((candidate) => (
                    <td key={candidate.id} className="p-3">
                      <AnswerCell answer={candidate.answers?.[question.id]} voterGuideUrl={candidate.voterGuideUrl} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr className="border-t border-slate-100">
                <td colSpan={candidates.length + 1} className="p-3 text-sm text-slate-600">
                  AI summaries are turned off on this server. Each candidate&apos;s full statement is in their official
                  voters&apos; guide entry above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAnswers && (
        <p className="mt-3 text-xs text-slate-500">
          Fairness check: all {audit.candidatesCompared} candidates were asked the same {questions.length} questions
          {audit.sameQuestionsForEveryCandidate ? '' : ' (incomplete; some answers are missing)'}.{' '}
          {audit.answersWithVerifiedQuotes} summaries matched exact quotes from the candidate&apos;s own statement
          {audit.answersRejected > 0 && <>; {audit.answersRejected} couldn&apos;t be verified and are not shown</>}.
          {' '}Generated {new Date(ai.generatedAt).toLocaleString()} by {ai.model}.
        </p>
      )}
    </div>
  )
}

export default CandidateComparison
