-- Account profiles, account preferences, and friend relationships.
-- Auth remains the source of truth for credentials and login email. Public tables
-- only contain application data and are protected by row level security.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text check (email is null or (email = lower(email) and char_length(email) between 3 and 320)),
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx
  on public.profiles (lower(email))
  where email is not null;

create table public.account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_subscribed boolean not null default false,
  address text check (address is null or char_length(address) between 8 and 300),
  normalized_location text,
  updated_at timestamptz not null default now(),
  check (not email_subscribed or address is not null)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester_id <> addressee_id),
  check (
    (status = 'pending' and accepted_at is null)
    or (status = 'accepted' and accepted_at is not null)
  )
);

-- A pair can only have one relationship, regardless of who sent the request.
create unique index friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- Auth lifecycle hooks. Keeping these functions private avoids exposing privileged
-- trigger functions through the Data API.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 60)
  )
  on conflict (id) do nothing;

  insert into public.account_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Create profiles for accounts that predate this migration.
insert into public.profiles (id, email, display_name)
select
  id,
  lower(email),
  left(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), 60)
from auth.users
on conflict (id) do nothing;

insert into public.account_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Auth owns the login email; mirror confirmed changes into the application profile.
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(new.email), updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- Row level security and column privileges.
alter table public.profiles enable row level security;
alter table public.account_preferences enable row level security;
alter table public.friendships enable row level security;

revoke all on table public.profiles, public.account_preferences, public.friendships
  from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, updated_at) on table public.profiles to authenticated;
grant select, insert on table public.account_preferences to authenticated;
grant update (email_subscribed, address, normalized_location, updated_at)
  on table public.account_preferences to authenticated;
grant select, delete on table public.friendships to authenticated;
grant all on table public.profiles, public.account_preferences, public.friendships to service_role;

create policy "Users read their own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users read their own account preferences" on public.account_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users create their own account preferences" on public.account_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users update their own account preferences" on public.account_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users read their own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "Users remove their own friendships" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Privileged implementations live outside the exposed schemas. Every function
-- checks auth.uid() before it reads another person's profile or changes a row.
create or replace function private.send_friend_request(friend_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  friend uuid;
  existing public.friendships%rowtype;
begin
  if me is null then
    raise exception 'You need to be logged in.' using errcode = '28000';
  end if;

  select id into friend
  from public.profiles
  where email is not null
    and lower(email) = lower(trim(friend_email));

  if friend is null then
    raise exception 'No PollPal account uses that email.' using errcode = 'P0002';
  end if;
  if friend = me then
    raise exception 'You can''t add yourself as a friend.' using errcode = '22023';
  end if;

  select * into existing
  from public.friendships
  where least(requester_id, addressee_id) = least(me, friend)
    and greatest(requester_id, addressee_id) = greatest(me, friend)
  for update;

  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    end if;
    if existing.addressee_id = me then
      update public.friendships
      set status = 'accepted', accepted_at = now()
      where id = existing.id;
      return 'accepted';
    end if;
    return 'requested';
  end if;

  -- ON CONFLICT also makes simultaneous reciprocal requests safe.
  insert into public.friendships (requester_id, addressee_id)
  values (me, friend)
  on conflict do nothing
  returning * into existing;

  if found then
    return 'requested';
  end if;

  select * into existing
  from public.friendships
  where least(requester_id, addressee_id) = least(me, friend)
    and greatest(requester_id, addressee_id) = greatest(me, friend)
  for update;

  if existing.status = 'accepted' then
    return 'already_friends';
  end if;
  if existing.addressee_id = me then
    update public.friendships
    set status = 'accepted', accepted_at = now()
    where id = existing.id;
    return 'accepted';
  end if;
  return 'requested';
end;
$$;

create or replace function private.accept_friend_request(friendship_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You need to be logged in.' using errcode = '28000';
  end if;

  update public.friendships
  set status = 'accepted', accepted_at = now()
  where id = friendship_id
    and addressee_id = me
    and status = 'pending';

  if not found then
    raise exception 'Friend request not found.' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create or replace function private.list_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  email text,
  display_name text,
  status text,
  direction text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You need to be logged in.' using errcode = '28000';
  end if;

  return query
  select
    f.id,
    p.id,
    p.email,
    p.display_name,
    f.status,
    case when f.requester_id = me then 'outgoing' else 'incoming' end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = me then f.addressee_id else f.requester_id end
  where me in (f.requester_id, f.addressee_id)
  order by f.status, coalesce(p.display_name, p.email);
end;
$$;

-- Thin security-invoker wrappers are the only functions exposed through PostgREST.
create or replace function public.send_friend_request(friend_email text)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.send_friend_request(friend_email);
$$;

create or replace function public.accept_friend_request(friendship_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.accept_friend_request(friendship_id);
$$;

create or replace function public.list_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  email text,
  display_name text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_friends();
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

revoke all on function private.handle_new_user(), private.handle_user_email_change()
  from public, anon, authenticated;
revoke all on function private.send_friend_request(text), private.accept_friend_request(uuid),
  private.list_friends() from public, anon;
grant execute on function private.send_friend_request(text), private.accept_friend_request(uuid),
  private.list_friends() to authenticated;

revoke all on function public.send_friend_request(text), public.accept_friend_request(uuid),
  public.list_friends() from public, anon;
grant execute on function public.send_friend_request(text), public.accept_friend_request(uuid),
  public.list_friends() to authenticated;
