-- User profiles, friends, and election reminder preferences.
-- All tables are user-scoped with row level security. Friend lookups by email go through
-- security-definer functions so one user can never read another user's row directly.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text check (display_name is null or char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));

create table public.reminder_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  address text check (address is null or char_length(address) between 8 and 300),
  normalized_location text,
  updated_at timestamptz not null default now(),
  check (not email_enabled or address is not null)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One friendship per pair, whichever direction it was requested in.
create unique index friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- Create a profile for every new account, and for accounts that already exist.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users where email is not null
on conflict (id) do nothing;

-- Keep the profile email in step when someone changes their login email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email, updated_at = now() where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Row level security
alter table public.profiles enable row level security;
alter table public.reminder_preferences enable row level security;
alter table public.friendships enable row level security;

revoke all on table public.profiles, public.reminder_preferences, public.friendships from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, updated_at) on table public.profiles to authenticated;
grant select, insert, update on table public.reminder_preferences to authenticated;
grant select, delete on table public.friendships to authenticated;
grant update (status, accepted_at) on table public.friendships to authenticated;
grant all on table public.profiles, public.reminder_preferences, public.friendships to service_role;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Users read their own reminder preferences" on public.reminder_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create their own reminder preferences" on public.reminder_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update their own reminder preferences" on public.reminder_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Users read their own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Users remove their own friendships" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Users accept requests sent to them" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Send a friend request by email. If the other person already asked you, this accepts it.
-- Returns 'requested', 'accepted', or 'already_friends'.
create or replace function public.send_friend_request(friend_email text)
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

  select id into friend from public.profiles where lower(email) = lower(trim(friend_email));

  if friend is null then
    raise exception 'No PollPal account uses that email.' using errcode = 'P0002';
  end if;
  if friend = me then
    raise exception 'You can''t add yourself as a friend.' using errcode = '22023';
  end if;

  select * into existing from public.friendships
  where least(requester_id, addressee_id) = least(me, friend)
    and greatest(requester_id, addressee_id) = greatest(me, friend);

  if found then
    if existing.status = 'accepted' then
      return 'already_friends';
    end if;
    if existing.addressee_id = me then
      update public.friendships set status = 'accepted', accepted_at = now() where id = existing.id;
      return 'accepted';
    end if;
    return 'requested';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, friend);
  return 'requested';
end;
$$;

-- Your friends and pending requests, with the other person's email and display name.
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
security definer
set search_path = ''
as $$
  select
    f.id,
    p.id,
    p.email,
    p.display_name,
    f.status,
    case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by f.status, coalesce(p.display_name, p.email);
$$;

revoke all on function public.send_friend_request(text), public.list_friends() from public, anon;
grant execute on function public.send_friend_request(text), public.list_friends() to authenticated;
revoke all on function public.handle_new_user(), public.handle_user_email_change() from public, anon, authenticated;
