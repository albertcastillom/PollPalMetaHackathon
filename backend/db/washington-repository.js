function mapElection(row) {
  const electionDay = row.election_day instanceof Date
    ? row.election_day.toISOString().slice(0, 10)
    : String(row.election_day).slice(0, 10)
  const milestones = (row.milestones ?? []).sort((left, right) => (
    left.occursOn.localeCompare(right.occursOn) || left.kind.localeCompare(right.kind)
  ))

  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    type: row.type,
    electionDay,
    status: row.status,
    timezone: row.timezone,
    verifiedAt: row.verified_at,
    source: row.source,
    milestones,
  }
}

function dateOnly(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export function createWashingtonRepository(pool) {
  return {
    async resolveJurisdictions({ latitude, longitude }) {
      const { rows } = await pool.query(
        'select * from public.resolve_wa_jurisdictions($1, $2)',
        [latitude, longitude],
      )

      const precinct = rows.find((row) => row.type === 'precinct')
      if (!precinct) return rows

      const derivedIds = [
        precinct.metadata?.countyExternalId,
        precinct.metadata?.legislativeExternalId,
        precinct.metadata?.congressionalExternalId,
      ].filter(Boolean)

      if (derivedIds.length === 0) return rows

      const derived = await pool.query(
        'select id, external_id, name, type, metadata, verified_at from public.jurisdictions where external_id = any($1)',
        [derivedIds],
      )

      const seen = new Set(rows.map((row) => row.id))
      return [...rows, ...derived.rows.filter((row) => !seen.has(row.id))]
    },

    async findUpcomingElections(jurisdictionIds) {
      if (jurisdictionIds.length === 0) return []

      const { rows } = await pool.query(
        `select
           e.*,
           jsonb_build_object(
             'publisher', s.publisher,
             'url', s.url
           ) as source,
           coalesce(
             jsonb_agg(
               distinct jsonb_build_object(
                 'id', m.id,
                 'kind', m.kind,
                 'label', m.label,
                 'occursOn', m.occurs_on,
                 'occursAt', m.occurs_at,
                 'localTime', m.local_time,
                 'datePrecision', m.date_precision,
                 'timezone', m.timezone,
                 'certainty', m.certainty,
                 'sourceExcerpt', m.source_excerpt,
                 'verifiedAt', m.verified_at
               )
             ) filter (where m.id is not null),
             '[]'::jsonb
           ) as milestones
         from public.elections e
         join public.sources s on s.id = e.source_id
         join public.election_jurisdictions ej on ej.election_id = e.id
         left join public.election_milestones m on m.election_id = e.id
         where ej.jurisdiction_id = any($1)
           and e.election_day >= current_date
           and e.status in ('expected', 'confirmed')
         group by e.id, s.id
         order by e.election_day`,
        [jurisdictionIds],
      )

      return rows.map(mapElection)
    },

    async findVotingLocations(electionIds, jurisdictionIds) {
      if (electionIds.length === 0 || jurisdictionIds.length === 0) return []
      const { rows } = await pool.query(
        `select
           l.*,
           case when l.geometry is null then null else extensions.st_y(l.geometry) end as latitude,
           case when l.geometry is null then null else extensions.st_x(l.geometry) end as longitude,
           jsonb_build_object('publisher', s.publisher, 'url', s.url) as source
         from public.voting_locations l
         join public.sources s on s.id = l.source_id
         where l.election_id = any($1)
           and l.jurisdiction_id = any($2)
         order by l.city nulls last, l.name`,
        [electionIds, jurisdictionIds],
      )
      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        electionId: row.election_id,
        type: row.type,
        name: row.name,
        address: row.address,
        city: row.city,
        postalCode: row.postal_code,
        description: row.description,
        driveUp: row.drive_up,
        opensOn: dateOnly(row.opens_on),
        closesOn: dateOnly(row.closes_on),
        opensTime: row.opens_time,
        closesTime: row.closes_time,
        timezone: row.timezone,
        coordinates: row.latitude == null || row.longitude == null
          ? null
          : { latitude: Number(row.latitude), longitude: Number(row.longitude) },
        source: row.source,
        verifiedAt: row.verified_at,
      }))
    },

    async findContests(electionIds, jurisdictionIds) {
      if (electionIds.length === 0 || jurisdictionIds.length === 0) return []
      const { rows } = await pool.query(
        `select c.*, jsonb_build_object('publisher', s.publisher, 'url', s.url) as source,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', candidate.id,
               'externalId', candidate.external_id,
               'name', candidate.name,
               'party', candidate.party,
               'ballotOrder', candidate.ballot_order,
               'filingStatus', candidate.filing_status,
               'profileUrl', candidate.profile_url,
               'verifiedAt', candidate.verified_at
             ) order by candidate.ballot_order nulls last, candidate.name)
             from public.contest_candidates candidate
             where candidate.contest_id = c.id
               and candidate.filing_status = 'active'
           ), '[]'::jsonb) as candidates
         from public.contests c
         join public.sources s on s.id = c.source_id
         where c.election_id = any($1)
           and c.jurisdiction_id = any($2)
         order by c.type, c.title`,
        [electionIds, jurisdictionIds],
      )
      return rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        electionId: row.election_id,
        type: row.type,
        title: row.title,
        description: row.description,
        url: row.url,
        metadata: row.metadata,
        candidates: row.candidates,
        source: row.source,
        verifiedAt: row.verified_at,
      }))
    },

    async getCoverage(jurisdictionIds) {
      if (jurisdictionIds.length === 0) return []
      const { rows } = await pool.query(
        `select c.component, c.status, c.notes, c.verified_at, j.external_id as jurisdiction_external_id
         from public.coverage c
         join public.jurisdictions j on j.id = c.jurisdiction_id
         where c.jurisdiction_id = any($1)
         order by j.type, c.component`,
        [jurisdictionIds],
      )
      return rows.map((row) => ({
        component: row.component,
        status: row.status,
        notes: row.notes,
        verifiedAt: row.verified_at,
        jurisdictionId: row.jurisdiction_external_id,
      }))
    },
  }
}
