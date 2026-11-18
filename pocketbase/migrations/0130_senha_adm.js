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
    // JSVM nao tem `verifyPassword` (descoberto aqui). Confiro pelo updated:
    // se o registro foi salvo depois do setPassword, a senha entrou.
    const antes = String(u.get('updated') || '')
    try {
      u.setPassword(senha)
      app.save(u)
    } catch (e2) {
      throw new Error('SENHA: falhou ao salvar -> ' + String(e2).slice(0, 120))
    }
    const conf = app.findRecordById('users', u.id)
    const depois = String(conf.get('updated') || '')
    if (depois === antes) throw new Error('SENHA: save nao alterou o registro')
    throw new Error(
      'SENHA: aplicada (updated ' + antes.slice(11, 19) + ' -> ' + depois.slice(11, 19) + ')',
    )
  },
  (app) => {},
)
