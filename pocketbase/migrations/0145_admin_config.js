/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0145 — configuração de Administração versionada (CA-3-48, 06/11).
 *
 * **O problema:** os avisos por e-mail hoje são decididos por uma CONSTANTE no
 * código (`ATIVO=false`). Ninguém liga ou desliga sem mexer no código, e não
 * fica registrado quem mudou.
 *
 * **O que esta migração cria:** `admin_config`, uma linha por versão (vale a de
 * maior `versao`), com:
 *   - `email_ativo`: aviso por e-mail ligado/desligado (padrão **desligado**,
 *     decisão de 05/11);
 *   - `email_destinatarios`: quem recebe (JSON de user_id);
 *   - `resumo_ativo`, `resumo_horarios`, `resumo_dias`, `resumo_destinatarios`:
 *     o resumo no WhatsApp (padrão desligado);
 *   - `responder_sistema`: quem pode responder pelo sistema (JSON de user_id);
 *   - `autor_id`, `autor_nome`, `observacao`, `versao`.
 *
 * **Por que versionada:** ligar um aviso que manda mensagem para cliente é
 * decisão que precisa de rastro. Cada salvamento cria uma versão nova com autor,
 * e "voltar para esta versão" funciona sem apagar histórico.
 *
 * A versão 1 nasce com tudo DESLIGADO.
 */
migrate(
  (app) => {
    var existe = null
    try {
      existe = app.findCollectionByNameOrId('admin_config')
    } catch (e0) {}

    if (!existe) {
      const col = new Collection({
        name: 'admin_config',
        type: 'base',
        fields: [
          { name: 'versao', type: 'number' },
          { name: 'email_ativo', type: 'bool' },
          { name: 'email_destinatarios', type: 'text' },
          { name: 'resumo_ativo', type: 'bool' },
          { name: 'resumo_horarios', type: 'text' },
          { name: 'resumo_dias', type: 'text' },
          { name: 'resumo_destinatarios', type: 'text' },
          { name: 'responder_sistema', type: 'text' },
          { name: 'autor_id', type: 'text' },
          { name: 'autor_nome', type: 'text' },
          { name: 'observacao', type: 'text' },
        ],
      })
      app.save(col)
      console.log('0145: admin_config criada')
    } else {
      console.log('0145: admin_config ja existia')
    }

    // ---------- versão 1: tudo desligado ----------
    const col = app.findCollectionByNameOrId('admin_config')
    var tem = false
    try {
      const atuais = app.findRecordsByFilter(col, '', '', 5, 0)
      if (atuais && atuais.length > 0) tem = true
    } catch (e1) {}

    if (!tem) {
      try {
        const v1 = new Record(col)
        v1.set('versao', 1)
        v1.set('email_ativo', false)
        v1.set('email_destinatarios', '[]')
        v1.set('resumo_ativo', false)
        v1.set('resumo_horarios', '["08:00","17:00"]')
        v1.set('resumo_dias', '["1","2","3","4","5"]')
        v1.set('resumo_destinatarios', '[]')
        v1.set('responder_sistema', '[]')
        v1.set('autor_id', '')
        v1.set('autor_nome', 'Sistema')
        v1.set('observacao', 'Versão inicial: avisos e resumo DESLIGADOS (decisão de 05/11)')
        app.save(v1)
        console.log('0145: versao 1 criada com tudo desligado')
      } catch (e2) {
        console.log('0145: falhou criar v1 -> ' + String(e2).slice(0, 150))
      }
    }
    console.log('0145: pronto')
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('admin_config'))
    } catch (e) {}
  },
)
