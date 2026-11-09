/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (09/11) — a ordem fixa, sem depender de lead.
 *
 * Reproduz a MESMA lógica do rodízio (ordem fixa + próximo depois do último)
 * e mostra a sequência que sairia. Não grava nada: só calcula.
 *
 * GET /backend/v1/diag/prova-ordem-2
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-ordem-2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, ordem_fixa: [], ultimo: '', proximos: [], bate: true }

    const ORDEM_FIXA = [
      'adriana@haisan.com.br',
      'douglasrenato@haisan.com.br',
      'elisangela@haisan.com.br',
      'fabio@haisan.com.br',
    ]

    const nomes = {}
    const emails = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
        emails[u.id] = String(u.get('email') || '').toLowerCase()
      }
    } catch (e0) {}

    // monta a ordem pelos ids reais
    const ordem = []
    for (const em of ORDEM_FIXA) {
      for (const id in emails) {
        if (emails[id] === em) ordem.push({ id: id, nome: nomes[id] })
      }
    }
    out.ordem_fixa = ordem.map(function (x) {
      return x.nome
    })

    // quem recebeu por último
    var ultimoId = ''
    var maiorData = ''
    try {
      for (const t of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "regra='rodizio' && estado='concluida'",
        '',
        400,
        0,
      )) {
        const v = String(t.get('vendedor_user') || '')
        const q = String(t.get('created') || '')
        if (v === '' || q === '') continue
        if (q > maiorData) {
          maiorData = q
          ultimoId = v
        }
      }
    } catch (e1) {}
    out.ultimo = nomes[ultimoId] || '(nenhum pedido anterior)'

    // simula os 6 próximos
    var pos = -1
    if (ultimoId !== '') {
      for (var i = 0; i < ordem.length; i++) {
        if (ordem[i].id === ultimoId) pos = i
      }
    }
    for (var k = 1; k <= 6; k++) {
      const idx = (pos + k) % ordem.length
      out.proximos.push(ordem[idx].nome)
    }

    // confere o ciclo
    const ciclo = out.ordem_fixa
    for (var j = 1; j < out.proximos.length; j++) {
      const ant = ciclo.indexOf(out.proximos[j - 1])
      const at = ciclo.indexOf(out.proximos[j])
      if (at !== (ant + 1) % ciclo.length) out.bate = false
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
