/// <reference path="../pb_data/types.d.ts" />
/**
 * 0130 — DEFINE a senha da conta haisan.ecmm@gmail.com (18/11).
 *
 * DESCOBERTA: migração que lança erro é REVERTIDA (transação). Eu usava
 * `throw` para mostrar o resultado e, com isso, a senha era desfeita a cada
 * tentativa. Agora a migração CONCLUI sem erro e o resultado vai para
 * `access_audit`, que é lido depois pela rota de acessos.
 *
 * A senha NÃO fica no arquivo: vem do segredo `SENHA_ADM_ECMM`.
 */
migrate(
  (app) => {
    var senha = ''
    try {
      senha = String($secrets.get('SENHA_ADM_ECMM') || '')
    } catch (e1) {}
    if (senha === '') {
      console.log('0130: segredo SENHA_ADM_ECMM ausente — nada alterado')
      return
    }
    const us = app.findRecordsByFilter('users', "email='haisan.ecmm@gmail.com'", '', 1, 0)
    if (!us.length) {
      console.log('0130: conta nao existe')
      return
    }
    const u = us[0]
    const antes = String(u.get('updated') || '')
    try {
      u.setPassword(senha)
      app.save(u)
    } catch (e2) {
      console.log('0130: falhou ao salvar -> ' + String(e2).slice(0, 140))
      return
    }
    const conf = app.findRecordById('users', u.id)
    const depois = String(conf.get('updated') || '')
    const ok = depois !== antes
    console.log(
      '0130: senha ' +
        (ok ? 'APLICADA' : 'NAO mudou') +
        ' (' +
        antes.slice(11, 19) +
        ' -> ' +
        depois.slice(11, 19) +
        ')',
    )
    // registro de auditoria (nao lanca erro: a transacao precisa concluir)
    try {
      const a = new Record(app.findCollectionByNameOrId('access_audit'))
      a.set('at', new Date().toISOString())
      a.set('actor', 'sistema')
      a.set('acao', 'senha_redefinida')
      a.set('alvo', 'haisan.ecmm@gmail.com')
      a.set(
        'detalhe',
        'Senha redefinida pelo Maestro a pedido do dono (18/11). Resultado: ' +
          (ok ? 'aplicada' : 'nao aplicada'),
      )
      app.save(a)
    } catch (e3) {}
  },
  (app) => {},
)
