/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0102 — campos de ATRIBUIÇÃO DE ANÚNCIO (03/11).
//
// O webhook ignorava o `referral` que a Meta manda quando o cliente clica num
// anúncio (Click-to-WhatsApp). Sem isso:
//   - não se sabe QUAL anúncio trouxe o cliente (perde-se a atribuição);
//   - o gatilho por texto nunca casa, e o lead fica sem resposta.
//
// Campos na CONVERSA (chegam com a mensagem):
//   anuncio_id     → source_id do referral (ID do anúncio na Meta)
//   anuncio_tipo   → source_type (ad / post)
//   anuncio_url    → source_url (link do anúncio, diz se é Facebook/Instagram)
//   anuncio_titulo → headline
//   anuncio_corpo  → body
//   anuncio_ctwa   → ctwa_clid (identificador do clique)
//   anuncio_bruto  → recorte sanitizado do referral (diagnóstico, p/ descobrir
//                    o nome real dos campos que a D-API repassa)
//
// Campos no LEAD (consolidam a atribuição):
//   anuncio_id, anuncio_fonte
//
// Idempotente: se a coluna já existir, ignora.
// ===================================================================
migrate(
  (app) => {
    const acrescentar = (nomeColecao, campos) => {
      var col = null
      try {
        col = app.findCollectionByNameOrId(nomeColecao)
      } catch (e0) {
        console.log('0102: colecao ' + nomeColecao + ' nao existe — pulando')
        return
      }
      for (const c of campos) {
        var existe = false
        try {
          existe = col.fields.getByName(c.name) !== null
        } catch (e1) {
          existe = false
        }
        if (existe) continue
        col.fields.add(new Field(c))
      }
      try {
        app.save(col)
        console.log(
          '0102: ' + nomeColecao + ' atualizada (' + campos.length + ' campo(s) avaliado(s))',
        )
      } catch (e2) {
        console.log('0102: erro ao salvar ' + nomeColecao + ': ' + e2)
      }
    }

    acrescentar('whatsapp_conversas', [
      { name: 'anuncio_id', type: 'text', max: 120 },
      { name: 'anuncio_tipo', type: 'text', max: 60 },
      { name: 'anuncio_url', type: 'text', max: 500 },
      { name: 'anuncio_titulo', type: 'text', max: 300 },
      { name: 'anuncio_corpo', type: 'text', max: 1000 },
      { name: 'anuncio_ctwa', type: 'text', max: 300 },
      { name: 'anuncio_bruto', type: 'text', max: 2000 },
    ])

    acrescentar('crm_leads', [
      { name: 'anuncio_id', type: 'text', max: 120 },
      { name: 'anuncio_fonte', type: 'text', max: 60 },
    ])
  },
  (app) => {
    const remover = (nomeColecao, nomes) => {
      var col = null
      try {
        col = app.findCollectionByNameOrId(nomeColecao)
      } catch (e0) {
        return
      }
      for (const n of nomes) {
        try {
          const f = col.fields.getByName(n)
          if (!f) continue
          col.fields.removeById(f.id)
        } catch (e1) {}
      }
      try {
        app.save(col)
      } catch (e2) {}
    }
    remover('whatsapp_conversas', [
      'anuncio_id',
      'anuncio_tipo',
      'anuncio_url',
      'anuncio_titulo',
      'anuncio_corpo',
      'anuncio_ctwa',
      'anuncio_bruto',
    ])
    remover('crm_leads', ['anuncio_id', 'anuncio_fonte'])
  },
)
