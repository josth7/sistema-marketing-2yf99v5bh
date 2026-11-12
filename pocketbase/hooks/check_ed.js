/// <reference path="../pb_data/types.d.ts" />
/**
 * ENCERRA OS 3 RESÍDUOS DE CONVERSA DUPLICADA (12/11).
 *
 * O cliente falou na central, foi transferido e continua no número do vendedor.
 * Ficam DUAS conversas: a do vendedor (viva) e a da central (histórico).
 *
 * **O problema:** 3 conversas da central ficaram presas em `triagem`, sem
 * ninguém atender (a lista "Esperando" pega a do vendedor e não vê esta).
 *
 * **A correção:** encerra a da CENTRAL quando existe a irmã no número de um
 * vendedor. **Não apaga** — marca `pausada_humano` com motivo e `resolvida_em`.
 * O histórico fica.
 *
 * `?executar=1` aplica.
 *
 * GET /backend/v1/check/encerra-duplicadas
 */
routerAdd(
  'GET',
  '/backend/v1/check/encerra-duplicadas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, casos: [], encerradas: 0 }

    // mapa das conexões
    const papel = {}
    const nomeCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      )) {
        papel[c.id] = String(c.get('papel') || '')
        nomeCx[c.id] = String(c.get('nome_exibicao') || '')
      }
    } catch (e0) {}

    var cvs = []
    try {
      cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem'",
        '',
        3000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 120) })
    }

    for (const cv of cvs) {
      // só a da CENTRAL
      if (papel[String(cv.get('conexao') || '')] !== 'central') continue
      const tel = String(cv.get('contato_telefone') || '')
      if (tel === '') continue

      // existe irmã no número de um vendedor?
      var irma = null
      try {
        const todas = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "'",
          '',
          10,
          0,
        )
        for (const x of todas) {
          if (x.id === cv.id) continue
          if (papel[String(x.get('conexao') || '')] === 'vendedor') {
            irma = x
            break
          }
        }
      } catch (e2) {}
      if (!irma) continue

      const irmaMsgs = Number(irma.get('total_mensagens') || 0)
      const irmaUlt = String(irma.get('ultima_mensagem_em') || '').slice(0, 16)

      out.casos.push({
        tel: tel.slice(-6),
        central_msgs: Number(cv.get('total_mensagens') || 0),
        vendedor_conexao: nomeCx[String(irma.get('conexao') || '')] || '',
        vendedor_msgs: irmaMsgs,
        vendedor_ultima: irmaUlt,
      })

      if (executar) {
        try {
          cv.set('estado', 'pausada_humano')
          cv.set(
            'pausada_motivo',
            'conversa duplicada: o cliente segue no numero do vendedor (' +
              (nomeCx[String(irma.get('conexao') || '')] || '') +
              ')',
          )
          cv.set('pausada_em', new Date().toISOString())
          cv.set('resolvida_em', new Date().toISOString())
          app.save(cv)
          out.encerradas++
        } catch (e3) {}
      }
    }

    out.total = out.casos.length
    out.aviso = executar ? 'aplicado' : 'simulação — chame com ?executar=1 para aplicar'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
