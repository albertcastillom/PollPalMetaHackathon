// Minimal client for Meta's Model API (Responses API) running Muse Spark.
// The base URL and model come from the environment so they can be corrected without code
// changes if Meta's published values differ from these defaults.

export const DEFAULT_MUSE_BASE_URL = 'https://api.meta.ai/v1'
export const DEFAULT_MUSE_MODEL = 'muse-spark-1.3'

function outputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text
  const parts = []
  for (const item of body?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === 'string') parts.push(content.text)
    }
  }
  if (parts.length > 0) return parts.join('')
  // Chat Completions-shaped fallback.
  return body?.choices?.[0]?.message?.content ?? ''
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Model response did not contain JSON.')
    return JSON.parse(match[0])
  }
}

export function createMuseClient({
  apiKey,
  baseUrl = DEFAULT_MUSE_BASE_URL,
  model = DEFAULT_MUSE_MODEL,
  fetchImpl = fetch,
  timeoutMs = 45_000,
}) {
  if (!apiKey) return null

  return {
    model,

    // Sends one structured request and returns the parsed JSON object.
    // `reasoningEffort` ('minimal' | 'low' | 'medium' | 'high' | ...) trades thinking time for
    // speed. Muse Spark reasons before answering by default, which is most of the wait for
    // simple jobs like translation.
    async generateJson({ instructions, input, schemaName, schema, reasoningEffort }) {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          instructions,
          input,
          temperature: 0,
          text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
          ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw Object.assign(new Error(`Muse Spark request failed with HTTP ${response.status}: ${detail.slice(0, 200)}`), {
          code: 'model_unavailable',
        })
      }
      return parseJson(outputText(await response.json()))
    },
  }
}
