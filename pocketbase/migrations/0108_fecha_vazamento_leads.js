/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0108 — FECHA O VAZAMENTO DA BASE DE LEADS (03/11).
//
// ACHADO (provado por requisição SEM token):
//   GET /api/collections/crm_leads/records        -> 200, 1.748 registros
//   GET /api/collections/crm_lead_events/records  -> 200, 2.149 registros
//
// Qualquer pessoa na internet, sem login, lê nome, telefone, origem, valor e
// dono de todos os clientes da Haisan. Isso é o card "Impedir que os dados de
// clientes sejam lidos sem login" (SPEC-3-007; CA-3-28) — e não é só um card
// pendente: é um vazamento ativo, hoje.
//
// A CORREÇÃO: as regras de API padrão do PocketBase viravam `viewRule: ''`
// (string vazia = PÚBLICO). Para fechar, a regra precisa ser `null` (ninguém),
// mantendo `listRule`/`viewRule` fechados e o acesso só pelas ROTAS do sistema
// (`/backend/v1/crm/...`), que exigem login e aplicam escopo por permissão.
//
// Não muda nenhuma tela: as telas falam com as rotas, não com a API padrão.
//
// Coleções tratadas: crm_leads, crm_lead_events e crm_conversoes.
// Idempotente: rodar de novo só reforça as mesmas regras.
// ===================================================================
migrate(
  (app) => {
    const FECHAR = ['crm_leads', 'crm_lead_events', 'crm_conversoes']

    for (const nome of FECHAR) {
      var col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (e0) {
        console.log('0108: colecao nao existe: ' + nome)
        continue
      }
      try {
        // string vazia = publico; null = ninguem. O sistema continua lendo
        // pelas rotas /backend/v1 (que tem login e escopo).
        col.listRule = null
        col.viewRule = null
        col.createRule = null
        col.updateRule = null
        col.deleteRule = null
        app.save(col)
        console.log('0108: ' + nome + ' fechada para acesso sem login')
      } catch (e1) {
        console.log('0108: falha ao fechar ' + nome + ': ' + String(e1).slice(0, 160))
      }
    }
    console.log('0108: concluido')
  },
  (app) => {
    // rollback NAO reabre o vazamento de proposito.
    // (Se algum dia for necessario, a regra antiga era viewRule = '' puro.)
    console.log('0108 rollback: mantido fechado (reabrir exporia dados de clientes)')
  },
)
