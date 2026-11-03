const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
const secretKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const cronSecret = Deno.env.get('REMINDER_CRON_SECRET') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const fromEmail = Deno.env.get('REMINDER_FROM_EMAIL') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const unsubscribeSecret = Deno.env.get('UNSUBSCRIBE_TOKEN_SECRET') ?? ''
const allowlist = new Set(
  (Deno.env.get('REMINDER_RECIPIENT_ALLOWLIST') ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

type ClaimedReminder = {
  reminder_id: string
  idempotency_key: string
  attempt: number
  email: string
  subscription_id: string
  election_name: string
  milestone_label: string
  milestone_kind: string
  occurs_on: string
  local_time: string | null
  timezone: string
  source_url: string
}

async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function unsubscribeToken(subscriptionId: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(unsubscribeSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(subscriptionId),
  )
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function emailHtml(reminder: ClaimedReminder, unsubscribeUrl: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }
  const escapeHtml = (value: string) => value.replace(
    /[&<>"']/g,
    (character) => replacements[character] ?? character,
  )
  const localTime = reminder.local_time ? ` at ${reminder.local_time.slice(0, 5)}` : ''
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#17231c">
  <h1>${escapeHtml(reminder.election_name)}</h1>
  <p><strong>${escapeHtml(reminder.milestone_label)}</strong></p>
  <p>${escapeHtml(reminder.occurs_on + localTime)} (${escapeHtml(reminder.timezone)})</p>
  <p><a href="${escapeHtml(reminder.source_url)}">Check the official election source</a></p>
  <p><a href="${escapeHtml(appUrl)}">Open PollPal</a></p>
  <hr><p style="font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from this election</a></p>
</body></html>`
}

async function deliver(reminder: ClaimedReminder) {
  if (allowlist.size > 0 && !allowlist.has(reminder.email.toLowerCase())) {
    throw new Error('recipient_not_allowlisted')
  }
  const token = await unsubscribeToken(reminder.subscription_id)
  const unsubscribeUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      'content-type': 'application/json',
      'idempotency-key': reminder.idempotency_key,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [reminder.email],
      subject: `PollPal reminder: ${reminder.milestone_label}`,
      html: emailHtml(reminder, unsubscribeUrl),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
      },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message ?? `Resend returned HTTP ${response.status}`)
  return payload.id as string
}

Deno.serve(async (request) => {
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!supabaseUrl || !secretKey || !resendApiKey || !fromEmail || !appUrl || !unsubscribeSecret) {
    return Response.json({ error: 'worker_not_configured' }, { status: 503 })
  }

  const reminders = await rpc('claim_due_reminders', { batch_size: 25 }) as ClaimedReminder[]
  const results = []
  for (const reminder of reminders) {
    try {
      const providerId = await deliver(reminder)
      await rpc('complete_reminder_delivery', {
        target_reminder_id: reminder.reminder_id,
        delivery_status: 'sent',
        delivery_provider_id: providerId,
      })
      results.push({ id: reminder.reminder_id, status: 'sent' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error'
      await rpc('complete_reminder_delivery', {
        target_reminder_id: reminder.reminder_id,
        delivery_status: 'failed',
        delivery_error_code: message.slice(0, 100),
        delivery_error_message: message,
      })
      results.push({ id: reminder.reminder_id, status: 'failed' })
    }
  }

  return Response.json({ processed: results.length, results })
})
