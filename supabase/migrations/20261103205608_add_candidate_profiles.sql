create table public.candidate_profiles (
  candidate_id uuid primary key references public.contest_candidates(id) on delete cascade,
  source_id uuid not null references public.sources(id),
  voter_guide_url text not null,
  elected_experience text,
  professional_experience text,
  education text,
  community_service text,
  statement text,
  campaign_website text,
  campaign_finance_url text,
  photo bytea,
  photo_mime_type text check (
    photo_mime_type is null or photo_mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  submitted boolean not null default false,
  attribution text not null default 'Candidate-submitted information from the official Washington voters'' guide.',
  disclaimer text not null default 'Candidate statements are not corrected or verified for truth or fact by the Washington Secretary of State.',
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((photo is null) = (photo_mime_type is null))
);

create index candidate_profiles_source_id_idx on public.candidate_profiles(source_id);

alter table public.candidate_profiles enable row level security;

revoke all on table public.candidate_profiles from anon, authenticated;
grant select, insert, update, delete on table public.candidate_profiles to service_role;
