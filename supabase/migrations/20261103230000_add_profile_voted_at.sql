-- "I Voted" badge: a person can mark on their profile that they voted.
-- Null means they haven't marked it; a timestamp records when they did.

alter table public.profiles
  add column voted_at timestamptz;

-- Users may set or clear only this column on their own row. The existing
-- "Users update their own profile" policy already limits updates to id = auth.uid().
grant update (voted_at) on table public.profiles to authenticated;
