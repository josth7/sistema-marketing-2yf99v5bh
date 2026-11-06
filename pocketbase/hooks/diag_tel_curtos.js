/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (06/11) — os telefones de 11 dígitos (sem o 55).
 *
 * A coleção tem 531 conversas: 397 com 12 dígitos, 118 com 13 e **16 com 11**.
 * O padrão do sistema é 55 + DDD + número (12 ou 13). Um telefone de 11 dígitos
 * é DDD + número SEM o código do país — e isso quebra:
 *   - a busca do webhook (procura com 55);
 *   - o agrupamento na tela;
 *   - a atribuição de dono.
 *
 * Aqui se listam os 16 para saber de onde vieram.
 *
 * GET /backend/v1/diag/tel-curtos
 */
routerAdd(
  'GET',
  '/backend/v1/diag/tel-curtos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, quantos: 0, itens: [] }

    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        '',
        '',
        12000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }

    const nomesCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || c.get('papel') || '')
      }
    } catch (e1) {}

    for (const c of convs) {
      const tel = String(c.get('contato_telefone') || '')
      if (tel.length !== 11) continue
      out.quantos++
      out.itens.push({
        id: c.id,
        telefone: tel,
        nome: String(c.get('contato_nome') || ''),
        conexao: nomesCx[String(c.get('conexao') || '')] || '(?)',
        estado: String(c.get('estado') || ''),
        msgs: Number(c.get('total_mensagens') || 0),
        fixture: String(c.get('fixture')) === 'true',
        criado: String(c.get('created') || '').slice(0, 16),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
