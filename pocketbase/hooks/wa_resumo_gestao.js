/// <reference path="../pb_data/types.d.ts" />
/**
 * RESUMO DOS LEADS PARA A GESTÃO — CA-3-49 (SPEC-3-010, 06/11).
 *
 * **O que muda para a gestão:** em vez de receber um aviso por lead (que vira
 * ruído e ninguém lê), ela recebe **um resumo** nos horários escolhidos, com:
 *   - quantos leads entraram;
 *   - quantos foram distribuídos;
 *   - **quantos precisam de ação** (sem dono, dono suspenso, conflito).
 *
 * **Configuração:** vem de `admin_config` (tela Administração): `resumo_ativo`,
 * `resumo_horarios`, `resumo_dias` e `resumo_destinatarios`.
 *
 * **Três travas:**
 *   1. só envia se estiver **ligado** na Administração (nasce desligado);
 *   2. só no **horário** e nos **dias** configurados;
 *   3. só para **número da equipe** — destinatário fora da lista é recusado.
 *
 * **Uma vez por horário**, não a cada rodada do cron: dedupe por dia+horário.
 *
 * Cron: a cada 10 minutos (mesma cadência dos outros), decidindo internamente.
 */
cronAdd('wa_resumo_gestao', '*/10 * * * *', () => {
  try {
    const app = $app

    // ---------- relógio de Brasília ----------
    const agoraBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    const hhmm =
      String(agoraBR.getUTCHours()).padStart(2, '0') +
      ':' +
      String(agoraBR.getUTCMinutes()).padStart(2, '0')
    const diaSem = String(agoraBR.getUTCDay())
    const hoje = agoraBR.toISOString().slice(0, 10)

    // ---------- configuração (versão mais recente) ----------
    var cfg = null
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('admin_config'),
        '',
        '',
        200,
        0,
      )
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
    } catch (e0) {
      return
    }
    if (!cfg) return
    if (cfg.get('resumo_ativo') !== true) return

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

    // ---------- horário e dia ----------
    const horarios = lerL(cfg.get('resumo_horarios'))
    if (!Array.isArray(horarios) || horarios.indexOf(hhmm) < 0) return
    const dias = lerL(cfg.get('resumo_dias'))
    if (Array.isArray(dias) && dias.length > 0 && dias.indexOf(diaSem) < 0) return

    const destinos = lerL(cfg.get('resumo_destinatarios'))
    if (!Array.isArray(destinos) || destinos.length === 0) return

    // ---------- números internos (a lista real) ----------
    const internos = {}
    try {
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
    } catch (e1) {}

    // ---------- números de cada pessoa escolhida ----------
    const telefones = []
    try {
      for (const uid of destinos) {
        var tel = ''
        try {
          const u = app.findRecordById('users', String(uid))
          tel = String(u.get('telefone') || u.get('phone') || '').replace(/[^0-9]/g, '')
        } catch (eU) {}
        // se o usuário não tem telefone, tenta a conexão dele
        if (tel === '') {
          try {
            const cxs = app.findRecordsByFilter(
              app.findCollectionByNameOrId('whatsapp_conexoes'),
              "vendedor_user='" + String(uid) + "'",
              '',
              3,
              0,
            )
            if (cxs.length > 0) {
              tel = String(cxs[0].get('numero') || '').replace(/[^0-9]/g, '')
            }
          } catch (eC) {}
        }
        // e ainda: o número interno cadastrado com o NOME da pessoa.
        // O cadastro de números internos NÃO tem `user_id` — só rótulo e
        // número. Procurar por user_id devolvia vazio e o resumo nunca saía
        // ("nenhum destinatario com numero da equipe" no log de 06/11).
        if (tel === '') {
          var nomePessoa = ''
          try {
            const u = app.findRecordById('users', String(uid))
            nomePessoa = String(u.get('name') || u.get('email') || '').toLowerCase()
          } catch (eN) {}
          if (nomePessoa !== '') {
            try {
              const is = app.findRecordsByFilter(
                app.findCollectionByNameOrId('whatsapp_numeros_internos'),
                '',
                '',
                300,
                0,
              )
              const primeiro = nomePessoa.split(' ')[0]
              for (const i of is) {
                const rot = String(i.get('rotulo') || '').toLowerCase()
                if (rot.indexOf(primeiro) >= 0) {
                  tel = String(i.get('numero') || '').replace(/[^0-9]/g, '')
                  break
                }
              }
            } catch (eI2) {}
          }
        }
        if (tel === '') continue
        if (!internos[tel]) continue // só número da equipe
        telefones.push(tel)
      }
    } catch (e2) {}

    if (telefones.length === 0) {
      console.log('wa_resumo_gestao: nenhum destinatario com numero da equipe')
      return
    }

    // ---------- os números do resumo ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e3) {}
    var recebidos = 0
    var distribuidos = 0
    var semDono = 0
    for (const l of leads) {
      const criado = String(l.get('created') || '').slice(0, 10)
      if (criado === hoje) recebidos++
      const dono = String(l.get('owner_id') || '')
      if (dono === '') semDono++
      else distribuidos++
    }
    var naFila = 0
    try {
      naFila = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        'resolvido=false && fixture=false',
        '',
        2000,
        0,
      ).length
    } catch (e4) {}
    const precisam = semDono + naFila

    const texto =
      '*Haisan — resumo do dia* (' +
      hoje +
      ')\n' +
      'Recebidos hoje: *' +
      recebidos +
      '*\n' +
      'Com vendedor: *' +
      distribuidos +
      '*\n' +
      'Precisam de ação: *' +
      precisam +
      '*\n' +
      (semDono > 0 ? '· sem dono: ' + semDono + '\n' : '') +
      (naFila > 0 ? '· na fila da gestão: ' + naFila + '\n' : '') +
      'Veja em Gestão de leads.'

    // ---------- enfileira um por destinatário, uma vez por dia+horário ----------
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    var conexaoCentral = ''
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) conexaoCentral = cxs[0].id
    } catch (e5) {}
    if (conexaoCentral === '') return

    var enviados = 0
    for (const tel of telefones) {
      const chave = 'resumo_gestao|' + hoje + '|' + hhmm + '|' + tel
      var jaTem = false
      try {
        const ex = app.findRecordsByFilter(colEnv, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ex && ex.length > 0) jaTem = true
      } catch (e6) {}
      if (jaTem) continue
      try {
        const env = new Record(colEnv)
        env.set('conexao', conexaoCentral)
        env.set('destino_telefone', tel)
        env.set('motivo', 'resumo_gestao')
        env.set('modo', 'texto')
        env.set('texto', texto)
        env.set('legenda', '')
        env.set('autor_user', '')
        env.set('criado_por', 'cron')
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('fixture', false)
        env.set('dedupe_key', chave)
        app.save(env)
        enviados++
      } catch (e7) {
        console.log('wa_resumo_gestao: falhou enfileirar -> ' + String(e7).slice(0, 120))
      }
    }
    if (enviados > 0) {
      console.log('wa_resumo_gestao: ' + enviados + ' resumo(s) enfileirado(s) as ' + hhmm)
    }
  } catch (eTop) {}
})
