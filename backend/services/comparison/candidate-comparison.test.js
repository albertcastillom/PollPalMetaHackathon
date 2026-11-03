import assert from 'node:assert/strict'
import test from 'node:test'

import { buildEvidence, createCandidateComparisonService, validateAnswers } from './candidate-comparison.js'

const statementA = 'I am running because our neighborhoods deserve safer streets. My priorities are housing, transit, and better schools for every family.'
const statementB = 'I will cut property taxes and expand small business grants. I have served twelve years on the planning commission.'

const contest = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'State Representative Pos. 1',
  description: 'Legislative: Legislative District 1',
  url: 'https://voter.votewa.gov/',
  metadata: { districtType: 'Legislative' },
  candidates: [
    { id: 'a', name: 'Alex Rivera', party: 'Democratic', profile: { statement: statementA, education: 'State University' } },
    { id: 'b', name: 'Jordan Lee', party: 'Republican', profile: { statement: statementB } },
    { id: 'c', name: 'Sam Patel', party: null, profile: null },
  ],
}

const questions = [{ id: 'priorities', text: 'What does the candidate say their top priorities are?' }]

test('rejects a quote that is not in the candidate\'s own text', () => {
  const evidence = buildEvidence(contest.candidates[0])
  const { answers, flags } = validateAnswers({
    answers: [{ questionId: 'priorities', status: 'answered', summary: 'Says priorities are housing and transit.', quotes: [{ evidenceId: 'E1', text: 'I will abolish all taxes forever' }] }],
  }, { questions, evidence })
  assert.equal(answers[0].status, 'not_verified')
  assert.equal(flags[0].reason, 'no_verified_quote')
})

test('accepts an exact quote even with different whitespace and curly quotes', () => {
  const evidence = [{ id: 'E1', field: 'statement', label: 'Statement', sourceType: 'candidate_statement', text: 'We’ll  build\nmore homes near transit.' }]
  const { answers } = validateAnswers({
    answers: [{ questionId: 'priorities', status: 'answered', summary: 'Says they will build homes near transit.', quotes: [{ evidenceId: 'E1', text: "We'll build more homes near transit." }] }],
  }, { questions, evidence })
  assert.equal(answers[0].status, 'answered')
  assert.equal(answers[0].quotes[0].sourceType, 'candidate_statement')
})

test('rejects evaluative words unless the candidate used them', () => {
  const evidence = buildEvidence(contest.candidates[0])
  const quotes = [{ evidenceId: 'E1', text: 'My priorities are housing, transit, and better schools for every family.' }]
  const allowed = validateAnswers({ answers: [{ questionId: 'priorities', status: 'answered', summary: 'Says priorities include better schools.', quotes }] }, { questions, evidence })
  assert.equal(allowed.answers[0].status, 'answered')

  const judged = validateAnswers({ answers: [{ questionId: 'priorities', status: 'answered', summary: 'Says priorities include housing, an impressive plan.', quotes }] }, { questions, evidence })
  assert.equal(judged.answers[0].status, 'not_verified')
  assert.match(judged.flags[0].reason, /evaluative_language/)
})

test('rejects summaries that are unattributed or mention another candidate', () => {
  const evidence = buildEvidence(contest.candidates[0])
  const quotes = [{ evidenceId: 'E1', text: 'My priorities are housing, transit, and better schools for every family.' }]
  const unattributed = validateAnswers({ answers: [{ questionId: 'priorities', status: 'answered', summary: 'Housing and transit.', quotes }] }, { questions, evidence })
  assert.equal(unattributed.flags[0].reason, 'summary_not_attributed')

  const comparative = validateAnswers({ answers: [{ questionId: 'priorities', status: 'answered', summary: 'Says housing matters, unlike Lee.', quotes }] }, { questions, evidence, otherNames: ['Lee'] })
  assert.equal(comparative.flags[0].reason, 'mentions_other_candidate')
})

test('asks every candidate the same questions with identical, anonymous requests', async () => {
  const requests = []
  const model = {
    model: 'test-model',
    async generateJson(request) {
      requests.push(request)
      const input = JSON.parse(request.input)
      const text = input.evidence[0].text
      return {
        answers: input.questions.map((question) => ({
          questionId: question.questionId,
          status: 'answered',
          summary: 'Says this in their statement.',
          quotes: [{ evidenceId: 'E1', text: text.slice(0, 40) }],
        })),
      }
    },
  }
  const service = createCandidateComparisonService({ repository: { findContestForComparison: async () => contest }, model })
  const result = await service.compareContest(contest.id)

  // Only candidates with a statement are sent to the model, one request each.
  assert.equal(requests.length, 2)
  assert.equal(new Set(requests.map((request) => request.instructions)).size, 1)
  for (const request of requests) {
    assert.doesNotMatch(request.input, /Alex|Rivera|Jordan|Lee|Sam|Patel|Democratic|Republican/)
  }

  assert.deepEqual(result.candidates.map((candidate) => candidate.id), ['a', 'b', 'c'])
  for (const candidate of result.candidates) {
    assert.deepEqual(Object.keys(candidate.answers).sort(), result.questions.map((question) => question.id).sort())
  }
  assert.equal(result.candidates[2].answers.priorities.status, 'no_statement')
  assert.equal(result.audit.sameQuestionsForEveryCandidate, true)
  assert.equal(result.audit.answersRejected, 0)
  assert.equal(result.ai.status, 'ok')
})

test('falls back to official records only when no model is configured', async () => {
  const service = createCandidateComparisonService({ repository: { findContestForComparison: async () => contest }, model: null })
  const result = await service.compareContest(contest.id)
  assert.equal(result.ai.status, 'not_configured')
  assert.equal(result.candidates[0].records.education.text, 'State University')
  assert.equal(result.candidates[0].records.party.sourceType, 'official_filing')
  assert.equal(result.candidates[0].answers, null)
})
