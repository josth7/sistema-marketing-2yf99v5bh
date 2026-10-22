/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0057 — grants do CRM (fase 4): read_leads + manage_leads.
 *
 * Adiciona as ações de CRM aos grants EXISTENTES (não cria novos — UNIQUE
 * (user_id, role, version) bloqueia reinsert). Grants reais (fixture=false):
 * dono (direction), Anezia (management), marketing; fixture: aprovador.
 * Dono/Anezia: manage_leads + read_leads. Marketing: read_leads + manage_leads
 * (a equipe comercial opera o CRM — dono decide macro).
 * Aprovador fixture: manage_leads + read_leads (testes).
 *
 * Idempotente: só granta se a ação ainda não existir no grant.
 */

const NOVAS_ACOES = ['read_leads', 'manage_leads']

migrate(
  (app) => {
    const colG = app.findCollectionByNameOrId('access_grants')
    const grants = app.findRecordsByFilter(colG, '', '', 200, 0)
    var tocados = 0
    for (const g of grants) {
      const ehFixture = String(g.get('fixture')) === 'true'
      // só grants ativos (não revogados)
      if (String(g.get('revoked_at') || '') !== '') continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (eP) {
        continue
      }
      if (!Array.isArray(acts)) continue
      const faltantes = NOVAS_ACOES.filter((a) => acts.indexOf(a) < 0)
      if (faltantes.length === 0) continue
      // grants de agência (Movienari) NÃO recebem CRM — deny por padrão
      const papel = String(g.get('role') || '')
      if (papel === 'agency') continue
      const novos = acts.concat(faltantes)
      g.set('actions', novos)
      app.save(g)
      tocados++
      console.log(
        '0057: grant ' +
          g.id +
          ' (' +
          papel +
          (ehFixture ? ' fixture' : '') +
          ') + ' +
          faltantes.join(','),
      )
    }
    console.log('0057: ' + tocados + ' grant(s) atualizados com read_leads/manage_leads')
  },
  (app) => {
    // rollback: remove as ações de CRM de todos os grants
    const colG = app.findCollectionByNameOrId('access_grants')
    const grants = app.findRecordsByFilter(colG, '', '', 200, 0)
    for (const g of grants) {
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (eP) {
        continue
      }
      if (!Array.isArray(acts)) continue
      const filtrados = acts.filter((a) => a !== 'read_leads' && a !== 'manage_leads')
      if (filtrados.length !== acts.length) {
        g.set('actions', filtrados)
        app.save(g)
      }
    }
  },
)
