routerAdd(
  'GET',
  '/backend/v1/piloto/crons-todos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cs = $app.findRecordsByFilter('_cron_settings', '', '', 200, 0)
    const out = []
    for (const c of cs)
      out.push({ job: String(c.get('job') || ''), disabled: String(c.get('disabled') || '') })
    return e.json(200, { n: cs.length, jobs: out })
  },
  $apis.requireAuth(),
)
