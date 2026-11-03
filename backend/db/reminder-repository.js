import { createHash, createHmac, randomUUID } from 'node:crypto'

function tokenFor(subscriptionId, tokenSecret) {
  return createHmac('sha256', tokenSecret).update(subscriptionId).digest('base64url')
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function mapSubscription(row) {
  return {
    id: row.id,
    electionId: row.election_id,
    electionName: row.election_name,
    status: row.status,
    timezone: row.timezone,
    verifiedAt: row.verified_at,
    unsubscribedAt: row.unsubscribed_at,
    preferences: row.preferences ?? [],
    schedules: row.schedules ?? [],
  }
}

export function createReminderRepository(pool, { tokenSecret }) {
  function requireTokenSecret() {
    if (!tokenSecret || tokenSecret.length < 32) {
      const error = new Error('Reminder unsubscribe tokens are not configured.')
      error.status = 503
      error.code = 'reminders_not_configured'
      throw error
    }
  }

  return {
    async subscribe({ userId, email, electionId, timezone, preferences }) {
      requireTokenSecret()
      const client = await pool.connect()
      try {
        await client.query('begin')
        const existing = await client.query(
          `select id from public.notification_subscriptions
           where user_id = $1 and election_id = $2 for update`,
          [userId, electionId],
        )
        const subscriptionId = existing.rows[0]?.id ?? randomUUID()
        const unsubscribeToken = tokenFor(subscriptionId, tokenSecret)

        const election = await client.query(
          `select id from public.elections
           where id = $1 and status in ('expected', 'confirmed')`,
          [electionId],
        )
        if (election.rowCount === 0) {
          const error = new Error('The election is not available for reminders.')
          error.status = 404
          error.code = 'election_not_found'
          throw error
        }

        await client.query(
          `insert into public.notification_subscriptions
             (id, user_id, election_id, email, status, timezone, verified_at,
              unsubscribe_token_hash, unsubscribed_at)
           values ($1, $2, $3, $4, 'active', $5, now(), $6, null)
           on conflict (user_id, election_id) do update set
             email = excluded.email,
             status = 'active',
             timezone = excluded.timezone,
             verified_at = excluded.verified_at,
             unsubscribe_token_hash = excluded.unsubscribe_token_hash,
             unsubscribed_at = null,
             updated_at = now()`,
          [subscriptionId, userId, electionId, email, timezone, tokenHash(unsubscribeToken)],
        )

        await client.query(
          'delete from public.notification_preferences where subscription_id = $1',
          [subscriptionId],
        )
        for (const preference of preferences) {
          await client.query(
            `insert into public.notification_preferences
               (subscription_id, reminder_kind, offset_days, enabled)
             values ($1, $2, $3, true)`,
            [subscriptionId, preference.kind, preference.offsetDays],
          )
        }

        await client.query(
          `update public.scheduled_reminders
           set status = 'cancelled', updated_at = now()
           where subscription_id = $1 and status in ('pending', 'failed')`,
          [subscriptionId],
        )
        await client.query(
          `insert into public.scheduled_reminders
             (subscription_id, milestone_id, offset_days, milestone_revision,
              scheduled_for, status, idempotency_key, attempt_count, available_after,
              claimed_at, completed_at, last_error)
           select $1, milestone.id, preference.offset_days, milestone.revision,
             coalesce(
               milestone.occurs_at - make_interval(days => preference.offset_days),
               ((milestone.occurs_on - preference.offset_days)
                 + coalesce(milestone.local_time, time '09:00')) at time zone milestone.timezone
             ),
             'pending', gen_random_uuid(), 0, now(), null, null, null
           from public.notification_preferences preference
           join public.election_milestones milestone
             on milestone.election_id = $2
            and milestone.kind = preference.reminder_kind
           where preference.subscription_id = $1
             and preference.enabled
             and coalesce(
               milestone.occurs_at - make_interval(days => preference.offset_days),
               ((milestone.occurs_on - preference.offset_days)
                 + coalesce(milestone.local_time, time '09:00')) at time zone milestone.timezone
             ) > now()
           on conflict (subscription_id, milestone_id, offset_days) do update set
             milestone_revision = excluded.milestone_revision,
             scheduled_for = excluded.scheduled_for,
             status = 'pending',
             idempotency_key = gen_random_uuid(),
             attempt_count = 0,
             available_after = now(),
             claimed_at = null,
             completed_at = null,
             last_error = null,
             updated_at = now()`,
          [subscriptionId, electionId],
        )
        await client.query('commit')
        return { subscriptionId, unsubscribeToken }
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },

    async listForUser(userId) {
      const { rows } = await pool.query(
        `select subscription.*, election.name as election_name,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'kind', preference.reminder_kind,
               'offsetDays', preference.offset_days,
               'enabled', preference.enabled
             ) order by preference.reminder_kind, preference.offset_days)
             from public.notification_preferences preference
             where preference.subscription_id = subscription.id
           ), '[]'::jsonb) as preferences,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', reminder.id,
               'milestoneId', reminder.milestone_id,
               'scheduledFor', reminder.scheduled_for,
               'status', reminder.status,
               'attemptCount', reminder.attempt_count
             ) order by reminder.scheduled_for)
             from public.scheduled_reminders reminder
             where reminder.subscription_id = subscription.id
           ), '[]'::jsonb) as schedules
         from public.notification_subscriptions subscription
         join public.elections election on election.id = subscription.election_id
         where subscription.user_id = $1
         order by election.election_day`,
        [userId],
      )
      return rows.map(mapSubscription)
    },

    async unsubscribeByUser({ userId, subscriptionId }) {
      const { rowCount } = await pool.query(
        `update public.notification_subscriptions
         set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
         where id = $1 and user_id = $2`,
        [subscriptionId, userId],
      )
      if (rowCount === 0) return false
      await pool.query(
        `update public.scheduled_reminders set status = 'cancelled', updated_at = now()
         where subscription_id = $1 and status in ('pending', 'failed')`,
        [subscriptionId],
      )
      return true
    },

    async unsubscribeByToken(token) {
      requireTokenSecret()
      const { rows } = await pool.query(
        `update public.notification_subscriptions
         set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
         where unsubscribe_token_hash = $1 and status <> 'unsubscribed'
         returning id`,
        [tokenHash(token)],
      )
      if (rows.length === 0) return false
      await pool.query(
        `update public.scheduled_reminders set status = 'cancelled', updated_at = now()
         where subscription_id = $1 and status in ('pending', 'failed')`,
        [rows[0].id],
      )
      return true
    },
  }
}
