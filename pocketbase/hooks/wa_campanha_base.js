/// <reference path="../pb_data/types.d.ts" />
/**
 * BASE DA CAMPANHA — CRM ou carteira dos vendedores (CA-3-82, SPEC-3-016).
 *
 * **A regra que evita o pior erro:** a prévia e a fila são calculadas pela
 * MESMA função (RN-175). Antes, a tela contava uma coisa e o disparo gravava
 * outra — o cliente recebia mais ou menos do que a gestão aprovou.
 *
 * **Duas fontes (a gestão escolhe):**
 *   - **CRM (padrão)**: leads não-fixture com telefone válido; descartados e
 *     perdidos ficam fora. Opção "só os N mais recentes" (ordem = última
 *     conversa).
 *   - **Carteira dos vendedores**: união de `carteira_contatos` de cada um com
 *     os leads em que é dono, sem repetir telefone. Inclui quem nunca falou
 *     com a Haisan pelo sistema — e por isso **exige confirmação** de que
 *     "esses contatos conhecem a Haisan", gravada com autor e data.
 *
 * **Exclusões (RN-174), sempre iguais na prévia, no teste e no início:**
 *   opt-out · números internos (equipe + conexões) · fixtures · telefone
 *   inválido ou fixo · repetidos (com e sem o 9) · quem recebeu campanha nos
 *   últimos `intervalo_dias` (padrão 7).
 *
 * Rotas:
 *   POST /backend/v1/campanhas/base        → { fonte, vendedores[], filtros } → a lista
 *   GET  /backend/v1/campanhas/base/resumo → contagens por motivo de exclusão
 */
