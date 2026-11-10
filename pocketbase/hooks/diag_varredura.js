/// <reference path="../pb_data/types.d.ts" />
/**
 * VARREDURA DOS CASOS ANUNCIADO ≠ DONO (10/11) — CA-3-116, RN-193.
 *
 * **O caso da Sabrina:** a central disse "Adriana" ao cliente, e o lead ficou
 * com a Elisângela. O card pede a varredura dos casos desde 06/11 e que os
 * divergentes vão para "Precisa de ação" para a gestão decidir.
 *
 * **O que faz:** para cada lead com pedido de transferência, compara o
 * `vendedor_user` do pedido (quem foi anunciado) com o `owner_id` do lead.
 * Se diferem e o lead está em aberto, marca em `precisa_acao` com o motivo.
 *
 * **Só leitura no lead:** não troca dono. Quem decide é a gestão.
 *
 * GET /backend/v1/diag/varredura-anunciado
 */
routerAdd(
  'GET',
  '/backend/v1/diag/varredura-anunciado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, leads_analisados: 0, divergentes: 0, marcados: 0, amostra: [] }

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
    } catch (e0) {}

    // leads em aberto com dono
    var leads = []
    try {
      leads = app.findRecordsByFilter('crm_leads', 'fixture=false', '', 12000, 0)
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 120) })
    }

    const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
    const colPA = app.findCollectionByNameOrId('precisa_acao')

    for (const l of leads) {
      const dono = String(l.get('owner_id') || '')
      if (dono === '') continue
      const st = String(l.get('status') || '')
      if (st === 'descartado' || st === 'venda_realizada' || st === 'finalizado') continue
      out.leads_analisados++

      // quem foi anunciado: o vendedor do ultimo pedido
      var anunciado = ''
      try {
        const trs = app.findRecordsByFilter(colTr, "lead='" + l.id + "'", '', 20, 0)
        for (const t of trs) {
          const v = String(t.get('vendedor_user') || '')
          if (v !== '') anunciado = v
        }
      } catch (e2) {}
      if (anunciado === '' || anunciado === dono) continue

      out.divergentes++
      // marca em Precisa de acao (uma vez por lead)
      try {
        const ja = app.findRecordsByFilter(
          colPA,
          "lead='" + l.id + "' && resolvido=false",
          '',
          1,
          0,
        )
        if (!ja || ja.length === 0) {
          const pa = new Record(colPA)
          pa.set('lead', l.id)
          pa.set('motivo', 'cliente_ouviu_outro_vendedor')
          pa.set('dono_anterior', anunciado)
          pa.set('dono_anterior_nome', nomes[anunciado] || '')
          pa.set('resolvido', false)
          pa.set('fixture', false)
          app.save(pa)
          out.marcados++
        }
      } catch (e3) {}

      if (out.amostra.length < 8) {
        out.amostra.push({
          nome: String(l.get('nome') || '').slice(0, 16),
          anunciado: (nomes[anunciado] || '').slice(0, 14),
          dono: (nomes[dono] || '').slice(0, 14),
          quando: String(l.get('created') || '').slice(0, 10),
        })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
