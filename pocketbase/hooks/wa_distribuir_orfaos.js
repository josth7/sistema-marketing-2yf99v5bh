/// <reference path="../pb_data/types.d.ts" />
/**
 * DISTRIBUI OS LEADS ÓRFÃOS (09/11) — com confirmação.
 *
 * **Caio:** 26 leads com pedido de rodízio concluído e `owner_id` vazio. O
 * fluxo antigo não confirmava o save do dono, então metade ficava órfã em
 * silêncio.
 *
 * **Agora:** cria um pedido novo por lead (o hook corrigido confirma o save) e,
 * no fim, **relê cada um** para provar que o dono foi gravado. O que falhar
 * aparece na lista, não some.
 *
 * POST /backend/v1/gestao/distribuir-orfaos?limite=30
 */
routerAdd(
  'POST',
  '/backend/v1/gestao/distribuir-orfaos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)
    var ehGestao = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    if (!ehGestao) return e.json(404, { ok: false, erro: 'não encontrado' })

    const limite = Math.min(Number(e.request.url.query().get('limite') || 40), 100)
    const out = {
      ok: true,
      encontrados: 0,
      pedidos_criados: 0,
      com_dono_confirmado: 0,
      sem_dono: 0,
      por_vendedor: {},
      falhas: [],
    }

    // ---------- os órfãos ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = 'não consegui ler os leads'
      return e.json(200, out)
    }

    const orfaos = []
    for (const l of leads) {
      if (String(l.get('owner_id') || '') !== '') continue
      if (String(l.get('status') || '') === 'descartado') continue
      orfaos.push(l)
      if (orfaos.length >= limite) break
    }
    out.encontrados = orfaos.length

    const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
    for (const l of orfaos) {
      try {
        const tr = new Record(colTr)
        tr.set('lead', l.id)
        // o select `origem_pedido` só aceita 'botao' e 'ia'
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'redistribuicao de orfao 09/11')
        app.save(tr)
        out.pedidos_criados++
      } catch (e2) {
        out.falhas.push({ lead: l.id, erro: 'pedido: ' + String(e2).slice(0, 80) })
      }
    }

    // ---------- CONFIRMA cada um ----------
    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e3) {}

    for (const l of orfaos) {
      var relido = null
      try {
        relido = app.findRecordById('crm_leads', l.id)
      } catch (e4) {}
      const dono = relido ? String(relido.get('owner_id') || '') : ''
      if (dono !== '') {
        out.com_dono_confirmado++
        const n = nomes[dono] || dono
        out.por_vendedor[n] = (out.por_vendedor[n] || 0) + 1
      } else {
        out.sem_dono++
        if (out.falhas.length < 10) out.falhas.push({ lead: l.id, erro: 'segue sem dono' })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
