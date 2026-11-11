/// <reference path="../pb_data/types.d.ts" />
/**
 * POST /backend/v1/atendimento/config — grava uma VERSÃO nova da configuração
 * do atendimento automático (tela Atendimento; SPEC-3-005, painel da gestão).
 *
 * Só manage_atendimento. Nada é sobrescrito: cada salvamento cria a versão
 * seguinte, com quem salvou e quando — "voltar para uma versão" é salvar de
 * novo o conteúdo dela. O robô passa a usar a versão nova no minuto seguinte.
 *
 * Corpo: { ligado, usar_horario, dias[], hora_inicio, hora_fim, janela_min,
 *          textos{chave: texto}, faq[{pergunta, chaves[], resposta}],
 *          palavras{chave: [palavras]}, observacao }
 */
routerAdd(
  'POST',
  '/backend/v1/atendimento/config',
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

    // ---------- permissão ----------
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
        erro: 'só a gestão (manage_atendimento) altera o atendimento',
      })

    const body = e.requestInfo().body || {}
    const erros = []

    // ---------- horário ----------
    const reHora = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
    const horaIni = String(body.hora_inicio || '08:00')
    const horaFim = String(body.hora_fim || '17:30')
    if (!reHora.test(horaIni)) erros.push('Hora de início inválida (use HH:MM).')
    if (!reHora.test(horaFim)) erros.push('Hora de fim inválida (use HH:MM).')
    const dias = []
    if (Array.isArray(body.dias)) {
      for (const d0 of body.dias) {
        const d = Number(d0)
        if (d >= 0 && d <= 6 && Math.floor(d) === d && dias.indexOf(d) < 0) dias.push(d)
      }
    }
    dias.sort()
    const usarHorario = body.usar_horario === true
    if (usarHorario && dias.length === 0) erros.push('Escolha ao menos um dia da semana.')
    if (usarHorario && horaIni === horaFim)
      erros.push('Início e fim do horário não podem ser iguais.')
    const janela = Number(body.janela_min || 30)
    if (!(janela >= 5 && janela <= 1440) || Math.floor(janela) !== janela) {
      erros.push('A janela precisa ser um número inteiro de 5 a 1440 minutos.')
    }

    // ---------- textos ----------
    const textos = {}
    const tIn = body.textos && typeof body.textos === 'object' ? body.textos : {}
    for (const k in tIn) {
      if (!/^[a-z_]{1,40}$/.test(k)) continue
      const v = String(tIn[k] === null || tIn[k] === undefined ? '' : tIn[k])
      if (v.length > 2000) erros.push('O texto "' + k + '" passa de 2000 caracteres.')
      textos[k] = v
    }

    // ---------- FAQ ----------
    const faq = []
    const fIn = Array.isArray(body.faq) ? body.faq : []
    if (fIn.length > 50) erros.push('No máximo 50 perguntas no FAQ.')
    for (const f of fIn.slice(0, 50)) {
      if (!f) continue
      const pergunta = String(f.pergunta || '')
        .trim()
        .slice(0, 200)
      const brutas = Array.isArray(f.chaves) ? f.chaves : String(f.chaves || '').split(',')
      const chaves = []
      for (const c0 of brutas) {
        const c1 = String(c0 || '')
          .trim()
          .slice(0, 80)
        if (c1 !== '' && chaves.length < 30) chaves.push(c1)
      }
      const resposta = String(f.resposta || '').trim()
      if (chaves.length === 0 && resposta === '' && pergunta === '') continue
      if (chaves.length === 0 || resposta === '') {
        erros.push(
          'A pergunta "' +
            (pergunta || 'sem título') +
            '" precisa de palavras-chave e de resposta.',
        )
        continue
      }
      if (resposta.length > 2000)
        erros.push('A resposta de "' + pergunta + '" passa de 2000 caracteres.')
      faq.push({ pergunta: pergunta, chaves: chaves, resposta: resposta })
    }

    // ---------- palavras ----------
    const palavras = {}
    const pIn = body.palavras && typeof body.palavras === 'object' ? body.palavras : {}
    for (const k in pIn) {
      if (!/^[a-z_]{1,40}$/.test(k)) continue
      const brutas = Array.isArray(pIn[k]) ? pIn[k] : String(pIn[k] || '').split(',')
      const lista = []
      for (const p0 of brutas) {
        const p1 = String(p0 || '')
          .trim()
          .slice(0, 80)
        if (p1 !== '' && lista.length < 100) lista.push(p1)
      }
      palavras[k] = lista
    }

    if (erros.length > 0) return e.json(422, { ok: false, erros: erros })

    // ---------- próxima versão ----------
    const col = $app.findCollectionByNameOrId('atendimento_config')
    var maxV = 0
    try {
      const vs = $app.findRecordsByFilter(col, '', '', 500, 0)
      for (const v of vs) maxV = Math.max(maxV, Number(v.get('versao') || 0))
    } catch (eV) {}
    const r = new Record(col)
    r.set('versao', maxV + 1)
    r.set('ligado', body.ligado === true)
    r.set('usar_horario', usarHorario)
    r.set('dias', JSON.stringify(dias.length > 0 ? dias : [1, 2, 3, 4, 5]))
    r.set('hora_inicio', horaIni)
    r.set('hora_fim', horaFim)
    r.set('janela_min', janela)
    r.set('textos', JSON.stringify(textos))
    r.set('faq', JSON.stringify(faq))
    r.set('palavras', JSON.stringify(palavras))
    r.set('observacao', String(body.observacao || '').slice(0, 300))
    r.set('autor_id', uid)
    r.set('autor_nome', String(e.auth.get('name') || e.auth.get('email') || '').slice(0, 200))
    try {
      $app.save(r)
    } catch (eS) {
      // duas pessoas salvando no mesmo segundo: a versão já existe
      return e.json(409, {
        ok: false,
        erros: ['Outra pessoa salvou agora. Recarregue e tente de novo.'],
      })
    }
    console.log('atendimento_config: versão ' + (maxV + 1) + ' salva')
    return e.json(200, { ok: true, versao: maxV + 1 })
  },
  $apis.requireAuth(),
)
