create table public.voting_locations (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  election_id uuid not null references public.elections(id) on delete cascade,
  jurisdiction_id uuid not null references public.jurisdictions(id) on delete cascade,
  type text not null check (type in ('drop_box', 'voting_center', 'election_office')),
  name text not null,
  address text not null,
  city text,
  postal_code text,
  description text,
  drive_up boolean,
  opens_on date,
  closes_on date not null,
  opens_time time,
  closes_time time not null default '20:00:00',
  timezone text not null default 'America/Los_Angeles',
  geometry extensions.geometry(Point, 4326),
  source_id uuid not null references public.sources(id),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index voting_locations_election_jurisdiction_idx
  on public.voting_locations(election_id, jurisdiction_id);
create index voting_locations_geometry_gix
  on public.voting_locations using gist (geometry);

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  election_id uuid not null references public.elections(id) on delete cascade,
  jurisdiction_id uuid not null references public.jurisdictions(id) on delete cascade,
  type text not null check (type in ('candidate_race', 'measure', 'ballot_resource')),
  title text not null,
  description text,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  source_id uuid not null references public.sources(id),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contests_election_jurisdiction_idx
  on public.contests(election_id, jurisdiction_id);

alter table public.voting_locations enable row level security;
alter table public.contests enable row level security;

revoke all on table public.voting_locations, public.contests from anon, authenticated;
grant select, insert, update, delete on table public.voting_locations, public.contests to service_role;
