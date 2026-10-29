/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0088 — Adriana entra como vendedora (SPEC-3-005, 29/10).
 *
 * O dono confirmou: 41 9800-8695. E-mail no padrão da empresa (a conta
 * `adriana@haisan.com.br` existe no Umbler segundo o cadastro mapeado).
 *
 * Espelho da 0082 (Fábio), 0086 (Douglas) e 0087 (Elisangela):
 *   1. usuário com senha provisória;
 *   2. grant `read_leads` + `read_conversas` + `write_leads` com escopo PRÓPRIO
 *      (vazio = só o dela — regra corrigida em 28/10);
 *   3. conexão `papel=vendedor` com o número dela ligado ao usuário;
 *   4. os leads que a planilha atribuía a "Adriana Santos" ganham `owner_id`
 *      dela (o import deixou owner vazio porque a vendedora não tinha usuário);
 *   5. o número dela aparecia no CRM como lead "Vendedora Adriana Pedroso"
 *      (linha da planilha) — marcado como interno para não contar como cliente.
 *
 * Idempotente.
 */

migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colC = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colL = app.findCollectionByNameOrId('crm_leads')

    const EMAIL = 'adriana@haisan.com.br'
    const NUMERO = '554198008695'
    const NOME = 'Adriana Santos'
    const NOME_PUBLICO = 'Adriana'
    const SEGREDO = 'DAPI_KEY_ADRIANA'

    // ---------- 1. usuário ----------
    var vendedor = null
    var existentes = []
    try {
      existentes = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
    } catch (e0) {}
    if (existentes && existentes.length > 0) {
      vendedor = existentes[0]
      console.log('0088: usuário já existia')
    } else {
      vendedor = new Record(colU)
      vendedor.set('email', EMAIL)
      vendedor.set('password', 'Haisan@2026')
      vendedor.set('passwordConfirm', 'Haisan@2026')
      vendedor.set('name', NOME)
      vendedor.set('verified', true)
      try {
        app.save(vendedor)
        console.log('0088: usuário criado')
      } catch (e1) {
        console.log('0088: falhou usuário -> ' + String(e1).slice(0, 150))
        return
      }
    }

    // ---------- 2. grant (escopo próprio) ----------
    var grants = []
    try {
      grants = app.findRecordsByFilter(
        colG,
        "user_id='" + vendedor.id + "' && revoked_at=''",
        '-created',
        5,
        0,
      )
    } catch (e2) {}
    if (!grants || grants.length === 0) {
      const g = new Record(colG)
      g.set('user_id', vendedor.id)
      g.set('role', 'vendedor')
      g.set('version', 1)
      g.set('actions', ['read_leads', 'read_conversas', 'write_leads'])
      g.set('scope_accounts', [])
      g.set('valid_from', '')
      g.set('valid_until', '')
      g.set('revoked_at', '')
      try {
        app.save(g)
        console.log('0088: grant criado (escopo próprio)')
      } catch (e3) {
        console.log('0088: falhou grant -> ' + String(e3).slice(0, 150))
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
      console.log('0088: grant já existia (ações garantidas)')
    }

    // ---------- 3. conexão ----------
    var jaConexao = []
    try {
      jaConexao = app.findRecordsByFilter(colC, "numero='" + NUMERO + "'", '', 1, 0)
    } catch (e6) {}
    if (jaConexao && jaConexao.length > 0) {
      console.log('0088: conexão já cadastrada')
    } else {
      const c = new Record(colC)
      c.set('papel', 'vendedor')
      c.set('numero', NUMERO)
      c.set('nome_exibicao', NOME)
      c.set('vendedor_user', vendedor.id)
      c.set('vendedor_nome_publico', NOME_PUBLICO)
      c.set('nome_segredo_chave', SEGREDO)
      c.set('ativo', true)
      c.set('fixture', false)
      try {
        app.save(c)
        console.log('0088: conexão criada (session_id ainda vazio)')
      } catch (e7) {
        console.log('0088: falhou conexão -> ' + String(e7).slice(0, 150))
      }
    }

    // ---------- 4. carteira ----------
    var meusLeads = []
    try {
      meusLeads = app.findRecordsByFilter(
        colL,
        "vendedor_nome~'Adriana' && owner_id=''",
        '',
        2000,
        0,
      )
    } catch (e8) {
      console.log('0088: busca da carteira falhou -> ' + String(e8).slice(0, 120))
    }
    var atribuidos = 0
    for (const l of meusLeads) {
      if (String(l.get('telefone') || '') === NUMERO) continue
      l.set('owner_id', vendedor.id)
      try {
        app.save(l)
        atribuidos = atribuidos + 1
      } catch (e9) {}
    }
    console.log('0088: leads atribuídos = ' + String(atribuidos))

    // ---------- 5. o número dela não é cliente ----------
    var proprio = []
    try {
      proprio = app.findRecordsByFilter(colL, "telefone='" + NUMERO + "'", '', 5, 0)
    } catch (e10) {}
    for (const l of proprio) {
      l.set('status', 'perdido')
      l.set('origem', 'manual')
      l.set('owner_id', '')
      l.set('nome', NOME + ' (número da vendedora)')
      l.set(
        'observacoes',
        'Número da própria vendedora Adriana — não é cliente. Marcado como perdido para sair da contagem.',
      )
      try {
        app.save(l)
        console.log('0088: lead do próprio número marcado como interno')
      } catch (e11) {}
    }
  },
  (app) => {
    console.log('0088 revertida (usuário e conexão preservados)')
  },
)
