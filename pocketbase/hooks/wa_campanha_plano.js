/// <reference path="../pb_data/types.d.ts" />
/**
 * QUANTIDADE, DURAÇÃO E CUSTO — CA-3-83 (SPEC-3-016, 06/11).
 *
 * **O que a gestão define:** quantos por dia (`teto_dia`), quantos por hora
 * (`ritmo_hora`), horário (`hora_inicio`/`hora_fim`), dias e quando começa.
 *
 * **As travas:**
 *   - padrão 200/dia e 20/hora (decisão de 05/11);
 *   - acima do padrão → **exige confirmação** (é risco de bloqueio);
 *   - **nunca acima do limite do número** (`limite_dia_meta`, padrão 250, que
 *     é o menor limite da Meta);
 *   - orçamento único do número em 24h soma campanha + apresentação +
 *     recontato — a apresentação passa na frente.
 *
 * **A prévia mostra:** duração estimada (dias e horas), custo estimado pela
 * categoria do modelo e pelo preço configurado na Administração — ou o aviso
 * "configure o preço na Administração" quando não houver.
 *
 * Rota:
 *   POST /backend/v1/campanhas/plano  → {conexao, total, teto_dia, ritmo_hora,
 *                                        hora_inicio, hora_fim, dias, categoria}
 */
routerAdd(
  'POST',
  '/backend/v1/campanhas/plano',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

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
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}

    const out = {
      ok: true,
      total: 0,
      teto_dia: 0,
      ritmo_hora: 0,
      teto_efetivo: 0,
      limite_numero: 0,
      exige_confirmacao: false,
      avisos: [],
      duracao_dias: 0,
      duracao_horas_por_dia: 0,
      custo_estimado: 0,
      custo_formatado: '',
      preco_unitario: 0,
      categoria: '',
      ja_enviado_hoje: 0,
      orcamento_restante: 0,
    }

    const conexaoId = String(body.conexao || '')
    out.total = Number(body.total || 0)
    out.categoria = String(body.categoria || 'marketing').toLowerCase()

    // ---------- limite do número ----------
    var limite = 250
    if (conexaoId !== '') {
      try {
        const cx = app.findRecordById('whatsapp_conexoes', conexaoId)
        const l = Number(cx.get('limite_dia_meta') || 0)
        if (l > 0) limite = l
      } catch (e1) {}
    }
    out.limite_numero = limite

    // ---------- pedidos x padrões ----------
    const PADRAO_TETO = 200
    const PADRAO_RITMO = 20
    var teto = Number(body.teto_dia || PADRAO_TETO)
    var ritmo = Number(body.ritmo_hora || PADRAO_RITMO)

    if (teto > PADRAO_TETO) {
      out.exige_confirmacao = true
      out.avisos.push(
        'teto de ' +
          teto +
          '/dia está acima do padrão de ' +
          PADRAO_TETO +
          '. Acima disso o risco de bloqueio do número sobe.',
      )
    }
    if (ritmo > PADRAO_RITMO) {
      out.exige_confirmacao = true
      out.avisos.push('ritmo de ' + ritmo + '/hora está acima do padrão de ' + PADRAO_RITMO + '.')
    }
    // nunca acima do limite do número
    if (teto > limite) {
      out.avisos.push(
        'o teto foi limitado a ' + limite + '/dia, que é o limite deste número na Meta.',
      )
      teto = limite
    }
    out.teto_dia = teto
    out.ritmo_hora = ritmo
    out.teto_efetivo = teto

    // ---------- orçamento único do número em 24h ----------
    var jaSaiu = 0
    if (conexaoId !== '') {
      try {
        const envs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_envios'),
          "conexao='" + conexaoId + "'",
          '',
          8000,
          0,
        )
        const agoraMs = new Date().getTime()
        for (const en of envs) {
          const m = String(en.get('motivo') || '')
          if (m !== 'campanha' && m !== 'apresentacao_vendedor' && m !== 'aviso_vendedor') continue
          const q = new Date(String(en.get('created') || '')).getTime()
          if (q > 0 && agoraMs - q < 86400000) jaSaiu++
        }
      } catch (e2) {}
    }
    out.ja_enviado_hoje = jaSaiu
    out.orcamento_restante = Math.max(0, limite - jaSaiu)
    if (out.orcamento_restante < teto) {
      out.avisos.push(
        'restam ' + out.orcamento_restante + ' mensagens no orçamento de hoje deste número.',
      )
    }

    // ---------- duração ----------
    const ini = String(body.hora_inicio || '07:00')
    const fim = String(body.hora_fim || '20:00')
    const dias =
      Array.isArray(body.dias) && body.dias.length > 0 ? body.dias : ['1', '2', '3', '4', '5', '6']
    // horas úteis por dia
    function paraMin(h) {
      const p = String(h).split(':')
      return Number(p[0] || 0) * 60 + Number(p[1] || 0)
    }
    const horasDia = Math.max(0, (paraMin(fim) - paraMin(ini)) / 60)
    out.duracao_horas_por_dia = Math.round(horasDia * 10) / 10

    if (out.total > 0 && teto > 0 && horasDia > 0) {
      const porDia = Math.min(teto, Math.floor(ritmo * horasDia))
      const diasNecessarios = porDia > 0 ? Math.ceil(out.total / porDia) : 0
      out.duracao_dias = Math.ceil(diasNecessarios / dias.length)
      out.envios_por_dia_util = porDia
    }

    // ---------- custo ----------
    var preco = 0
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('admin_config'),
        '',
        '',
        200,
        0,
      )
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg) {
        preco =
          out.categoria === 'utilidade' || out.categoria === 'utility'
            ? Number(cfg.get('preco_utilidade') || 0)
            : Number(cfg.get('preco_marketing') || 0)
      }
    } catch (e3) {}

    out.preco_unitario = preco
    if (preco > 0) {
      const custo = preco * out.total
      out.custo_estimado = custo
      out.custo_formatado = formatarReais(custo)
    } else {
      out.avisos.push('Configure o preço da mensagem na Administração para ver o custo estimado.')
    }

    function formatarReais(centavos) {
      const reais = centavos / 100
      const s = reais.toFixed(2)
      const partes = s.split('.')
      var inteiro = partes[0]
      var saida = ''
      var cont = 0
      for (var i = inteiro.length - 1; i >= 0; i--) {
        saida = inteiro.charAt(i) + saida
        cont++
        if (cont % 3 === 0 && i > 0) saida = '.' + saida
      }
      return 'R$ ' + saida + ',' + partes[1]
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
