/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0144 — números liberados no cadastro (CA-3-26, 06/11).
 *
 * **O defeito:** as 4 vendedoras tinham `access_grants.scope_channels` VAZIO.
 * Pelo cadastro elas não veriam número nenhum — só viam porque a tela deduz os
 * números das conversas que já chegaram. Isso funciona por acidente: se a
 * conversa não carregar, o número "desaparece".
 *
 * **O que esta migração faz:** preenche `scope_channels` de cada vendedora com
 * a conexão de WhatsApp dela (a que já está em `whatsapp_conexoes.vendedor_user`).
 * A partir daí a regra vem do cadastro, como a SPEC pede.
 *
 * **Quem já tem escopo `*`** (direção, gestão, marketing) não é tocado: eles
 * veem todos por definição.
 *
 * **Suspenso:** não recebe canal nenhum — quem não tem grant ativo fica sem.
 */
migrate(
  (app) => {
    var atualizados = 0
    var pulados = 0

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

    // conexão de cada vendedor
    const porVendedor = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        30,
        0,
      )) {
        const u = String(c.get('vendedor_user') || '')
        if (u !== '') porVendedor[u] = c.id
      }
    } catch (e0) {
      console.log('0144: falhou listar conexoes -> ' + String(e0).slice(0, 140))
    }

    // grants ativos
    var grants = []
    try {
      grants = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "revoked_at=''",
        '',
        400,
        0,
      )
    } catch (e1) {}

    for (const g of grants) {
      const uid = String(g.get('user_id') || '')
      if (uid === '') continue
      // gestão (escopo '*') fica como está
      const sa = lerL(g.get('scope_accounts'))
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) {
        pulados++
        continue
      }
      const cxId = porVendedor[uid]
      if (!cxId) {
        pulados++
        continue
      }
      const atual = lerL(g.get('scope_channels'))
      if (Array.isArray(atual) && atual.indexOf(cxId) >= 0) continue
      try {
        // acrescenta a conexão do vendedor sem apagar o que já existir
        const novo = Array.isArray(atual) ? atual.slice() : []
        if (novo.indexOf(cxId) < 0) novo.push(cxId)
        g.set('scope_channels', JSON.stringify(novo))
        app.save(g)
        atualizados++
      } catch (e2) {
        console.log('0144: falhou grant ' + uid.slice(0, 8) + ' -> ' + String(e2).slice(0, 120))
      }
    }

    console.log('0144: grants atualizados=' + atualizados + ' pulados=' + pulados)
  },
  (app) => {
    console.log('0144 revertida (escopos permanecem)')
  },
)
