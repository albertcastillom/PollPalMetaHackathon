drop index if exists public.scheduled_reminders_due_idx;
create index scheduled_reminders_due_idx
  on public.scheduled_reminders(scheduled_for, available_after)
  where status in ('pending', 'failed', 'processing');

create or replace function public.claim_due_reminders(batch_size integer default 25)
returns table (
  reminder_id uuid,
  idempotency_key uuid,
  attempt integer,
  email text,
  subscription_id uuid,
  election_name text,
  milestone_label text,
  milestone_kind text,
  occurs_on date,
  local_time time,
  timezone text,
  source_url text
)
set search_path = ''
language plpgsql
security definer
as $$
begin
  return query
  with claimed as (
    select reminder.id
    from public.scheduled_reminders reminder
    join public.notification_subscriptions subscription
      on subscription.id = reminder.subscription_id
    where (
        reminder.status in ('pending', 'failed')
        or (reminder.status = 'processing' and reminder.claimed_at < now() - interval '15 minutes')
      )
      and reminder.scheduled_for <= now()
      and reminder.available_after <= now()
      and reminder.attempt_count < 3
      and subscription.status = 'active'
    order by reminder.scheduled_for
    for update of reminder skip locked
    limit greatest(1, least(batch_size, 100))
  ), updated as (
    update public.scheduled_reminders reminder
    set status = 'processing',
        attempt_count = reminder.attempt_count + 1,
        claimed_at = now(),
        updated_at = now()
    from claimed
    where reminder.id = claimed.id
    returning reminder.*
  )
  select updated.id,
         updated.idempotency_key,
         updated.attempt_count,
         subscription.email,
         subscription.id,
         election.name,
         milestone.label,
         milestone.kind,
         milestone.occurs_on,
         milestone.local_time,
         milestone.timezone,
         source.url
  from updated
  join public.notification_subscriptions subscription
    on subscription.id = updated.subscription_id
  join public.election_milestones milestone on milestone.id = updated.milestone_id
  join public.elections election on election.id = milestone.election_id
  join public.sources source on source.id = milestone.source_id;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
