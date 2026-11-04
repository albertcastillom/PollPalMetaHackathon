import { createHash } from 'node:crypto'

import { questionsFor, RECORD_ROWS } from './questions.js'

// Bump when the instructions, questions, or validation rules change so cached
// comparisons made under older rules are not served.
export const PROMPT_VERSION = 'neutral-compare-v1'

const SUMMARY_MAX = 280
const QUOTE_MIN = 12
const QUOTE_MAX = 300
const MAX_QUOTES = 2

const EVIDENCE_FIELDS = [
  ['statement', "Candidate's statement"],
  ['electedExperience', 'Elected or judicial experience'],
  ['professionalExperience', 'Professional experience'],
  ['education', 'Education'],
  ['communityService', 'Community service'],
]

// Words that judge or advocate. They are allowed in a summary only when the candidate used
// the same word in the cited text (e.g. a candidate who says "better schools").
const EVALUATIVE = /\b(best|better|worse|worst|strongest|weakest|strong|weak|superior|inferior|impressive|excellent|poor|qualified|unqualified|extreme|radical|clearly|obviously|unfortunately|fortunately|should vote|vote for|recommend\w*)\b/gi
const ATTRIBUTION = /^(says|states|writes|describes|lists|highlights|mentions|names|cites|identifies|emphasizes|notes)\b/i

const INSTRUCTIONS = `You summarize what ONE political candidate says about themselves, using ONLY the evidence provided.

Rules:
- Answer every question in the list, in order, using its exact questionId.
- Use only the evidence text. Never use outside knowledge about the candidate, party, office, or issues.
- If the evidence does not address a question, set status to "not_addressed", summary to "", and quotes to [].
- Otherwise set status to "answered". Begin the summary with an attribution verb such as "Says", "States", "Lists", or "Describes", and keep it under ${SUMMARY_MAX} characters.
- Report what the candidate says. Do not judge, praise, criticize, fact-check, or compare. Do not say whether a claim is true.
- Do not use evaluative words such as best, strong, impressive, qualified, extreme, or clearly unless quoting the candidate.
- Never recommend how to vote.
- For each answered question, include 1 or 2 quotes copied EXACTLY, character for character, from a single evidence item, with that item's evidenceId. Quotes must be ${QUOTE_MIN}-${QUOTE_MAX} characters.`

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionId', 'status', 'summary', 'quotes'],
        properties: {
          questionId: { type: 'string' },
          status: { type: 'string', enum: ['answered', 'not_addressed'] },
          summary: { type: 'string' },
          quotes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['evidenceId', 'text'],
              properties: { evidenceId: { type: 'string' }, text: { type: 'string' } },
            },
          },
        },
      },
    },
  },
}

