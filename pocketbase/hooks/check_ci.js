/// <reference path="../pb_data/types.d.ts" />
/**
 * CORRIGE LEAD COM DONO INVÁLIDO (17/11).
 *
 * O lead "Joice Colman" está com dono `Marketing Haisan` — conta que NÃO tem
 * conexão de vendedor e portanto nunca atende. Pela regra nova (item 2 do dono
 * de hoje), este lead deve ir para o RODÍZIO e receber um vendedor de verdade.
 *
 * O que faz:
 *   1. tira o dono inválido;
 *   2. entrega ao vendedor de menor carga entre os ATIVOS (ordem fixa como
 *      critério de desempate, decisão de 09/11);
 *   3. grava um evento no histórico do lead explicando a correção.
 *
 * Sem `?executar=1` é só leitura.
 *
 * GET /backend/v1/check/corrige-dono-invalido?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/corrige-dono-invalido',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, casos: [], feitos: [], erros: [] }

    // vendedores ativos
    const ativos = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )) {
        const uid = String(c.get('vendedor_user') || '')
        if (uid !== '') ativos[uid] = String(c.get('nome_exibicao') || '')
      }
    } catch (e0) {}
    if (Object.keys(ativos).length === 0)
      return e.json(200, { ok: false, erro: 'sem vendedor ativo' })

    // carga por vendedor (leads em aberto)
    const carga = {}
    for (const k in ativos) carga[k] = 0
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        6000,
        0,
      )) {
        const ow = String(l.get('owner_id') || '')
        if (carga[ow] === undefined) continue
        const st = String(l.get('status') || '')
        if (
          st === 'venda_realizada' ||
          st === 'producao' ||
          st === 'finalizado' ||
          st === 'descartado'
        )
          continue
        carga[ow]++
      }
    } catch (e1) {}

    // acha os leads com dono inválido
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '-created',
        6000,
        0,
      )
    } catch (e2) {}

    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '' || ativos[ow] !== undefined) continue
      const st = String(l.get('status') || '')
      if (st === 'descartado' || st === 'finalizado' || st === 'venda_realizada') continue

      var donoNome = ''
      try {
        const u = app.findRecordById('users', ow)
        donoNome = String(u.get('name') || u.get('email') || '')
      } catch (eU) {
        donoNome = '(usuario ' + ow.slice(0, 8) + ')'
      }

      // menor carga (a ordem fixa decide o empate)
      const ORDEM = [
        'adriana@haisan.com.br',
        'douglasrenato@haisan.com.br',
        'elisangela@haisan.com.br',
        'fabio@haisan.com.br',
      ]
      const emailDe = {}
      for (const uid in ativos) {
        try {
          const u = app.findRecordById('users', uid)
          emailDe[uid] = String(u.get('email') || '').toLowerCase()
        } catch (eEu) {
          emailDe[uid] = ''
        }
      }
      var escolhido = ''
      var menor = 1e9
      // primeiro pela ordem fixa
      for (const em of ORDEM) {
        for (const uid in ativos) {
          if (emailDe[uid] === em && carga[uid] < menor) {
            menor = carga[uid]
            escolhido = uid
          }
        }
      }
      if (escolhido === '') {
        for (const uid in ativos) {
          if (carga[uid] < menor) {
            menor = carga[uid]
            escolhido = uid
          }
        }
      }
      if (escolhido === '') {
        out.erros.push({ lead: l.id.slice(0, 10), erro: 'sem escolha' })
        continue
      }

      const caso = {
        lead: l.id.slice(0, 10),
        nome: String(l.get('nome') || '').slice(0, 22),
        tel: String(l.get('telefone') || '').slice(-6),
        de: donoNome,
        para: ativos[escolhido],
        carga_antes: menor,
      }
      out.casos.push(caso)

      if (!executar) continue

      try {
        l.set('owner_id', escolhido)
        app.save(l)
        const conf = app.findRecordById('crm_leads', l.id)
        if (String(conf.get('owner_id') || '') !== escolhido) {
          out.erros.push({ lead: l.id.slice(0, 10), erro: 'save nao persistiu' })
          continue
        }
        carga[escolhido]++
        try {
          const ev = new Record(colEv)
          ev.set('lead_id', l.id)
          ev.set('tipo', 'nota')
          ev.set(
            'texto',
            'Dono corrigido em 17/11: estava com ' +
              donoNome +
              ', que nao tem conexao de vendedor (nunca atenderia). Entregue a ' +
              ativos[escolhido] +
              ' pelo rodizio.',
          )
          $app.save(ev)
        } catch (eEv) {}
        caso.ok = true
        out.feitos.push(caso)
      } catch (e3) {
        out.erros.push({ lead: l.id.slice(0, 10), erro: String(e3).slice(0, 100) })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
