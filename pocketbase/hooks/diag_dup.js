/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (05/11) — por que existem DUAS conversas para o mesmo cliente
 * na mesma conexão?
 *
 * A tela já agrupa, mas o dado continua duplicado: duas conversas paralelas
 * com a mesma pessoa. O webhook busca por `conexao + contato_telefone` antes
 * de criar, então a duplicata só pode vir de:
 *   (a) o telefone chegar em formato diferente em cada mensagem (com/sem 9,
 *       com/sem 55) e a busca não casar;
 *   (b) conversa criada por OUTRO caminho (migração, fixture, robô) sem passar
 *       por essa busca;
 *   (c) corrida: duas mensagens chegando juntas, as duas não acham e as duas
 *       criam.
 *
 * GET /backend/v1/diag/conversas-duplicadas
 */
routerAdd(
  'GET',
  '/backend/v1/diag/conversas-duplicadas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, grupos: 0, total_linhas: 0, exemplos: [], formatos: {} }

    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        4000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 160) })
    }
    out.total_linhas = conversas.length

    // agrupa por conexao + telefone NORMALIZADO (só dígitos, sem 55)
    const mapa = {}
    for (const c of conversas) {
      const bruto = String(c.get('contato_telefone') || '')
      var d = bruto.replace(/\D/g, '')
      // conta os formatos crus para ver se o telefone varia
      out.formatos[bruto.length] = (out.formatos[bruto.length] || 0) + 1
      if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2)
      const chave = String(c.get('conexao') || '') + '|' + d
      if (!mapa[chave]) mapa[chave] = []
      mapa[chave].push(c)
    }

    for (const chave in mapa) {
      const lista = mapa[chave]
      if (lista.length < 2) continue
      out.grupos++
      if (out.exemplos.length >= 12) continue
      const ex = { chave: chave.slice(0, 40), quantas: lista.length, itens: [] }
      for (const c of lista) {
        var msgs = 0
        try {
          const m = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_mensagens'),
            "conexao='" +
              String(c.get('conexao') || '') +
              "' && contato_telefone='" +
              String(c.get('contato_telefone') || '') +
              "'",
            '',
            1000,
            0,
          )
          msgs = m.length
        } catch (e1) {}
        ex.itens.push({
          id: c.id,
          telefone_cru: String(c.get('contato_telefone') || ''),
          nome: String(c.get('contato_nome') || ''),
          estado: String(c.get('estado') || ''),
          total_mensagens: c.get('total_mensagens'),
          mensagens_reais: msgs,
          criado: String(c.get('created') || '').slice(0, 19),
          ultima: String(c.get('ultima_mensagem_em') || '').slice(0, 19),
        })
      }
      out.exemplos.push(ex)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
