/// <reference path="../pb_data/types.d.ts" />
/**
 * 0130 — DEFINE a senha da conta haisan.ecmm@gmail.com (18/11).
 *
 * A conta existia com 3 grants e escopo *, mas o dono não consegue entrar
 * ("não aparece as informações"). Pode ser senha esquecida.
 *
 * A senha NÃO fica no arquivo: é lida do segredo `SENHA_ADM_ECMM`. Sem o
 * segredo, a migração não faz nada — assim nenhuma senha vai para o repositório
 * (lição de 12/11).
 */
migrate(
  (app) => {
    var senha = ''
    try {
      senha = String($secrets.get('SENHA_ADM_ECMM') || '')
    } catch (e1) {}
    if (senha === '') {
      throw new Error('SENHA: segredo SENHA_ADM_ECMM nao cadastrado — nada foi alterado')
    }
    if (senha.length < 8) {
      throw new Error('SENHA: o segredo tem menos de 8 caracteres')
    }
    const us = app.findRecordsByFilter('users', "email='haisan.ecmm@gmail.com'", '', 1, 0)
    if (!us.length) {
      throw new Error('SENHA: conta nao existe')
    }
    const u = us[0]
    try {
      u.setPassword(senha)
      app.save(u)
      // confirma relendo
      const conf = app.findRecordById('users', u.id)
      const bate = conf.verifyPassword(senha)
      throw new Error('SENHA: aplicada, verificacao=' + (bate ? 'OK' : 'FALHOU'))
    } catch (e2) {
      if (String(e2).indexOf('SENHA:') === 0) throw e2
      throw new Error('SENHA: falhou -> ' + String(e2).slice(0, 120))
    }
  },
  (app) => {},
)
