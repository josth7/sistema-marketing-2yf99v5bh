/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0091 — senha da Anezia em padrão do time (30/10).
 *
 * **Descoberta ao tentar o passo 2.** A conta da Anezia NÃO foi criada pela 0090:
 * ela já existia desde 15/10, criada pela migração 0028 (matriz de acesso real)
 * com uma senha aleatória de 14 caracteres. O grant dela está certo desde então
 * (17 ações, escopo `*`), mas ninguém sabia a senha — a 0028 nunca a registrou
 * legível, e a 0090 viu "usuário já existia" e não tocou na senha.
 *
 * Resultado prático: ela tinha acesso no papel e não conseguia entrar.
 *
 * Aqui a senha passa para a mesma provisória dos vendedores (`Haisan@2026`),
 * definida com `setPassword` — `set('password', ...)` num registro EXISTENTE
 * não define a senha (é o método do PocketBase que faz o hash). Foi exatamente
 * esse o erro da 0090 com usuário novo; aqui uso o certo.
 *
 * O nome fica como está ("Anezia Dziedzic (Gerência)").
 *
 * Idempotente: rodar de novo só regrava a mesma senha.
 */

migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const EMAIL = 'anezia@haisan.com.br'
    const SENHA = 'Haisan@2026'

    var achou = []
    try {
      achou = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
    } catch (e0) {
      console.log('0091: busca falhou -> ' + String(e0).slice(0, 150))
      return
    }
    if (!achou || achou.length === 0) {
      console.log('0091: usuária não existe — nada a fazer')
      return
    }

    const u = achou[0]
    try {
      u.setPassword(SENHA)
      app.save(u)
      console.log('0091: senha da Anezia padronizada (' + u.id + ')')
    } catch (e1) {
      console.log('0091: falhou setPassword -> ' + String(e1).slice(0, 200))
      return
    }

    // garante verified (sem isso o PocketBase pode recusar o login)
    try {
      if (!u.get('verified')) {
        u.set('verified', true)
        app.save(u)
        console.log('0091: conta marcada como verificada')
      }
    } catch (e2) {}

    console.log('0091: Anezia pode entrar com ' + EMAIL)
  },
  (app) => {
    console.log('0091 revertida (senha anterior não é recuperável)')
  },
)
