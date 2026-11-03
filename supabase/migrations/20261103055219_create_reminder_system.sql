create schema if not exists private;

create table public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  election_id uuid not null references public.elections(id) on delete cascade,
  email text not null check (email = lower(email) and length(email) between 3 and 320),
  status text not null default 'active' check (status in ('active', 'paused', 'unsubscribed')),
  timezone text not null default 'America/Los_Angeles',
  verified_at timestamptz not null,
  unsubscribe_token_hash text not null unique,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, election_id)
);

create index notification_subscriptions_user_id_idx
  on public.notification_subscriptions(user_id);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.notification_subscriptions(id) on delete cascade,
  reminder_kind text not null,
  offset_days integer not null default 0 check (offset_days between 0 and 30),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, reminder_kind, offset_days)
);

create index notification_preferences_subscription_id_idx
  on public.notification_preferences(subscription_id);

create table public.scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.notification_subscriptions(id) on delete cascade,
  milestone_id uuid not null references public.election_milestones(id) on delete cascade,
  offset_days integer not null check (offset_days between 0 and 30),
  milestone_revision integer not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped')),
  idempotency_key uuid not null default gen_random_uuid() unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_after timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, milestone_id, offset_days)
);

create index scheduled_reminders_due_idx
  on public.scheduled_reminders(scheduled_for, available_after)
  where status in ('pending', 'failed');
create index scheduled_reminders_subscription_id_idx
  on public.scheduled_reminders(subscription_id);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  scheduled_reminder_id uuid not null references public.scheduled_reminders(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  provider text not null default 'resend',
  provider_id text,
  status text not null check (status in ('sent', 'failed')),
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  error_code text,
  error_message text,
  unique (scheduled_reminder_id, attempt)
);

create index notification_deliveries_reminder_id_idx
  on public.notification_deliveries(scheduled_reminder_id);

create or replace function private.refresh_reminders_for_milestone()
returns trigger
set search_path = ''
language plpgsql
security definer
as $$
begin
  update public.scheduled_reminders reminder
  set milestone_revision = new.revision,
      scheduled_for = coalesce(
        new.occurs_at - make_interval(days => reminder.offset_days),
        ((new.occurs_on - reminder.offset_days) + coalesce(new.local_time, time '09:00'))
          at time zone new.timezone
      ),
      status = case
        when coalesce(
          new.occurs_at - make_interval(days => reminder.offset_days),
          ((new.occurs_on - reminder.offset_days) + coalesce(new.local_time, time '09:00'))
            at time zone new.timezone
        ) > now() then 'pending'
        else 'skipped'
      end,
      idempotency_key = gen_random_uuid(),
      attempt_count = 0,
      available_after = now(),
      claimed_at = null,
      completed_at = null,
      last_error = null,
      updated_at = now()
  where reminder.milestone_id = new.id
    and reminder.status in ('pending', 'failed', 'cancelled')
    and exists (
      select 1
      from public.notification_subscriptions subscription
      join public.notification_preferences preference
        on preference.subscription_id = subscription.id
      where subscription.id = reminder.subscription_id
        and subscription.status = 'active'
        and preference.reminder_kind = new.kind
        and preference.offset_days = reminder.offset_days
        and preference.enabled
    )
    and (
      reminder.milestone_revision <> new.revision
      or reminder.scheduled_for is distinct from coalesce(
        new.occurs_at - make_interval(days => reminder.offset_days),
        ((new.occurs_on - reminder.offset_days) + coalesce(new.local_time, time '09:00'))
          at time zone new.timezone
      )
    );
  return new;
end;
$$;

revoke all on function private.refresh_reminders_for_milestone() from public;

create trigger refresh_reminders_after_milestone_change
after update of occurs_on, occurs_at, local_time, timezone, revision
on public.election_milestones
for each row execute function private.refresh_reminders_for_milestone();

alter table public.notification_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.scheduled_reminders enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all on table public.notification_subscriptions, public.notification_preferences,
  public.scheduled_reminders, public.notification_deliveries from anon, authenticated;

grant select on table public.notification_subscriptions, public.notification_preferences,
  public.scheduled_reminders, public.notification_deliveries to authenticated;
grant select, insert, update, delete on table public.notification_subscriptions,
  public.notification_preferences, public.scheduled_reminders,
  public.notification_deliveries to service_role;

create policy "Users can read their reminder subscriptions"
  on public.notification_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their reminder preferences"
  on public.notification_preferences for select
  to authenticated
  using (exists (
    select 1
    from public.notification_subscriptions subscription
    where subscription.id = notification_preferences.subscription_id
      and subscription.user_id = (select auth.uid())
  ));

create policy "Users can read their scheduled reminders"
  on public.scheduled_reminders for select
  to authenticated
  using (exists (
    select 1
    from public.notification_subscriptions subscription
    where subscription.id = scheduled_reminders.subscription_id
      and subscription.user_id = (select auth.uid())
  ));

create policy "Users can read their reminder deliveries"
  on public.notification_deliveries for select
  to authenticated
  using (exists (
    select 1
    from public.scheduled_reminders reminder
    join public.notification_subscriptions subscription
      on subscription.id = reminder.subscription_id
    where reminder.id = notification_deliveries.scheduled_reminder_id
      and subscription.user_id = (select auth.uid())
  ));

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
    where reminder.status in ('pending', 'failed')
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

create or replace function public.complete_reminder_delivery(
  target_reminder_id uuid,
  delivery_status text,
  delivery_provider_id text default null,
  delivery_error_code text default null,
  delivery_error_message text default null
)
returns void
set search_path = ''
language plpgsql
security definer
as $$
declare
  current_attempt integer;
begin
  if delivery_status not in ('sent', 'failed') then
    raise exception 'Invalid delivery status';
  end if;

  select attempt_count into current_attempt
  from public.scheduled_reminders
  where id = target_reminder_id and status = 'processing'
  for update;

  if current_attempt is null then
    raise exception 'Reminder is not currently claimed';
  end if;

  insert into public.notification_deliveries
    (scheduled_reminder_id, attempt, provider_id, status, delivered_at, error_code, error_message)
  values
    (target_reminder_id, current_attempt, delivery_provider_id, delivery_status,
     case when delivery_status = 'sent' then now() else null end,
     delivery_error_code, left(delivery_error_message, 500));

  update public.scheduled_reminders
  set status = case
        when delivery_status = 'sent' then 'sent'
        when attempt_count >= 3 then 'failed'
        else 'failed'
      end,
      available_after = case
        when delivery_status = 'failed' and attempt_count < 3
          then now() + make_interval(mins => power(5, attempt_count)::integer)
        else available_after
      end,
      completed_at = case when delivery_status = 'sent' or attempt_count >= 3 then now() else null end,
      last_error = case when delivery_status = 'failed' then left(delivery_error_message, 500) else null end,
      updated_at = now()
  where id = target_reminder_id;
end;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
revoke all on function public.complete_reminder_delivery(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;
grant execute on function public.complete_reminder_delivery(uuid, text, text, text, text)
  to service_role;
