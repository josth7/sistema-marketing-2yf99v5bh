/// <reference path="../pb_data/types.d.ts" />
/**
 * GET /backend/v1/atendimento/config — governança do atendimento automático
 * (tela Atendimento e botão da tela Conversas; SPEC-3-005, painel da gestão).
 *
 * Quem pode: quem lê conversas (read_conversas) vê se o robô está ligado;
 * quem tem manage_atendimento vê também a configuração completa, as versões,
 * os números da equipe e as últimas respostas do robô.
 *
 * Só leitura. Nunca devolve segredo.
 */
routerAdd(
  'GET',
  '/backend/v1/atendimento/config',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const uid = String(e.auth.id)

    // ---------- ações da pessoa (grants ativos) ----------
    const acoes = []
    try {
      const colG = $app.findCollectionByNameOrId('access_grants')
      const gs = $app.findRecordsByFilter(colG, "user_id='" + uid + "' && revoked_at=''", '', 50, 0)
      const hoje = new Date().toISOString().slice(0, 10)
      for (const g of gs) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        var a = []
        try {
          const raw = g.get('actions')
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            a = JSON.parse(String.fromCharCode.apply(null, raw))
          } else if (typeof raw === 'string') {
            a = JSON.parse(raw)
          } else {
            a = raw || []
          }
        } catch (eA) {
          a = []
        }
        if (!Array.isArray(a)) a = []
        for (const x of a) acoes.push(String(x))
      }
    } catch (eG) {}
    const podeAlterar = acoes.indexOf('manage_atendimento') >= 0
    const podeVer = podeAlterar || acoes.indexOf('read_conversas') >= 0
    if (!podeVer) return e.json(403, { ok: false, erro: 'sem permissão para o atendimento' })

    // ---------- versões ----------
    const ler = function (rec) {
      const j = function (campo, padrao) {
        try {
          const s = String(rec.get(campo) || '')
          return s === '' ? padrao : JSON.parse(s)
        } catch (eJ) {
          return padrao
        }
      }
      return {
        versao: Number(rec.get('versao') || 0),
        ligado: rec.get('ligado') === true,
        usar_horario: rec.get('usar_horario') === true,
        dias: j('dias', [1, 2, 3, 4, 5]),
        hora_inicio: String(rec.get('hora_inicio') || '08:00'),
        hora_fim: String(rec.get('hora_fim') || '17:30'),
        janela_min: Number(rec.get('janela_min') || 30),
        textos: j('textos', {}),
        faq: j('faq', []),
        palavras: j('palavras', {}),
        observacao: String(rec.get('observacao') || ''),
        autor_nome: String(rec.get('autor_nome') || ''),
        criado: String(rec.get('created') || ''),
      }
    }
    // ---------- CA-3-88/CA-3-92 (11/11): só a config DA EMPRESA ATIVA ----------
    // BUG CORRIGIDO: esta rota pegava TODAS as configs e escolhia a de maior
    // versão. Quando a Gol 7 nasceu (v12, vazia), o painel da Haisan passou a
    // mostrar a config da Gol 7 — 0 textos, 0 FAQ, 0 palavras. A Anézia abriria
    // o painel e veria tudo vazio, achando que a Haisan perdeu a configuração.
    var empresaAtivaCfg = ''
    try {
      var pedCfg = String(e.request.header.get('X-Empresa') || '')
      var gsCfg = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empCfg = []
      var donoCfg = false
      for (const gCfg of gsCfg) {
        var eGC = ''
        try {
          eGC = String(gCfg.get('empresa') || '')
        } catch (eGCx) {}
        if (eGC !== '' && empCfg.indexOf(eGC) < 0) empCfg.push(eGC)
        var scCfg = []
        try {
          const rSC = gCfg.get('scope_accounts')
          scCfg =
            Array.isArray(rSC) && rSC.length > 0 && typeof rSC[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rSC))
              : typeof rSC === 'string'
                ? JSON.parse(rSC)
                : rSC || []
        } catch (eSCx) {}
        if (Array.isArray(scCfg) && scCfg.indexOf('*') >= 0) donoCfg = true
      }
      if (pedCfg !== '') {
        if (!donoCfg && empCfg.indexOf(pedCfg) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtivaCfg = pedCfg
      } else if (empCfg.length > 0) {
        empresaAtivaCfg = empCfg[0]
      } else {
        const esCfg = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esCfg.length > 0) empresaAtivaCfg = esCfg[0].id
      }
    } catch (eEmpCfg) {}

    var versoes = []
    try {
      const col = $app.findCollectionByNameOrId('atendimento_config')
      const filtroCfg = empresaAtivaCfg !== '' ? "empresa='" + empresaAtivaCfg + "'" : 'empresa=""'
      versoes = $app.findRecordsByFilter(col, filtroCfg, '', 500, 0)
      // empresa sem config própria? usa a da Haisan (a única com conteúdo hoje)
      if (versoes.length === 0 && empresaAtivaCfg !== '') {
        versoes = $app.findRecordsByFilter(col, "empresa!='" + empresaAtivaCfg + "'", '', 500, 0)
      }
    } catch (eC) {
      versoes = []
    }
    versoes.sort(function (x, y) {
      return Number(y.get('versao') || 0) - Number(x.get('versao') || 0)
    })
    const atual = versoes.length > 0 ? ler(versoes[0]) : null

    // ---------- está respondendo agora? (Brasília, UTC-3) ----------
    const agoraBR = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const hhmm =
      ('0' + agoraBR.getUTCHours()).slice(-2) + ':' + ('0' + agoraBR.getUTCMinutes()).slice(-2)
    var dentro = true
    if (atual && atual.usar_horario) {
      var hojeOk = false
      if (Array.isArray(atual.dias)) {
        for (const d of atual.dias) if (Number(d) === agoraBR.getUTCDay()) hojeOk = true
      }
      const ini = atual.hora_inicio
      const fim = atual.hora_fim
      const naHora = ini <= fim ? hhmm >= ini && hhmm < fim : hhmm >= ini || hhmm < fim
      dentro = hojeOk && naHora
    }
    const ligado = atual ? atual.ligado : true

    const out = {
      ok: true,
      pode_alterar: podeAlterar,
      ligado: ligado,
      dentro_do_horario: dentro,
      respondendo_agora: ligado && dentro,
      hora_brasilia: hhmm,
    }
    if (!podeAlterar) return e.json(200, out)

    out.atual = atual
    out.versoes = versoes.slice(0, 20).map(ler)

    // ---------- números da equipe (o robô nunca responde) ----------
    out.internos = []
    try {
      const colI = $app.findCollectionByNameOrId('whatsapp_numeros_internos')
      const is = $app.findRecordsByFilter(colI, '', '', 300, 0)
      for (const it of is) {
        out.internos.push({
          id: it.id,
          numero: String(it.get('numero') || ''),
          rotulo: String(it.get('rotulo') || ''),
        })
      }
    } catch (eI) {}

    // ---------- últimas respostas do robô (2 dias) ----------
    out.ultimas = []
    try {
      const colE = $app.findCollectionByNameOrId('whatsapp_envios')
      const desde = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ')
      const envs = $app.findRecordsByFilter(
        colE,
        "motivo='ia_resposta' && fixture=false && created >= '" + desde + "'",
        '',
        300,
        0,
      )
      envs.sort(function (x, y) {
        return String(y.get('created') || '').localeCompare(String(x.get('created') || ''))
      })
      for (const en of envs.slice(0, 40)) {
        var leadNome = ''
        const lid = String(en.get('lead') || '')
        if (lid !== '') {
          try {
            leadNome = String($app.findRecordById('crm_leads', lid).get('nome') || '')
          } catch (eL) {}
        }
        out.ultimas.push({
          id: en.id,
          criado: String(en.get('created') || ''),
          estado: String(en.get('estado') || ''),
          erro: String(en.get('ultimo_erro') || ''),
          texto: String(en.get('texto') || '').slice(0, 400),
          lead_nome: leadNome,
        })
      }
    } catch (eE) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
