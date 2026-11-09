/// <reference path="../pb_data/types.d.ts" />
/**
 * NÚMEROS DO DIA E CARGA POR VENDEDOR — CA-3-51 (SPEC-3-011, 06/11).
 *
 * **O que a gestão passa a ver:** num período escolhido,
 *   - **recebidos**: leads que entraram no período;
 *   - **distribuídos**: quantos têm dono;
 *   - **sem dono**: os que ninguém pegou;
 *   - **sem contato da vendedora**: tem dono mas nunca recebeu mensagem dela;
 *   - **conversas sem resposta**: a última mensagem é do cliente;
 *   - **recusados**: marcados como "não é cliente";
 *   - **duplicados**: mesmo telefone mais de uma vez;
 *   e a **tabela por vendedor** com a carteira de cada um.
 *
 * **Sem essa tela a gestão decide no escuro.** É a diferença entre "acho que
 * está andando" e "sei que 12 clientes estão sem dono desde ontem".
 *
 * **Vendedor não entra:** a rota recusa (404) quem não é gestão.
 *
 * Rota:
 *   GET /backend/v1/gestao/resumo?de=YYYY-MM-DD&ate=YYYY-MM-DD
 */
routerAdd(
  'GET',
  '/backend/v1/gestao/resumo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
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

    // ---------- só gestão (vendedor recebe 404, não 403) ----------
    var ehGestao = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    // 404: não confirma nem que a rota existe
    if (!ehGestao) return e.json(404, { ok: false, erro: 'não encontrado' })

    // ---------- período ----------
    const de = String(e.request.url.query().get('de') || '')
    const ate = String(e.request.url.query().get('ate') || '')
    const out = {
      ok: true,
      periodo: { de: de, ate: ate },
      numeros: {
        recebidos: 0,
        distribuidos: 0,
        sem_dono: 0,
        sem_contato_vendedora: 0,
        conversas_sem_resposta: 0,
        recusados: 0,
        duplicados: 0,
      },
      por_vendedor: [],
      total_vendedores: 0,
    }

    // ---------- leads do período ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = 'não consegui ler os leads'
      return e.json(200, out)
    }

    // nomes dos vendedores
    const nomes = {}
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

    // quem já recebeu mensagem de vendedor (qualquer número)
    const comContatoVend = {}
    try {
      for (const m of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='saida' && autor='vendedor'",
        '',
        12000,
        0,
      )) {
        const t = String(m.get('contato_telefone') || '').replace(/\D/g, '')
        if (t !== '') comContatoVend[t] = true
      }
    } catch (e3) {}

    // ---------- CONVERSAS SEM RESPOSTA — POR CLIENTE (09/11) ----------
    // A regra antiga olhava CADA conversa. Efeito: o cliente falava com a
    // central, o vendedor chamava ele pelo número dele, e a conversa da central
    // ficava "sem resposta para sempre" — mesmo já atendido.
    //
    // Agora: soma TODAS as conversas do cliente (central + vendedores) e ele só
    // está esperando se a última mensagem DELE for mais nova que a última nossa.
    // Fora da conta: conversa interna e conversa marcada "não é cliente".
    const semResposta = {}
    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        8000,
        0,
      )
      function chaveCli(t) {
        var d = String(t || '').replace(/[^0-9]/g, '')
        if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2)
        if (d.length === 11 && d.charAt(2) === '9') d = d.slice(0, 2) + d.slice(3)
        return d
      }
      const ultimoDoCliente = {}
      const ultimoNosso = {}
      for (const cv of cvs) {
        if (String(cv.get('interna')) === 'true') continue
        if (String(cv.get('nao_cliente')) === 'true') continue
        const k = chaveCli(cv.get('contato_telefone'))
        if (k === '') continue
        const q = new Date(String(cv.get('ultima_mensagem_em') || '')).getTime()
        if (!(q > 0)) continue
        if (String(cv.get('ultimo_autor') || '') === 'cliente') {
          const t = String(cv.get('contato_telefone') || '').replace(/[^0-9]/g, '')
          if (!ultimoDoCliente[k] || q > ultimoDoCliente[k].q) {
            ultimoDoCliente[k] = { q: q, tel: t }
          }
        } else {
          if (!ultimoNosso[k] || q > ultimoNosso[k]) ultimoNosso[k] = q
        }
      }
      for (const k in ultimoDoCliente) {
        const dele = ultimoDoCliente[k].q
        const nosso = ultimoNosso[k] || 0
        if (dele > nosso) semResposta[ultimoDoCliente[k].tel] = true
      }
    } catch (e4) {}

    // telefones vistos (para duplicados) e carga por vendedor
    const vistos = {}
    const carga = {}
    for (const l of leads) {
      // filtro de período pela data de criação
      var criado = ''
      try {
        criado = String(l.get('created') || '').slice(0, 10)
      } catch (eC) {}
      if (de !== '' && criado !== '' && criado < de) continue
      if (ate !== '' && criado !== '' && criado > ate) continue

      out.numeros.recebidos++

      const tel = String(l.get('telefone') || '').replace(/\D/g, '')
      if (tel !== '') {
        if (vistos[tel]) out.numeros.duplicados++
        else vistos[tel] = true
      }

      const dono = String(l.get('owner_id') || '')
      const st = String(l.get('status') || '')
      if (st === 'descartado') out.numeros.recusados++

      if (dono === '') {
        out.numeros.sem_dono++
      } else {
        out.numeros.distribuidos++
        if (!carga[dono]) {
          carga[dono] = {
            vendedor: nomes[dono] || dono,
            total: 0,
            abertos: 0,
            vendas: 0,
            valor: 0,
            descartados: 0,
          }
        }
        carga[dono].total++
        if (st === 'descartado') carga[dono].descartados++
        else if (st === 'venda_realizada' || st === 'producao' || st === 'finalizado') {
          carga[dono].vendas++
          carga[dono].valor += Number(l.get('valor') || 0)
        } else carga[dono].abertos++
      }

      // sem contato da vendedora
      if (dono !== '' && tel !== '' && !comContatoVend[tel]) {
        out.numeros.sem_contato_vendedora++
      }
      // conversa sem resposta
      if (tel !== '' && semResposta[tel]) out.numeros.conversas_sem_resposta++
    }

    for (const k in carga) out.por_vendedor.push(carga[k])
    out.por_vendedor.sort(function (a, b) {
      return b.total - a.total
    })
    out.total_vendedores = out.por_vendedor.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
