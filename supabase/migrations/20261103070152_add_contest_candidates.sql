create table public.contest_candidates (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  contest_id uuid not null references public.contests(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  party text check (party is null or length(party) between 1 and 100),
  ballot_order integer check (ballot_order is null or ballot_order > 0),
  filing_status text not null default 'active'
    check (filing_status in ('active', 'withdrawn', 'other')),
  profile_url text,
  metadata jsonb not null default '{}'::jsonb,
  source_id uuid not null references public.sources(id),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contest_id, name)
);

create index contest_candidates_contest_id_ballot_order_idx
  on public.contest_candidates(contest_id, ballot_order, name);
create index contest_candidates_source_id_idx
  on public.contest_candidates(source_id);

alter table public.contest_candidates enable row level security;

revoke all on table public.contest_candidates from anon, authenticated;
grant select, insert, update, delete on table public.contest_candidates to service_role;