function normalizeForMatch(value) {
  return String(value ?? '')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function buildEvidence(candidate) {
  const profile = candidate.profile ?? {}
  return EVIDENCE_FIELDS
    .filter(([field]) => typeof profile[field] === 'string' && profile[field].trim())
    .map(([field, label], index) => ({
      id: `E${index + 1}`,
      field,
      label,
      sourceType: 'candidate_statement',
      text: profile[field].trim(),
    }))
}

function otherCandidateNames(candidate, allCandidates) {
  // Match on each other candidate's surname, which is how a summary would refer to them.
  return allCandidates
    .filter((other) => other.id !== candidate.id)
    .map((other) => String(other.name).trim().split(/\s+/).pop())
    .filter((name) => name && name.length > 2)
}

// Checks one model answer set against the candidate's own evidence. Anything that cannot be
// verified is downgraded to "not_verified" rather than shown.
export function validateAnswers(raw, { questions, evidence, otherNames = [] }) {
  const byId = new Map((raw?.answers ?? []).map((answer) => [answer?.questionId, answer]))
  const evidenceById = new Map(evidence.map((item) => [item.id, item]))
  const flags = []

  const answers = questions.map((question) => {
    const answer = byId.get(question.id)
    const fail = (reason) => {
      flags.push({ questionId: question.id, reason })
      return { questionId: question.id, status: 'not_verified', summary: null, quotes: [] }
    }

    if (!answer) return fail('missing_answer')
    if (answer.status === 'not_addressed') {
      return { questionId: question.id, status: 'not_addressed', summary: null, quotes: [] }
    }
    if (answer.status !== 'answered') return fail('invalid_status')

    const summary = String(answer.summary ?? '').replace(/\s+/g, ' ').trim()
    if (!summary) return fail('empty_summary')
    if (summary.length > SUMMARY_MAX) return fail('summary_too_long')
    if (!ATTRIBUTION.test(summary)) return fail('summary_not_attributed')

    const quotes = []
    for (const quote of (answer.quotes ?? []).slice(0, MAX_QUOTES)) {
      const item = evidenceById.get(quote?.evidenceId)
      const text = String(quote?.text ?? '').trim()
      if (!item || text.length < QUOTE_MIN || text.length > QUOTE_MAX) continue
      if (!normalizeForMatch(item.text).includes(normalizeForMatch(text))) continue
      quotes.push({ text, evidenceId: item.id, field: item.field, label: item.label, sourceType: item.sourceType })
    }
    if (quotes.length === 0) return fail('no_verified_quote')

    const citedText = normalizeForMatch(quotes.map((quote) => evidenceById.get(quote.evidenceId).text).join(' '))
    const evaluative = [...summary.matchAll(EVALUATIVE)]
      .map((match) => match[0].toLowerCase())
      .filter((word) => !citedText.includes(word))
    if (evaluative.length > 0) return fail(`evaluative_language:${[...new Set(evaluative)].join(',')}`)

    const mentioned = otherNames.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(summary))
    if (mentioned.length > 0) return fail('mentions_other_candidate')

    return { questionId: question.id, status: 'answered', summary, quotes }
  })

  return { answers, flags }
}

function failureCount(result) {
  return result.answers.filter((answer) => answer.status === 'not_verified').length
}

async function answerForCandidate({ model, candidate, allCandidates, questions, evidence }) {
  const noStatement = () => ({
    answers: questions.map((question) => ({ questionId: question.id, status: 'no_statement', summary: null, quotes: [] })),
    flags: [],
  })
  if (evidence.length === 0) return noStatement()

  // The model sees neither the candidate's name nor party, and never sees other candidates.
  const input = JSON.stringify({
    questions: questions.map((question) => ({ questionId: question.id, question: question.text })),
    evidence: evidence.map((item) => ({ evidenceId: item.id, label: item.label, text: item.text })),
  })
  const otherNames = otherCandidateNames(candidate, allCandidates)

  let best = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result
    try {
      const raw = await model.generateJson({ instructions: INSTRUCTIONS, input, schemaName: 'candidate_answers', schema: ANSWER_SCHEMA })
      result = validateAnswers(raw, { questions, evidence, otherNames })
    } catch (error) {
      result = {
        answers: questions.map((question) => ({ questionId: question.id, status: 'not_verified', summary: null, quotes: [] })),
        flags: [{ questionId: null, reason: `model_error:${error.code ?? 'unknown'}` }],
      }
    }
    if (!best || failureCount(result) < failureCount(best)) best = result
    if (failureCount(best) === 0) break
  }
  return best
}

function shuffle(items) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

