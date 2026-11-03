/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0107 — CORRIGE O LOGIN DO DOUGLAS E DA ELISANGELA (03/11).
//
// O QUE DESCOBRI: a 0106 aplicou `setPassword('Haisan@2026')` nos dois e o
// login continuou dando "Failed to authenticate". Então não era (só) o hash.
//
// A DIFERENÇA REAL entre quem entra e quem não entra:
//   Fábio      (0082) → `setPassword`    → ENTRA
//   Adriana    (0088) → `setPassword`    → ENTRA
//   Anezia     (0091) → `setPassword`    → ENTRA
//   Douglas    (0086) → `set('password')` → NÃO entra
//   Elisangela (0087) → `set('password')` → NÃO entra
//
// Como `new Record(users)` + `set('password')` pode ter gravado um registro
// INVÁLIDO (hash ausente), o caminho seguro é o que a 0091 provou: reescrever
// a senha numa instância RECARREGADA do registro, com `setPassword`, e salvar.
// Aqui também marco `emailVisibility`/`verified` por garantia e registro o
// resultado por usuário no log, para não ficar no escuro de novo.
// ===================================================================
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const SENHA = 'Haisan@2026'
    const ALVOS = ['douglasrenato@haisan.com.br', 'elisangela@haisan.com.br']

    for (const email of ALVOS) {
      var achou = []
      try {
        achou = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      } catch (e0) {
        console.log('0107: erro ao buscar ' + email + ': ' + e0)
        continue
      }
      if (!achou || achou.length === 0) {
        console.log('0107: NAO EXISTE: ' + email)
        continue
      }
      const id = achou[0].id
      try {
        // recarrega do banco: instância limpa, como fez a 0091
        const u = app.findRecordById(colU, id)
        u.setPassword(SENHA)
        try {
          u.set('verified', true)
        } catch (eV) {}
        app.save(u)
        console.log('0107: senha reescrita (registro recarregado) para ' + email)
      } catch (e1) {
        console.log('0107: FALHA em ' + email + ': ' + String(e1).slice(0, 200))
      }
    }
    console.log('0107: concluido')
  },
  (app) => {
    // sem rollback: a senha anterior era invalida
  },
)
