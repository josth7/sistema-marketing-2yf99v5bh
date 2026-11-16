/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/conv04',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, conversas: [] }
    // conversas da CENTRAL criadas em 04/11
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (!cs.length) return e.json(200, { ok: false })
    const id = cs[0].id
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "conexao='" + id + "' && created>='2026-11-04' && created<='2026-11-05'",
      '',
      100,
      0,
    )
    for (const c of cvs) {
      const lid = String(c.get('lead') || '')
      var dono = '',
        donoNome = '',
        levouDias = null
      if (lid !== '') {
        try {
          const l = app.findRecordById('crm_leads', lid)
          dono = String(l.get('owner_id') || '')
          if (dono !== '')
            try {
              donoNome = String(app.findRecordById('users', dono).get('name') || '')
            } catch (e) {}
          // quando o lead foi atualizado (proxy de quando ganhou dono)
          const upd = String(l.get('updated') || '')
          if (upd !== '')
            levouDias =
              (new Date(upd).getTime() - new Date(String(c.get('created') || '')).getTime()) /
              86400000
        } catch (e1) {}
      }
      out.conversas.push({
        tel: String(c.get('contato_telefone') || '').slice(-6),
        estado: String(c.get('estado') || ''),
        criada: String(c.get('created') || '').slice(0, 16),
        lead: lid.slice(0, 8),
        dono: donoNome || '(sem dono)',
        dias_ate_dono: levouDias !== null ? Math.round(levouDias * 10) / 10 : null,
      })
    }
    out.total = out.conversas.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
