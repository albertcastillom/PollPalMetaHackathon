function mapElection(row) {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    type: row.type,
    electionDay: row.election_day,
    status: row.status,
    timezone: row.timezone,
    verifiedAt: row.verified_at,
    source: row.source,
    milestones: row.milestones ?? [],
  }
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
      return rows
    },
  }
}
