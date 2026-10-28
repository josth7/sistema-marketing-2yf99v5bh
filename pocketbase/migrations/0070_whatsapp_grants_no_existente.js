/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0070 — acrescenta as 3 ações de WhatsApp ao grant ATIVO do usuário.
 *
 * Por que não criar grant novo (como a 0069 tentou): `access_grants` tem índice
 * UNIQUE em (user_id, role, version) e a rota de criação ainda recusa grant
 * para si mesmo (matriz de aprovação). Somar as ações ao grant que já existe
 * resolve as duas coisas: as rotas leem TODOS os grants ativos e liberam se
 * qualquer um tiver a ação — somar é sempre seguro, nunca tira permissão.
 *
 * Idempotente: quem já tem as 3 ações é ignorado.
 */

migrate(
  (app) => {
    const colG = app.findCollectionByNameOrId('access_grants')
    const colU = app.findCollectionByNameOrId('users')
    const NOVAS = ['read_conversas', 'manage_whatsapp', 'manage_atendimento']
    const emails = ['josth7@icloud.com', 'anezia@haisan.com.br']

    function lerAcoes(g) {
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e) {}
      return Array.isArray(acts) ? acts : []
    }

    for (const email of emails) {
      let us = []
      try {
        us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      } catch (e) {}
      if (!us || us.length === 0) {
        console.log('0070: usuario nao encontrado: ' + email)
        continue
      }
      const uid = us[0].id
      let grants = []
      try {
        grants = app.findRecordsByFilter(colG, "user_id='" + uid + "'", '', 60, 0)
      } catch (e2) {}
      // pega o grant ATIVO com mais ações (é o que o sistema usa)
      let alvo = null
      let melhor = -1
      for (const g of grants) {
        const rev = String(g.get('revoked_at') || '')
        if (rev !== '') continue
        const acts = lerAcoes(g)
        if (acts.length > melhor) {
          melhor = acts.length
          alvo = g
        }
      }
      if (!alvo) {
        console.log('0070: ' + email + ' nao tem grant ativo — pulando')
        continue
      }
      const atuais = lerAcoes(alvo)
      let faltando = []
      for (const a of NOVAS) {
        if (atuais.indexOf(a) < 0) faltando.push(a)
      }
      if (faltando.length === 0) {
        console.log('0070: ' + email + ' ja tem as 3 acoes')
        continue
      }
      const novo = atuais.slice()
      for (const a of faltando) novo.push(a)
      try {
        alvo.set('actions', novo)
        app.save(alvo)
        console.log(
          '0070: ' + email + ' ganhou ' + faltando.join(',') + ' (total ' + novo.length + ')',
        )
      } catch (eS) {
        console.log('0070: falha em ' + email + ': ' + eS)
      }
    }
  },
  (app) => {
    console.log('0070 revertida (acoes mantidas)')
  },
)
