/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// DIAGNÓSTICO DE USUÁRIOS (03/11).
//
// Por que existe: descobri que o Douglas e a Elisangela NÃO conseguem entrar
// no sistema ("Failed to authenticate"), enquanto Fábio e Adriana entram. A
// migração 0106 aplicou `setPassword` e o login continuou falhando — então a
// causa é outra, e eu preciso VER o registro em vez de adivinhar.
//
// Rota só de leitura, autenticada. NÃO devolve hash de senha.
// ===================================================================
routerAdd(
  'GET',
  '/backend/v1/diag-usuarios',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const colU = $app.findCollectionByNameOrId('users')
    var us = []
    try {
      us = $app.findRecordsByFilter(colU, '', '', 200, 0)
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0) })
    }

    const itens = []
    for (const u of us) {
      var email = ''
      var nome = ''
      var verificado = false
      var campos = []
      try {
        email = String(u.get('email') || '')
      } catch (eE) {}
      try {
        nome = String(u.get('name') || '')
      } catch (eN) {}
      try {
        verificado = u.get('verified') === true
      } catch (eV) {}
      // quais campos o registro REALMENTE tem (para descobrir o que faltou)
      try {
        campos = Object.keys(u.collection().fields.columnMap || {})
      } catch (eC) {}
      // o campo de senha existe e esta preenchido?
      var temSenha = false
      try {
        const h = u.get('passwordHash')
        temSenha = h !== undefined && h !== null && String(h) !== ''
      } catch (eH) {
        // se passwordHash nao e exposto, tenta o campo 'password'
        try {
          const p = u.get('password')
          temSenha = p !== undefined && p !== null && String(p) !== ''
        } catch (eP) {}
      }
      itens.push({
        id: u.id,
        email: email,
        nome: nome,
        verificado: verificado,
        tem_senha: temSenha,
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
