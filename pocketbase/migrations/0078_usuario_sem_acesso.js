/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0078 — usuário de teste SEM acesso, para a prova 2e (CA-3-24).
 *
 * A prova 2e exige um usuário autenticado que NÃO esteja em
 * `whatsapp_sinais.leitores`: ele assina a coleção, mas não deve receber
 * nenhum evento. Sem esse usuário, todo autenticado do projeto tem
 * `read_conversas` com escopo "todos" e entra em `leitores`, então receber o
 * evento é o comportamento CORRETO — não prova nada.
 *
 * Este usuário entra de propósito SEM grant nenhum.
 */

migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    var existe = []
    try {
      existe = app.findRecordsByFilter(colU, "email='semacesso.fixture@haisan.com.br'", '', 1, 0)
    } catch (e0) {}
    if (existe && existe.length > 0) {
      console.log('0078: usuário sem acesso já existe')
      return
    }
    const u = new Record(colU)
    u.set('email', 'semacesso.fixture@haisan.com.br')
    u.set('password', 'Fixture@2026')
    u.set('passwordConfirm', 'Fixture@2026')
    u.set('name', 'Sem Acesso FIXTURE (prova 2e)')
    u.set('verified', true)
    try {
      app.save(u)
      console.log('0078: usuário sem acesso criado (SEM grant de propósito)')
    } catch (e1) {
      console.log('0078: falhou -> ' + String(e1).slice(0, 160))
    }
  },
  (app) => {
    try {
      const colU = app.findCollectionByNameOrId('users')
      const r = app.findRecordsByFilter(colU, "email='semacesso.fixture@haisan.com.br'", '', 1, 0)
      if (r && r.length > 0) app.delete(r[0])
    } catch (e) {}
    console.log('0078 revertida')
  },
)
