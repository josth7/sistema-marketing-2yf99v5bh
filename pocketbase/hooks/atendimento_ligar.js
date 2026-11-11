/// <reference path="../pb_data/types.d.ts" />
/**
 * POST /backend/v1/atendimento/ligar — liga ou desliga o atendimento
 * automático com um clique (botão da tela Conversas e da tela Atendimento).
 *
 * Só manage_atendimento. Copia a versão atual com `ligado` trocado e grava
 * como versão nova (fica no histórico quem desligou e quando). O robô respeita
 * no minuto seguinte: desligado, não responde ninguém.
 *
 * Corpo: { ligado: true | false, origem?: 'conversas' | 'atendimento' }
 */
routerAdd(
  'POST',
  '/backend/v1/atendimento/ligar',
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
    const uid = String(e.auth.id)

    var pode = false
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
        if (Array.isArray(a) && a.indexOf('manage_atendimento') >= 0) pode = true
      }
    } catch (eG) {}
    if (!pode)
      return e.json(403, {
        ok: false,
        erro: 'só a gestão (manage_atendimento) liga ou desliga o robô',
      })

    const body = e.requestInfo().body || {}
    if (body.ligado !== true && body.ligado !== false) {
      return e.json(422, { ok: false, erro: 'informe ligado: true ou false' })
    }
    const origem = String(body.origem || '') === 'conversas' ? 'tela Conversas' : 'tela Atendimento'

    const col = $app.findCollectionByNameOrId('atendimento_config')
    var atual = null
    try {
      const vs = $app.findRecordsByFilter(col, '', '', 500, 0)
      for (const v of vs) {
        if (!atual || Number(v.get('versao') || 0) > Number(atual.get('versao') || 0)) atual = v
      }
    } catch (eV) {}

    const r = new Record(col)
    const versao = (atual ? Number(atual.get('versao') || 0) : 0) + 1
    r.set('versao', versao)
    if (atual) {
      const campos = [
        'usar_horario',
        'dias',
        'hora_inicio',
        'hora_fim',
        'janela_min',
        'textos',
        'faq',
        'palavras',
      ]
      for (const c of campos) r.set(c, atual.get(c))
    } else {
      // sem configuração ainda: o robô usa os textos padrão do código
      r.set('usar_horario', false)
      r.set('dias', JSON.stringify([1, 2, 3, 4, 5]))
      r.set('hora_inicio', '08:00')
      r.set('hora_fim', '17:30')
      r.set('janela_min', 30)
      r.set('textos', '{}')
      r.set('faq', '[]')
      r.set('palavras', '{}')
    }
    r.set('ligado', body.ligado)
    r.set('observacao', (body.ligado ? 'Ligado' : 'Desligado') + ' pelo botão da ' + origem)
    r.set('autor_id', uid)
    r.set('autor_nome', String(e.auth.get('name') || e.auth.get('email') || '').slice(0, 200))
    try {
      $app.save(r)
    } catch (eS) {
      return e.json(409, {
        ok: false,
        erro: 'Outra pessoa mudou agora. Recarregue e tente de novo.',
      })
    }
    console.log(
      'atendimento_ligar: ' + (body.ligado ? 'LIGADO' : 'DESLIGADO') + ' (versão ' + versao + ')',
    )
    return e.json(200, { ok: true, ligado: body.ligado, versao: versao })
  },
  $apis.requireAuth(),
)
