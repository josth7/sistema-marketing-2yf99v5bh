/// <reference path="../pb_data/types.d.ts" />
/**
 * VENDAS SEM VALOR — listar e preencher (04/11).
 *
 * O buraco: a rota de conversão gravava o valor só na fila do Meta/Google e
 * nunca no lead, então toda venda registrada pelo sistema nascia com valor
 * zero. A correção já está no ar; esta rota resolve o PASSADO — as 18 vendas
 * que vieram da planilha da agência em 28/10 já na etapa "venda realizada"
 * e sem valor nenhum.
 *
 * Por que uma rota própria e não a edição do lead: são 18 (e podem aparecer
 * mais), e cada uma precisa de valor, data e responsável na mesma tela. Pedir
 * isso uma por uma dentro da ficha do lead é o tipo de tarefa que ninguém
 * termina.
 *
 * ROTAS
 *   GET  /backend/v1/crm/vendas-sem-valor
 *        → lista as vendas com valor zero (gestão: todas; vendedor: a dele)
 *   POST /backend/v1/crm/vendas-sem-valor/preencher
 *        { id, valor, confirmar: true }
 *        → grava o valor no lead, registra na trilha e fecha
 *
 * TRAVAS
 *   - valor tem de ser > 0 (não dá para "fechar" sem número)
 *   - a pessoa só preenche venda da própria carteira
 *   - `confirmar` obrigatório: gravação em lote sem confirmação é como o
 *     valor errado entra e ninguém percebe
 *   - recusa se a venda já tem valor (evita sobrescrever número bom)
 *
 * JSVM: helpers INLINE (função no topo quebra o hook inteiro).
 */

// ==================== listar ====================
routerAdd(
  'GET',
  '/backend/v1/crm/vendas-sem-valor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerA(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)
    var temRead = false
    var temTudo = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        50,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerA(g.get('actions'))
        if (a.indexOf('read_leads') < 0) continue
        temRead = true
        const sc = lerA(g.get('scope_accounts'))
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) temTudo = true
      }
    } catch (e0) {}
    if (!temRead) return e.json(403, { ok: false, erro: 'sem permissão para ver leads' })

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        6000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'não consegui ler os leads' })
    }

    var nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e2) {}

    const itens = []
    var somaTotal = 0
    for (const l of leads) {
      const st = String(l.get('status') || '')
      if (st !== 'venda_realizada' && st !== 'finalizado') continue
      const v = Number(l.get('valor') || 0)
      if (Number.isFinite(v) && v > 0) continue
      const dono = String(l.get('owner_id') || '')
      if (!temTudo && dono !== e.auth.id) continue
      var criado = ''
      try {
        criado = String(l.get('created') || '').slice(0, 10)
      } catch (eC) {}
      itens.push({
        id: l.id,
        nome: String(l.get('nome') || ''),
        telefone: String(l.get('telefone') || ''),
        status: st,
        origem: String(l.get('origem') || ''),
        data_lead: String(l.get('data_lead') || '').slice(0, 10),
        importado_em: criado,
        owner_id: dono,
        dono: nomes[dono] || (dono === '' ? '(sem dono)' : dono),
      })
    }
    somaTotal = itens.length
    return e.json(200, { ok: true, total: somaTotal, itens: itens })
  },
  $apis.requireAuth(),
)

// ==================== preencher ====================
routerAdd(
  'POST',
  '/backend/v1/crm/vendas-sem-valor/preencher',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerB(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)

    var temManage = false
    var temLeitura = false
    var temTudo = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        50,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerB(g.get('actions'))
        // RN-196 (10/11): o VENDEDOR registra o valor de um lead DELE.
        // Antes só manage_leads passava — e o vendedor só tem read_leads, então
        // ele recebia 403 numa venda da própria carteira (relato da Anézia).
        if (a.indexOf('manage_leads') >= 0 || a.indexOf('manage_metrics') >= 0) temManage = true
        if (a.indexOf('read_leads') >= 0) temLeitura = true
        const sc = lerB(g.get('scope_accounts'))
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) temTudo = true
      }
    } catch (e0) {}
    // gestão registra qualquer venda; vendedor registra a da carteira dele
    if (!temManage && !temLeitura) {
      return e.json(403, { ok: false, erro: 'sem permissão para registrar valor de venda' })
    }

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (e1) {}
    const id = String(body.id || '')
    const valor = Number(body.valor)
    if (id === '') return e.json(400, { ok: false, erro: 'informe a venda' })
    if (!Number.isFinite(valor) || valor <= 0) {
      return e.json(422, { ok: false, erro: 'informe o valor da venda (maior que zero)' })
    }
    if (body.confirmar !== true) {
      return e.json(422, {
        ok: false,
        erro: 'confirmação obrigatória',
        detalhe: 'envie confirmar=true depois de conferir o valor',
      })
    }

    var lead = null
    try {
      lead = app.findRecordById('crm_leads', id)
    } catch (e2) {
      return e.json(404, { ok: false, erro: 'venda não encontrada' })
    }

    // escopo: vendedor só mexe na carteira dele
    const dono = String(lead.get('owner_id') || '')
    if (!temTudo && dono !== e.auth.id) {
      return e.json(403, { ok: false, erro: 'esta venda não é da sua carteira' })
    }

    // não sobrescreve valor bom
    const atual = Number(lead.get('valor') || 0)
    if (Number.isFinite(atual) && atual > 0) {
      return e.json(409, {
        ok: false,
        erro: 'esta venda já tem valor',
        valor_atual: atual,
        detalhe: 'para corrigir, edite o lead',
      })
    }

    // status: só promove se ainda não estava em venda realizada/finalizado
    const statusAntes = String(lead.get('status') || '')
    try {
      lead.set('valor', valor)
      if (statusAntes !== 'venda_realizada' && statusAntes !== 'finalizado') {
        lead.set('status', 'venda_realizada')
      }
      app.save(lead)
    } catch (e3) {
      return e.json(500, { ok: false, erro: 'não consegui gravar: ' + String(e3).slice(0, 160) })
    }

    // trilha: o valor preenchido tem de ser auditável (quem, quando, quanto)
    try {
      const colEv = app.findCollectionByNameOrId('crm_lead_events')
      const ev = new Record(colEv)
      ev.set('lead_id', lead.id)
      ev.set('tipo', 'conversao')
      ev.set(
        'texto',
        'VALOR PREENCHIDO: R$ ' +
          valor.toFixed(2) +
          ' (venda importada sem valor; preenchido em ' +
          hoje +
          ')',
      )
      ev.set('user_id', e.auth.id)
      ev.set('fixture', false)
      app.save(ev)
    } catch (e4) {}

    return e.json(200, {
      ok: true,
      id: lead.id,
      nome: String(lead.get('nome') || ''),
      valor: valor,
      status: String(lead.get('status') || ''),
    })
  },
  $apis.requireAuth(),
)