routerAdd(
  'POST',
  '/backend/v1/campanhas/base',
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

    // ---------- só gestão monta campanha ----------
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
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão monta campanha' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}

    const fonte = String(body.fonte || 'crm') // 'crm' | 'carteira'
    const vendedores = Array.isArray(body.vendedores) ? body.vendedores : []
    const filtros = body.filtros && typeof body.filtros === 'object' ? body.filtros : {}
    const limiteRecentes = Number(filtros.recentes || 0) // 0 = todos
    const intervaloDias = Number(filtros.intervalo_dias || 7)

    const out = {
      ok: true,
      fonte: fonte,
      total: 0,
      destinos: [],
      exclusoes: {
        opt_out: 0,
        internos: 0,
        fixture: 0,
        telefone_invalido: 0,
        repetidos: 0,
        campanha_recente: 0,
        descartados: 0,
      },
      nunca_falaram: 0,
      exige_confirmacao: false,
      aviso: '',
    }

    // ---------- 1. exclusões fixas ----------
    const fora = {}
    try {
      for (const o of app.findRecordsByFilter(
        app.findCollectionByNameOrId('opt_out'),
        '',
        '',
        20000,
        0,
      )) {
        fora[String(o.get('telefone') || '').replace(/\D/g, '')] = 'opt_out'
      }
    } catch (e1) {}

    // números internos: Números da equipe + números das conexões
    const internos = {}
    try {
      // A lista de números internos mora em `whatsapp_numeros_internos`.
      // `atendimento_config.internos` é campo VIRTUAL: no registro cru vem
      // nulo, e ler dali fazia a exclusão de número interno não funcionar.
      const is = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_numeros_internos'),
        '',
        '',
        300,
        0,
      )
      for (const i of is) {
        const n = String(i.get('numero') || '').replace(/[^0-9]/g, '')
        if (n === '') continue
        internos[n] = true
        if (n.length === 13) internos[n.slice(0, 4) + n.slice(5)] = true
        if (n.length === 12) internos[n.slice(0, 4) + '9' + n.slice(4)] = true
      }
    } catch (e2) {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )) {
        const n = String(c.get('numero') || '').replace(/\D/g, '')
        if (n !== '') internos[n] = true
      }
    } catch (e3) {}

    // quem recebeu campanha nos últimos N dias
    const recentes = {}
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='campanha'",
        '',
        20000,
        0,
      )
      const agoraMs = new Date().getTime()
      for (const en of envs) {
        const q = new Date(String(en.get('created') || '')).getTime()
        if (!(q > 0)) continue
        if (agoraMs - q > intervaloDias * 86400000) continue
        const t = String(en.get('destino_telefone') || '').replace(/\D/g, '')
        if (t !== '') recentes[t] = true
      }
    } catch (e4) {}

    // quem já mandou mensagem (para saber "nunca falou")
    const falou = {}
    try {
      for (const m of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada'",
        '',
        8000,
        0,
      )) {
        const t = String(m.get('contato_telefone') || '').replace(/\D/g, '')
        if (t !== '') falou[t] = true
      }
    } catch (e5) {}

    // ---------- 2. variantes do telefone (com e sem o 9) ----------
    function variantes(t) {
      const v = [t]
      const ddd = t.slice(2, 4)
      const resto = t.slice(4)
      if (t.length === 13 && resto.charAt(0) === '9') v.push('55' + ddd + resto.slice(1))
      else if (t.length === 12) v.push('55' + ddd + '9' + resto)
      return v
    }
    // celular brasileiro válido: 55 + DDD(2) + 8 ou 9 dígitos começando por 9
    function valido(t) {
      if (t.length !== 12 && t.length !== 13) return false
      if (t.indexOf('55') !== 0) return false
      const ddd = Number(t.slice(2, 4))
      if (!(ddd >= 11 && ddd <= 99)) return false
      const assinante = t.slice(4)
      // fixo (começa por 2,3,4,5) fica fora — campanha é para celular
      if (assinante.charAt(0) !== '9') return false
      return true
    }

    // ---------- 3. reúne os candidatos ----------
    var candidatos = [] // {tel, nome, ultima}

    if (fonte === 'carteira') {
      // carteira dos vendedores escolhidos
      const donos = {}
      for (const v of vendedores) donos[String(v)] = true
      try {
        for (const c of app.findRecordsByFilter(
          app.findCollectionByNameOrId('carteira_contatos'),
          '',
          '',
          120000,
          0,
        )) {
          const u = String(c.get('vendedor_user') || '')
          if (Object.keys(donos).length > 0 && !donos[u]) continue
          candidatos.push({
            tel: String(c.get('telefone') || '').replace(/\D/g, ''),
            nome: String(c.get('nome') || ''),
            ultima: '',
          })
        }
      } catch (e6) {}
      // + leads em que eles são donos
      try {
        for (const l of app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          'fixture=false',
          '',
          8000,
          0,
        )) {
          const ow = String(l.get('owner_id') || '')
          if (Object.keys(donos).length > 0 && !donos[ow]) continue
          candidatos.push({
            tel: String(l.get('telefone') || '').replace(/\D/g, ''),
            nome: String(l.get('nome') || ''),
            ultima: '',
          })
        }
      } catch (e7) {}
    } else {
      // CRM (padrão)
      var leads = []
      try {
        leads = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          'fixture=false',
          '',
          8000,
          0,
        )
      } catch (e8) {
        out.ok = false
        out.erro = 'não consegui ler os leads'
        return e.json(200, out)
      }
      for (const l of leads) {
        const st = String(l.get('status') || '')
        // descartado e perdido fora por padrão
        if (st === 'descartado' || st === 'perdido') {
          out.exclusoes.descartados++
          continue
        }
        candidatos.push({
          tel: String(l.get('telefone') || '').replace(/\D/g, ''),
          nome: String(l.get('nome') || ''),
          ultima: String(l.get('ultima_mensagem_em') || l.get('updated') || ''),
        })
      }
    }

    // ---------- 4. aplica as exclusões ----------
    const vistos = {}
    var lista = []
    for (const c of candidatos) {
      const t = c.tel
      if (t === '') {
        out.exclusoes.telefone_invalido++
        continue
      }
      if (!valido(t)) {
        out.exclusoes.telefone_invalido++
        continue
      }
      // opt-out, interno, campanha recente — olhando todas as variantes
      var motivo = ''
      for (const v of variantes(t)) {
        if (fora[v]) motivo = 'opt_out'
        else if (internos[v]) motivo = 'internos'
        else if (recentes[v]) motivo = 'campanha_recente'
      }
      if (motivo !== '') {
        out.exclusoes[motivo]++
        continue
      }
      // repetido (com e sem o 9)
      var repetido = false
      for (const v of variantes(t)) {
        if (vistos[v]) repetido = true
      }
      if (repetido) {
        out.exclusoes.repetidos++
        continue
      }
      for (const v of variantes(t)) vistos[v] = true

      // nunca falou com a Haisan?
      var falouAlguma = false
      for (const v of variantes(t)) if (falou[v]) falouAlguma = true
      if (!falouAlguma) out.nunca_falaram++

      lista.push({ telefone: t, nome: c.nome, ultima: c.ultima })
    }

    // ---------- 5. "só os N mais recentes" ----------
    if (limiteRecentes > 0 && lista.length > limiteRecentes) {
      lista.sort(function (a, b) {
        return String(b.ultima).localeCompare(String(a.ultima))
      })
      const cortados = lista.length - limiteRecentes
      lista = lista.slice(0, limiteRecentes)
      out.aviso =
        'limitado aos ' + limiteRecentes + ' mais recentes (' + cortados + ' ficaram fora)'
    }

    out.total = lista.length
    out.destinos = lista

    // ---------- 6. confirmação da carteira ----------
    if (fonte === 'carteira' && out.nunca_falaram > 0) {
      out.exige_confirmacao = true
      out.aviso =
        out.nunca_falaram +
        ' contato(s) nunca falaram com a Haisan pelo sistema. É preciso confirmar "esses contatos conhecem a Haisan" para aprovar.'
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
