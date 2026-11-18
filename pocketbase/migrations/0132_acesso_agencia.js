/// <reference path="../pb_data/types.d.ts" />
/**
 * 0132 — ACESSO DA AGÊNCIA (18/11), pedido do dono.
 *
 * E-mail: areah@hsgmarketing.com.br
 *
 * QUE ACESSO UMA AGÊNCIA PRECISA — e o que ela NÃO pode ter:
 *
 *   PODE: ler tudo que é resultado — métricas, leads (para ver volume e
 *   origem), conversas (para medir atendimento), relatórios, análises,
 *   decisões, critérios, alertas. E pedir análise (`request_analysis`), que é
 *   o trabalho dela.
 *
 *   NÃO PODE, e isso é decisão de segurança, não de conveniência:
 *   · `manage_access` — a agência não cria nem muda acesso de ninguém;
 *   · `manage_whatsapp` — não configura número nem conexão;
 *   · `manage_atendimento` — não liga/desliga o robô da Haisan;
 *   · `manage_leads` / `write_leads` — não altera lead de cliente. Ela LÊ o
 *     funil para medir; escrever é do time da Haisan;
 *   · `reply_conversas` — não responde cliente em nome da Haisan.
 *
 * Escopo: SÓ a Haisan. A agência não vê a GOO7 nem as empresas de teste/fixture.
 *
 * Senha: vem do segredo `SENHA_AGENCIA_HSG` (nunca no repositório).
 */
migrate(
  (app) => {
    const EMAIL = 'areah@hsgmarketing.com.br'
    const NOME = 'Agência HSG'
    const EMPRESA_HAISAN = '466e6h3zvebl0rf'

    // ---------- as ações da agência ----------
    const ACOES = [
      'read_metrics',
      'read_leads',
      'read_conversas',
      'read_reports',
      'read_analyses',
      'read_decisions',
      'read_alerts',
      'manage_criteria',
      'manage_decisions',
      'request_analysis',
    ]

    var senha = ''
    try {
      senha = String($secrets.get('SENHA_AGENCIA_HSG') || '')
    } catch (e1) {}
    if (senha === '') {
      console.log('0132: segredo SENHA_AGENCIA_HSG ausente — nada criado')
      return
    }

    // ---------- 1. a conta ----------
    var u = null
    try {
      const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (e2) {}

    if (!u) {
      try {
        const colU = app.findCollectionByNameOrId('users')
        u = new Record(colU)
        u.set('email', EMAIL)
        u.set('name', NOME)
        u.set('verified', true)
        u.setPassword(senha)
        app.save(u)
        console.log('0132: conta criada')
      } catch (e3) {
        console.log('0132: NAO criei a conta -> ' + String(e3).slice(0, 160))
        return
      }
    } else {
      console.log('0132: conta ja existia — nao mexo na senha')
    }

    // ---------- 2. o grant ----------
    // não duplica: se já existir um ativo para ele, atualiza as ações
    var grant = null
    try {
      const gs = app.findRecordsByFilter(
        'access_grants',
        "user_id='" + u.id + "' && revoked_at=''",
        '',
        1,
        0,
      )
      if (gs.length > 0) grant = gs[0]
    } catch (e4) {}

    if (!grant) {
      try {
        const colG = app.findCollectionByNameOrId('access_grants')
        grant = new Record(colG)
        grant.set('user_id', u.id)
      } catch (e5) {
        console.log('0132: NAO criei o grant -> ' + String(e5).slice(0, 140))
        return
      }
    }
    try {
      grant.set('role', 'agencia')
      grant.set('actions', JSON.stringify(ACOES))
      grant.set('scope_accounts', JSON.stringify([EMPRESA_HAISAN]))
      grant.set('empresa', EMPRESA_HAISAN)
      grant.set('revoked_at', '')
      app.save(grant)
      console.log('0132: grant salvo com ' + ACOES.length + ' acoes, escopo Haisan')
    } catch (e6) {
      console.log('0132: falhou ao salvar o grant -> ' + String(e6).slice(0, 160))
    }

    // ---------- 3. auditoria ----------
    try {
      const a = new Record(app.findCollectionByNameOrId('access_audit'))
      a.set('at', new Date().toISOString())
      a.set('actor', 'sistema')
      a.set('acao', 'acesso_criado')
      a.set('alvo', EMAIL)
      a.set(
        'detalhe',
        'Acesso de AGENCIA criado a pedido do dono (18/11). ' +
          ACOES.length +
          ' acoes: le relatorios, metricas, leads e conversas e pede analise. ' +
          'SEM manage_access, manage_whatsapp, manage_atendimento, manage_leads, ' +
          'write_leads nem reply_conversas. Escopo: somente a Haisan.',
      )
      app.save(a)
    } catch (e7) {}
  },
  (app) => {
    // rollback: revoga
    try {
      const us = app.findRecordsByFilter('users', "email='areah@hsgmarketing.com.br'", '', 1, 0)
      if (us.length > 0) {
        for (const g of app.findRecordsByFilter(
          'access_grants',
          "user_id='" + us[0].id + "' && revoked_at=''",
          '',
          10,
          0,
        )) {
          g.set('revoked_at', new Date().toISOString())
          app.save(g)
        }
      }
    } catch (e8) {}
  },
)
