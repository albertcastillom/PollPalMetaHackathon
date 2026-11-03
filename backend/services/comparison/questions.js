// The fixed questions every candidate in a race is asked. Voters cannot type their own
// questions here, so no candidate can be singled out with a loaded or one-sided prompt.
// Questions are deliberately open ("what does the candidate say") and never ask the model
// to judge, rank, or fact-check.

export const RECORD_ROWS = [
  { id: 'party', label: 'Party preference', field: 'party', sourceType: 'official_filing' },
  { id: 'elected_experience', label: 'Elected or judicial experience', field: 'electedExperience', sourceType: 'candidate_statement' },
  { id: 'professional_experience', label: 'Professional experience', field: 'professionalExperience', sourceType: 'candidate_statement' },
  { id: 'education', label: 'Education', field: 'education', sourceType: 'candidate_statement' },
  { id: 'community_service', label: 'Community service', field: 'communityService', sourceType: 'candidate_statement' },
]

const GENERAL_QUESTIONS = [
  { id: 'why_running', text: 'Why does the candidate say they are running for this office?' },
  { id: 'priorities', text: 'What does the candidate say their top priorities are?' },
  { id: 'proposals', text: 'What specific actions or proposals does the candidate describe?' },
  { id: 'qualifications', text: 'What experience or qualifications does the candidate highlight in their statement?' },
]

// Judicial candidates are bound by conduct rules about stating positions, so they are
// asked about approach rather than policy.
const JUDICIAL_QUESTIONS = [
  { id: 'why_running', text: 'Why does the candidate say they are running for this court?' },
  { id: 'approach', text: 'How does the candidate describe their approach to serving as a judge?' },
  { id: 'qualifications', text: 'What experience or qualifications does the candidate highlight in their statement?' },
]

export function isJudicialContest(contest) {
  const districtType = String(contest.metadata?.districtType ?? '').toLowerCase()
  return districtType === 'judicial' || /\b(court|judge|justice)\b/i.test(contest.title ?? '')
}

export function questionsFor(contest) {
  return isJudicialContest(contest) ? JUDICIAL_QUESTIONS : GENERAL_QUESTIONS
}
