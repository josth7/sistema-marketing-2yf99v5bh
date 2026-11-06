/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO CA-3-26 — números liberados no cadastro (06/11).
 *
 * A regra: quem vê cada número de WhatsApp deve seguir o **cadastro da pessoa**
 * (`access_grants.scope_channels`), não o que aparece nas conversas; e pessoa
 * suspensa não vê nada.
 *
 * Esta rota mostra, sem alterar:
 *   - cada pessoa real, seu escopo de contas e de canais
 *   - quais números ela veria pelo cadastro
 *   - quais ela vê hoje pelas conversas (a diferença é o defeito)
 *   - se há suspenso ainda enxergando algo
 *
 * GET /backend/v1/diag/verifica-canais
 */
routerAdd(
  'GET',
  '/backend/v1/diag/verifica-canais',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, pessoas: [], suspensos_com_acesso: 0, divergencias: 0 }

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

    // conexões ativas
    var cxs = []
    try {
      cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        50,
        0,
      )
    } catch (e0) {}
    const mapaCx = {}
    for (const c of cxs) {
      mapaCx[c.id] = String(c.get('nome_exibicao') || c.get('numero') || '')
    }

    // conversas por conexão (quem vê o quê hoje)
    const convPorCx = {}
    try {
      for (const cv of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        6000,
        0,
      )) {
        const cx = String(cv.get('conexao') || '')
        convPorCx[cx] = (convPorCx[cx] || 0) + 1
      }
    } catch (e1) {}

    var users = []
    try {
      users = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 400, 0)
    } catch (e2) {
      out.ok = false
      out.erro = String(e2).slice(0, 140)
      return e.json(200, out)
    }
    const hoje = new Date().toISOString().slice(0, 10)

    for (const u of users) {
      const email = String(u.get('email') || '')
      const nome = String(u.get('name') || '')
      if (email.toLowerCase().indexOf('fixture') >= 0) continue
      if (nome.toLowerCase().indexOf('fixture') >= 0) continue
      if (email === '') continue

      var canais = []
      var contas = []
      var papeis = []
      var ativo = false
      var temEstrela = false
      try {
        const gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          30,
          0,
        )
        for (const g of gs) {
          const de = String(g.get('valid_from') || '')
          const ate = String(g.get('valid_until') || '')
          if (de !== '' && de.slice(0, 10) > hoje) continue
          if (ate !== '' && ate.slice(0, 10) < hoje) continue
          ativo = true
          const p = String(g.get('role') || '')
          if (p !== '' && papeis.indexOf(p) < 0) papeis.push(p)
          const sc = lerL(g.get('scope_channels'))
          const sa = lerL(g.get('scope_accounts'))
          if (Array.isArray(sc) && sc.indexOf('*') >= 0) temEstrela = true
          if (Array.isArray(sc)) for (const x of sc) if (canais.indexOf(x) < 0) canais.push(x)
          if (Array.isArray(sa)) for (const x of sa) if (contas.indexOf(x) < 0) contas.push(x)
        }
      } catch (e3) {}

      // números que o CADASTRO libera
      var porCadastro = []
      if (temEstrela) {
        for (const id in mapaCx) porCadastro.push(mapaCx[id])
      } else {
        for (const id of canais) if (mapaCx[id]) porCadastro.push(mapaCx[id])
      }

      // números que ela vê HOJE (conexões com conversa)
      var porConversa = []
      for (const id in convPorCx) {
        if (mapaCx[id]) porConversa.push(mapaCx[id])
      }

      const div = ativo && !temEstrela && canais.length === 0 && porConversa.length > 0
      if (div) out.divergencias++

      out.pessoas.push({
        nome: nome.slice(0, 34),
        papeis: papeis.join(', ') || '(sem cargo)',
        ativo: ativo,
        contas: contas.join(',') || '(vazio)',
        canais_cadastro: canais.length + (temEstrela ? ' (todos)' : ''),
        ve_por_cadastro: porCadastro,
        tem_conversa_em: porConversa.length,
        divergente: div,
      })
    }

    // suspenso que ainda tem grant ativo?
    for (const p of out.pessoas) {
      if (!p.ativo && p.tem_conversa_em > 0) out.suspensos_com_acesso++
    }

    out.pessoas.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome))
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
