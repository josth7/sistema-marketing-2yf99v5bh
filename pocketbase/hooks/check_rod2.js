/// <reference path="../pb_data/types.d.ts" />
/**
 * ONDE O usuário rodrigo@adapta.org APARECE (17/11).
 *
 * Achado na primeira busca: existe um usuário `rodrigo@adapta.org` criado em
 * 04/11, com `name` VAZIO. Como o código usa `u.get('name') || u.get('email')`
 * para o nome do vendedor, esse e-mail aparece na tela como se fosse o nome —
 * é provavelmente a "transferência que apontou email rodrigo".
 *
 * Aqui se procura em TODAS as coleções onde ele pode estar gravado.
 *
 * GET /backend/v1/check/rodrigo-onde
 */
routerAdd(
  'GET',
  '/backend/v1/check/rodrigo-onde',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const UID = 'huvhy4jruz' // prefixo; o id completo é resolvido abaixo
    const out = { ok: true, userId: '', achados: {}, detalhes: [] }

    // id completo
    var idCompleto = ''
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length > 0) idCompleto = us[0].id
    } catch (e0) {}
    if (idCompleto === '') return e.json(200, { ok: false, erro: 'usuario nao encontrado' })
    out.userId = idCompleto.slice(0, 12)

    // o usuário inteiro
    try {
      const u = app.findRecordById('users', idCompleto)
      out.usuario = {
        nome: String(u.get('name') || '(VAZIO)'),
        email: String(u.get('email') || ''),
        criado: String(u.get('created') || '').slice(0, 16),
        verificado: u.get('verified') === true,
      }
    } catch (e1) {}

    // varredura: campos que apontam para usuário
    const ALVOS = [
      ['crm_leads', ['owner_id']],
      ['whatsapp_conversas', ['lead']],
      ['whatsapp_transferencias', ['vendedor_id', 'criado_por']],
      ['whatsapp_envios', ['autor_user']],
      ['whatsapp_conexoes', ['vendedor_user']],
      ['access_grants', ['user_id']],
      ['carteira_contatos', ['vendedor_user', 'user_id']],
      ['inbox_items', ['user_id']],
      ['precisa_acao', ['user_id', 'para_user']],
      ['access_audit', ['actor', 'alvo']],
    ]

    for (const par of ALVOS) {
      const nome = par[0]
      const campos = par[1]
      var total = 0
      const amostra = []
      try {
        const regs = app.findRecordsByFilter(nome, '', '-created', 3000, 0)
        for (const r of regs) {
          var bate = false
          for (const campo of campos) {
            var v = ''
            try {
              v = String(r.get(campo) || '')
            } catch (eC) {}
            if (v === idCompleto) bate = true
          }
          if (!bate) continue
          total++
          if (amostra.length < 6) {
            const item = { id: r.id.slice(0, 10) }
            for (const campo of [
              'nome',
              'titulo',
              'vendedor_nome',
              'motivo',
              'estado',
              'status',
              'detalhe',
              'texto',
              'telefone',
              'contato_telefone',
              'nome_exibicao',
            ]) {
              var v2 = ''
              try {
                v2 = String(r.get(campo) || '')
              } catch (e2) {}
              if (v2 !== '') item[campo] = v2.slice(0, 60)
            }
            item.criado = String(r.get('created') || '').slice(0, 16)
            amostra.push(item)
          }
        }
      } catch (e3) {}
      if (total > 0) {
        out.achados[nome] = total
        for (const a of amostra) {
          a._colecao = nome
          out.detalhes.push(a)
        }
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
