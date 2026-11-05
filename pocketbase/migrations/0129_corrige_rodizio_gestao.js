/// <reference path="../pb_data/types.d.ts" />
/**
 * CORREÇÃO (05/11) — devolver ao rodízio correto os leads que caíram na
 * gestão por causa do bug do rodízio.
 *
 * **O bug:** o rodízio do ponto único só excluía o usuário `josth`. A gestão
 * (Anezia e outras contas com escopo `*`) tem carga 0 e era sempre a "menor
 * carga" — então lead real caía nela. Como a gestão não tem conexão de
 * WhatsApp de vendedor, o pedido morria em `vendedor_sem_conexao` e o cliente
 * ficava sem atendimento. Corrigido no hook (`whatsapp_transferencias.js`):
 * agora só entra quem tem grant de ler leads/conversas E não tem escopo `*`.
 *
 * **O que esta migração faz:** encontra os leads cujo dono é de GESTÃO (escopo
 * `*`) e que não são de teste, zera o dono e pede a atribuição ao ponto único.
 * Só age em lead com dono de gestão — ninguém que já está com vendedor é
 * tocado.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    // ---------- quem é gestão (escopo '*') e quem é vendedor ----------
    var gestao = {}
    var vendedor = {}
    var grants = []
    try {
      grants = app.findRecordsByFilter(colG, "revoked_at=''", '', 2000, 0)
    } catch (e0) {}
    for (const g of grants) {
      const uid = String(g.get('user_id') || '')
      if (uid === '') continue
      var atos = []
      var escopo = []
      try {
        const rawA = g.get('actions')
        atos =
          Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rawA))
            : typeof rawA === 'string'
              ? JSON.parse(rawA)
              : rawA || []
      } catch (eA) {}
      try {
        const rawE = g.get('scope_accounts')
        escopo =
          Array.isArray(rawE) && rawE.length > 0 && typeof rawE[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rawE))
            : typeof rawE === 'string'
              ? JSON.parse(rawE)
              : rawE || []
      } catch (eE) {}
      if (Array.isArray(escopo) && escopo.indexOf('*') >= 0) gestao[uid] = true
      else if (
        Array.isArray(atos) &&
        (atos.indexOf('read_leads') >= 0 || atos.indexOf('read_conversas') >= 0)
      )
        vendedor[uid] = true
    }

    // nomes para o log
    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(colU, '', '', 300, 0)) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e1) {}

    // ---------- leads com dono de gestão ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(colL, 'fixture=false', '', 8000, 0)
    } catch (e2) {}

    var devolvidos = 0
    var pedidos = 0
    for (const l of leads) {
      const dono = String(l.get('owner_id') || '')
      if (dono === '') continue
      if (!gestao[dono]) continue
      // não mexe em lead que já está com vendedor (não deveria acontecer)
      if (vendedor[dono]) continue

      const nomeAntes = nomes[dono] || dono
      try {
        l.set('owner_id', '')
        l.set('vendedor_nome', '')
        app.save(l)
        devolvidos++
        try {
          const ev = new Record(colEv)
          ev.set('lead_id', l.id)
          ev.set('tipo', 'status')
          ev.set(
            'texto',
            'Devolvido ao rodízio em 05/11: estava com ' +
              nomeAntes +
              ' (gestão), que não atende pelo WhatsApp de vendedor',
          )
          ev.set('fixture', false)
          app.save(ev)
        } catch (e3) {}
      } catch (e4) {
        continue
      }

      // pede ao ponto único
      try {
        const tr = new Record(colTr)
        tr.set('lead', l.id)
        tr.set('origem_pedido', 'ia')
        tr.set('motivo', 'fora_do_roteiro')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'reentrega por correcao do rodizio (05/11)')
        app.save(tr)
        pedidos++
      } catch (e5) {}
    }

    console.log('correcao 05/11: leads devolvidos=' + devolvidos + ' | pedidos=' + pedidos)
  },
  (app) => {
    console.log('correcao 05/11 revertida (atribuicoes permanecem)')
  },
)
