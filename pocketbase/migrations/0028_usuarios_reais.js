/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0028 — contas REAIS da matriz de acesso (card 5b1de184, passo
 * autorizado pelo dono em 15/10: "não existe o email jean@haisan.com.br —
 * marketing = haisan.ecmm@gmail.com").
 *
 * Cria SOMENTE os usuários (nome + e-mail + senha temporária). NENHUM grant
 * aqui: a SPEC-2-005 manda os grants reais serem criados pelo dono autorizado
 * via rotas /backend/v1/acessos/grants (com audit), fora de migração.
 *
 * - José Dziedzicz Sobrinho (josth7@icloud.com)  → papel direction
 * - Anezia Dziedzic (anezia@haisan.com.br)       → papel management
 * - Marketing (haisan.ecmm@gmail.com)            → papel marketing
 * - Movienari (agência)                          → NENHUMA conta (sem acesso por padrão)
 *
 * Idempotente: usuário que já existe é mantido (senha NÃO é trocada aqui).
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')

    function criaUsuarioReal(email, nome, senha) {
      const existentes = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      if (existentes && existentes.length > 0) {
        console.log('migração 0028: usuário já existe — mantido sem mudança: ' + email)
        return
      }
      const u = new Record(colU)
      u.set('email', email)
      u.set('name', nome)
      u.setPassword(senha)
      u.set('verified', true)
      app.save(u)
      console.log('migração 0028: usuário real criado: ' + email)
    }

    criaUsuarioReal('josth7@icloud.com', 'José Dziedzicz Sobrinho (Direção)', 'O0bOTViSrSKQCA')
    criaUsuarioReal('anezia@haisan.com.br', 'Anezia Dziedzic (Gerência)', 'aTRKSbs0T9aea7')
    criaUsuarioReal('haisan.ecmm@gmail.com', 'Marketing Haisan', 'KgqpTixC4h8YOO')
  },
  (app) => {
    // reversão: remove APENAS usuários reais que esta migração criou e que
    // ainda não têm grant (não apaga quem já está em uso)
    try {
      const colU = app.findCollectionByNameOrId('users')
      const colG = app.findCollectionByNameOrId('access_grants')
      for (const email of ['josth7@icloud.com', 'anezia@haisan.com.br', 'haisan.ecmm@gmail.com']) {
        const us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
        if (us && us.length > 0) {
          const gs = app.findRecordsByFilter(colG, "user_id='" + us[0].id + "'", '', 1, 0)
          if (gs && gs.length > 0) continue
          app.delete(us[0])
        }
      }
    } catch (e) {}
    console.log('migração 0028 revertida')
  },
)
