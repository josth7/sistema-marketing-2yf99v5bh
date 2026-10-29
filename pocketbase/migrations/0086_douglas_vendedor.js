/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0086 — Douglas entra como vendedor (piloto SPEC-3-005, 29/10).
 *
 * O dono passou: 41 9720-6353 (Fábio pulado por problema de conexão na D-API).
 * O e-mail dele é douglasrenato@haisan.com.br (mesmo padrão dos outros).
 *
 * Espelho da 0082 (Fábio):
 *   1. usuário com senha provisória;
 *   2. grant `read_leads` + `read_conversas` + `write_leads` com escopo PRÓPRIO
 *      (vazio = só o dele — deny por padrão, regra corrigida em 28/10);
 *   3. conexão `papel=vendedor` com o número dele ligado ao usuário;
 *   4. os leads que a planilha atribuía a "Douglas Renato" ganham `owner_id`
 *      dele (o import deixou owner vazio porque o vendedor não tinha usuário);
 *   5. o número dele já existe no CRM como lead "Haisan Moveis" (linha da
 *      planilha) — marcado como interno para nunca contar como cliente.
 *
 * Idempotente.
 */

migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colC = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colL = app.findCollectionByNameOrId('crm_leads')

    const EMAIL = 'douglasrenato@haisan.com.br'
    const NUMERO = '554197206353'

    // ---------- 1. usuário ----------
    var douglas = null
    var existentes = []
    try {
      existentes = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
    } catch (e0) {}
    if (existentes && existentes.length > 0) {
      douglas = existentes[0]
      console.log('0086: usuário do Douglas já existia')
    } else {
      douglas = new Record(colU)
      douglas.set('email', EMAIL)
      douglas.set('password', 'Haisan@2026')
      douglas.set('passwordConfirm', 'Haisan@2026')
      douglas.set('name', 'Douglas Renato')
      douglas.set('verified', true)
      try {
        app.save(douglas)
        console.log('0086: usuário do Douglas criado')
      } catch (e1) {
        console.log('0086: falhou usuário -> ' + String(e1).slice(0, 150))
        return
      }
    }

    // ---------- 2. grant (escopo próprio) ----------
    var grants = []
    try {
      grants = app.findRecordsByFilter(
        colG,
        "user_id='" + douglas.id + "' && revoked_at=''",
        '-created',
        5,
        0,
      )
    } catch (e2) {}
    if (!grants || grants.length === 0) {
      const g = new Record(colG)
      g.set('user_id', douglas.id)
      g.set('role', 'vendedor')
      g.set('version', 1)
      g.set('actions', ['read_leads', 'read_conversas', 'write_leads'])
      g.set('scope_accounts', [])
      g.set('valid_from', '')
      g.set('valid_until', '')
      g.set('revoked_at', '')
      try {
        app.save(g)
        console.log('0086: grant do Douglas criado (escopo próprio)')
      } catch (e3) {
        console.log('0086: falhou grant -> ' + String(e3).slice(0, 150))
      }
    } else {
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
        } catch (e5) {}
      }
      console.log('0086: grant do Douglas já existia (ações garantidas)')
    }

    // ---------- 3. conexão ----------
    var jaConexao = []
    try {
      jaConexao = app.findRecordsByFilter(colC, "numero='" + NUMERO + "'", '', 1, 0)
    } catch (e6) {}
    if (jaConexao && jaConexao.length > 0) {
      console.log('0086: conexão já cadastrada')
    } else {
      const c = new Record(colC)
      c.set('papel', 'vendedor')
      c.set('numero', NUMERO)
      c.set('nome_exibicao', 'Douglas Renato')
      c.set('vendedor_user', douglas.id)
      c.set('vendedor_nome_publico', 'Douglas')
      c.set('nome_segredo_chave', 'DAPI_KEY_DOUGLAS')
      c.set('ativo', true)
      c.set('fixture', false)
      try {
        app.save(c)
        console.log('0086: conexão do Douglas criada (session_id ainda vazio)')
      } catch (e7) {
        console.log('0086: falhou conexão -> ' + String(e7).slice(0, 150))
      }
    }

    // ---------- 4. carteira ----------
    var meusLeads = []
    try {
      meusLeads = app.findRecordsByFilter(
        colL,
        "vendedor_nome~'Douglas' && owner_id=''",
        '',
        2000,
        0,
      )
    } catch (e8) {
      console.log('0086: busca da carteira falhou -> ' + String(e8).slice(0, 120))
    }
    var atribuidos = 0
    for (const l of meusLeads) {
      if (String(l.get('telefone') || '') === NUMERO) continue
      l.set('owner_id', douglas.id)
      try {
        app.save(l)
        atribuidos = atribuidos + 1
      } catch (e9) {}
    }
    console.log('0086: leads atribuídos ao Douglas = ' + String(atribuidos))

    // ---------- 5. o número dele não é cliente ----------
    var proprio = []
    try {
      proprio = app.findRecordsByFilter(colL, "telefone='" + NUMERO + "'", '', 5, 0)
    } catch (e10) {}
    for (const l of proprio) {
      l.set('status', 'perdido')
      // `origem` é select fechado: 'manual' + motivo escrito
      l.set('origem', 'manual')
      l.set('owner_id', '')
      l.set('nome', 'Haisan Moveis (número do vendedor Douglas)')
      l.set(
        'observacoes',
        'Número do próprio vendedor Douglas — não é cliente. Marcado como perdido para sair da contagem.',
      )
      try {
        app.save(l)
        console.log('0086: lead do próprio número marcado como interno')
      } catch (e11) {}
    }
  },
  (app) => {
    console.log('0086 revertida (usuário e conexão preservados)')
  },
)