async function mapWithLimit(items, limit, callback) {
  const results = new Map()
  const queue = [...items]
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      results.set(item, await callback(item))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function recordsFor(candidate) {
  const values = { party: candidate.party, ...(candidate.profile ?? {}) }
  return Object.fromEntries(RECORD_ROWS.map((row) => {
    const text = typeof values[row.field] === 'string' && values[row.field].trim() ? values[row.field].trim() : null
    return [row.id, { text, sourceType: row.sourceType }]
  }))
}

export function createCandidateComparisonService({ repository, model, cacheTtlMs = 6 * 60 * 60 * 1000, now = () => Date.now() }) {
  const cache = new Map()

  return {
    async compareContest(contestId) {
      const contest = await repository.findContestForComparison(contestId)
      if (!contest) return null

      const questions = questionsFor(contest)
      const candidates = contest.candidates
      const evidenceByCandidate = new Map(candidates.map((candidate) => [candidate.id, buildEvidence(candidate)]))

      const cacheKey = createHash('sha256')
        .update(JSON.stringify([PROMPT_VERSION, model?.model ?? null, contest.id, candidates.map((candidate) => [candidate.id, evidenceByCandidate.get(candidate.id)])]))
        .digest('hex')
      const cached = cache.get(cacheKey)
      if (cached && now() - cached.storedAt < cacheTtlMs) return cached.value

      let aiResults = new Map()
      if (model) {
        // Candidates are processed in random order with identical requests so neither
        // ballot position nor processing order can influence the output.
        aiResults = await mapWithLimit(shuffle(candidates), 3, (candidate) => answerForCandidate({
          model, candidate, allCandidates: candidates, questions, evidence: evidenceByCandidate.get(candidate.id),
        }))
      }

      const flags = []
      const rows = candidates.map((candidate) => {
        const result = aiResults.get(candidate)
        for (const flag of result?.flags ?? []) flags.push({ candidateId: candidate.id, ...flag })
        return {
          id: candidate.id,
          name: candidate.name,
          party: candidate.party,
          photoUrl: candidate.profile?.photoUrl ?? null,
          voterGuideUrl: candidate.profile?.voterGuideUrl ?? null,
          hasStatement: evidenceByCandidate.get(candidate.id).length > 0,
          records: recordsFor(candidate),
          answers: result
            ? Object.fromEntries(result.answers.map((answer) => [answer.questionId, answer]))
            : null,
        }
      })

      // Equal-treatment audit: every candidate must have a cell for every question.
      const everyoneAskedEverything = !model || rows.every((row) => questions.every((question) => row.answers?.[question.id]))
      const unverified = rows.reduce((total, row) => (
        total + Object.values(row.answers ?? {}).filter((answer) => answer.status === 'not_verified').length
      ), 0)

      const value = {
        contest: { id: contest.id, title: contest.title, description: contest.description, url: contest.url },
        questions: questions.map(({ id, text }) => ({ id, text })),
        recordRows: RECORD_ROWS.map(({ id, label, sourceType }) => ({ id, label, sourceType })),
        candidates: rows,
        ai: {
          status: !model ? 'not_configured' : unverified === 0 ? 'ok' : 'partial',
          model: model?.model ?? null,
          promptVersion: PROMPT_VERSION,
          generatedAt: new Date(now()).toISOString(),
        },
        audit: {
          sameQuestionsForEveryCandidate: everyoneAskedEverything,
          candidatesCompared: rows.length,
          answersWithVerifiedQuotes: rows.reduce((total, row) => (
            total + Object.values(row.answers ?? {}).filter((answer) => answer.status === 'answered').length
          ), 0),
          answersRejected: unverified,
          flags,
        },
        notices: contest.notices ?? {
          candidateStatement: "Candidate's own words, as submitted to the official Washington voters' guide. The Secretary of State does not verify these statements for truth or accuracy.",
          officialFiling: 'From the official candidate filing with the Washington Secretary of State.',
          aiSummary: 'Short summaries are written by AI (Muse Spark) only from each candidate\'s own voters\' guide text, and each one is checked against the exact quotes shown. They do not rank or recommend anyone.',
        },
      }

      // Do not cache outages, so a temporary model failure is retried on the next request.
      if (!flags.some((flag) => String(flag.reason).startsWith('model_error'))) {
        if (cache.size > 200) cache.delete(cache.keys().next().value)
        cache.set(cacheKey, { storedAt: now(), value })
      }
      return value
    },
  }
}
