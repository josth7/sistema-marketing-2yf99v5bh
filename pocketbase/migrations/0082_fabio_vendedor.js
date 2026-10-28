/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0082 — Fábio entra como vendedor (piloto SPEC-3-005, 28/10).
 *
 * O dono passou: fabio@haisan.com.br · 41 9721-3499.
 *
 * Esta migração cria o que o número dele precisa para funcionar:
 *   1. usuário `fabio@haisan.com.br` (senha provisória; troca no primeiro acesso);
 *   2. grant com `read_leads` + `read_conversas` mas escopo PRÓPRIO — ele vê os
 *      leads dele, nunca a carteira inteira (RN-87: vendedor não entra na
 *      conversa de outro vendedor nem na central de lead que não é dele);
 *   3. conexão `papel=vendedor` com o número dele, ligada ao usuário;
 *   4. os leads que a planilha importada atribuía a "Fábio Teles" passam a ter
 *      `owner_id` dele — antes o import deixou owner vazio (vendedor da planilha
 *      não tinha usuário), então ele abriria o CRM e não veria a carteira dele.
 *
 * O número 554197213499 já existia no CRM como LEAD (linha importada da
 * planilha, origem organico). Esse lead é o próprio Fábio — não é cliente. Ele
 * é marcado como interno para nunca virar "cliente" na tela.
 *
 * Idempotente: rodar de novo não duplica nada.
 */

migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colC = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colL = app.findCollectionByNameOrId('crm_leads')

    const EMAIL = 'fabio@haisan.com.br'
    const NUMERO = '554197213499'

    // ---------- 1. usuário ----------
    var fabio = null
    var existentes = []
    try {
      existentes = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
    } catch (e0) {}
    if (existentes && existentes.length > 0) {
      fabio = existentes[0]
      console.log('0082: usuário do Fábio já existia')
    } else {
      fabio = new Record(colU)
      fabio.set('email', EMAIL)
      fabio.set('password', 'Haisan@2026')
      fabio.set('passwordConfirm', 'Haisan@2026')
      fabio.set('name', 'Fábio Teles')
      fabio.set('verified', true)
      try {
        app.save(fabio)
        console.log('0082: usuário do Fábio criado')
      } catch (e1) {
        console.log('0082: falhou criar usuário -> ' + String(e1).slice(0, 150))
        return
      }
    }

    // ---------- 2. grant (escopo próprio) ----------
    var grants = []
    try {
      grants = app.findRecordsByFilter(
        colG,
        "user_id='" + fabio.id + "' && revoked_at=''",
        '-created',
        5,
        0,
      )
    } catch (e2) {}
    if (!grants || grants.length === 0) {
      const g = new Record(colG)
      g.set('user_id', fabio.id)
      g.set('role', 'vendedor')
      g.set('version', 1)
      g.set('actions', ['read_leads', 'read_conversas', 'write_leads'])
      // escopo PRÓPRIO: vazio = só o que é dele (deny por padrão na rota)
      g.set('scope_accounts', [])
      g.set('valid_from', '')
      g.set('valid_until', '')
      g.set('revoked_at', '')
      try {
        app.save(g)
        console.log('0082: grant do Fábio criado (escopo próprio)')
      } catch (e3) {
        console.log('0082: falhou grant -> ' + String(e3).slice(0, 150))
      }
    } else {
      console.log('0082: grant do Fábio já existia')
      // garante as ações da fase 3 sem tirar o que já havia
      const g = grants[0]
      var acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e4) {}
      if (!Array.isArray(acts)) acts = []
      var mudou = false
      for (const acao of ['read_leads', 'read_conversas', 'write_leads']) {
        if (acts.indexOf(acao) < 0) {
          acts.push(acao)
          mudou = true
        }
      }
      if (mudou) {
        g.set('actions', acts)
        try {
          app.save(g)
          console.log('0082: ações somadas ao grant do Fábio')
        } catch (e5) {}
      }
    }

    // ---------- 3. conexão do número dele ----------
    var jaConexao = []
    try {
      jaConexao = app.findRecordsByFilter(colC, "numero='" + NUMERO + "'", '', 1, 0)
    } catch (e6) {}
    if (jaConexao && jaConexao.length > 0) {
      console.log('0082: conexão do número já cadastrada')
    } else {
      const c = new Record(colC)
      c.set('papel', 'vendedor')
      c.set('numero', NUMERO)
      c.set('nome_exibicao', 'Fábio Teles')
      c.set('vendedor_user', fabio.id)
      c.set('vendedor_nome_publico', 'Fábio')
      c.set('nome_segredo_chave', 'DAPI_KEY_FABIO')
      c.set('ativo', true)
      c.set('fixture', false)
      try {
        app.save(c)
        console.log('0082: conexão do Fábio criada (session_id ainda vazio)')
      } catch (e7) {
        console.log('0082: falhou conexão -> ' + String(e7).slice(0, 150))
      }
    }

    // ---------- 4. carteira dele ----------
    var meusLeads = []
    try {
      meusLeads = app.findRecordsByFilter(colL, "vendedor_nome~'Fábio' && owner_id=''", '', 2000, 0)
    } catch (e8) {
      console.log('0082: busca da carteira falhou -> ' + String(e8).slice(0, 120))
    }
    var atribuidos = 0
    for (const l of meusLeads) {
      if (String(l.get('telefone') || '') === NUMERO) continue // o próprio Fábio
      l.set('owner_id', fabio.id)
      try {
        app.save(l)
        atribuidos = atribuidos + 1
      } catch (e9) {}
    }
    console.log('0082: leads atribuídos ao Fábio = ' + String(atribuidos))

    // ---------- 5. o número dele não é cliente ----------
    var proprio = []
    try {
      proprio = app.findRecordsByFilter(colL, "telefone='" + NUMERO + "'", '', 5, 0)
    } catch (e10) {}
    for (const l of proprio) {
      // fica no banco (tem histórico) mas sai da contagem de cliente
      l.set('fixture', false)
      l.set('status', 'perdido')
      // `origem` é select fechado (meta/google/site/whatsapp/manual/importacao/organico)
      // — 'interno' não existe. Fica 'manual' com o motivo escrito.
      l.set('origem', 'manual')
      l.set('owner_id', '')
      l.set('nome', 'Fábio Teles (número do vendedor)')
      l.set(
        'observacoes',
        'Número do próprio vendedor — não é cliente. Marcado como perdido para sair da contagem.',
      )
      try {
        app.save(l)
        console.log('0082: lead do próprio número marcado como interno')
      } catch (e11) {}
    }
  },
  (app) => {
    console.log('0082 revertida (usuário e conexão preservados para auditoria)')
  },
)
