create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  publisher text not null,
  url text not null,
  category text not null check (category in ('state_calendar', 'county_election', 'boundary', 'location', 'ballot')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  content_hash text not null,
  fetched_at timestamptz not null default now(),
  http_status integer not null,
  content_type text,
  raw_body text not null,
  unique (source_id, content_hash)
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'failed', 'needs_review')),
  records_seen integer not null default 0,
  records_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.jurisdictions (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null,
  type text not null check (type in ('state', 'county', 'city', 'precinct', 'congressional', 'legislative', 'school', 'special_district')),
  state_code text not null default 'WA' check (state_code = 'WA'),
  timezone text not null default 'America/Los_Angeles',
  geometry extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  source_id uuid references public.sources(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jurisdictions_geometry_gix
  on public.jurisdictions using gist (geometry);
create index jurisdictions_type_idx on public.jurisdictions(type);

create table public.elections (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null,
  type text not null check (type in ('special', 'primary', 'general', 'presidential_primary', 'other')),
  election_day date not null,
  status text not null default 'confirmed' check (status in ('expected', 'confirmed', 'complete', 'cancelled')),
  timezone text not null default 'America/Los_Angeles',
  source_id uuid not null references public.sources(id),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index elections_day_idx on public.elections(election_day);

create table public.election_jurisdictions (
  election_id uuid not null references public.elections(id) on delete cascade,
  jurisdiction_id uuid not null references public.jurisdictions(id) on delete cascade,
  applicability text not null default 'all' check (applicability in ('all', 'partial', 'unknown')),
  primary key (election_id, jurisdiction_id)
);

create table public.election_milestones (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  kind text not null,
  label text not null,
  occurs_on date not null,
  occurs_at timestamptz,
  local_time time,
  date_precision text not null default 'date' check (date_precision in ('date', 'time')),
  timezone text not null default 'America/Los_Angeles',
  certainty text not null default 'official' check (certainty in ('official', 'expected', 'estimated')),
  source_id uuid not null references public.sources(id),
  source_excerpt text not null,
  revision integer not null default 1,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (election_id, kind, occurs_on)
);

create index election_milestones_election_idx
  on public.election_milestones(election_id, occurs_on);

create table public.coverage (
  id uuid primary key default gen_random_uuid(),
  jurisdiction_id uuid not null references public.jurisdictions(id) on delete cascade,
  component text not null check (component in ('calendar', 'deadlines', 'locations', 'contests', 'precinct_matching')),
  status text not null check (status in ('complete', 'partial', 'pending', 'unavailable', 'stale')),
  notes text,
  verified_at timestamptz,
  unique (jurisdiction_id, component)
);

alter table public.sources enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.elections enable row level security;
alter table public.election_jurisdictions enable row level security;
alter table public.election_milestones enable row level security;
alter table public.coverage enable row level security;

revoke all on table public.sources, public.source_snapshots, public.ingestion_runs,
  public.jurisdictions, public.elections, public.election_jurisdictions,
  public.election_milestones, public.coverage from anon, authenticated;

grant select, insert, update, delete on table public.sources, public.source_snapshots,
  public.ingestion_runs, public.jurisdictions, public.elections,
  public.election_jurisdictions, public.election_milestones, public.coverage to service_role;

create or replace function public.resolve_wa_jurisdictions(
  latitude double precision,
  longitude double precision
)
returns table (
  id uuid,
  external_id text,
  name text,
  type text,
  metadata jsonb,
  verified_at timestamptz
)
set search_path = ''
language sql
stable
security invoker
as $$
  select j.id, j.external_id, j.name, j.type, j.metadata, j.verified_at
  from public.jurisdictions j
  where j.type = 'state'
     or (
       j.geometry is not null
       and extensions.st_covers(
         j.geometry,
         extensions.st_setsrid(extensions.st_point(longitude, latitude), 4326)
       )
     )
  order by case j.type
    when 'state' then 1
    when 'county' then 2
    when 'city' then 3
    when 'congressional' then 4
    when 'legislative' then 5
    when 'precinct' then 6
    else 7
  end;
$$;

revoke all on function public.resolve_wa_jurisdictions(double precision, double precision) from public, anon, authenticated;
grant execute on function public.resolve_wa_jurisdictions(double precision, double precision) to service_role;
