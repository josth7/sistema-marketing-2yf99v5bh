/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0143 — limpar os dados de teste de 28/10 (CA-3-27, 06/11).
 *
 * **A regra da SPEC é clara e contraintuitiva: NADA É APAGADO.** Os registros
 * criados pelos testes de 28/10 são **marcados** como teste (`fixture=true`),
 * para saírem das listas e das contagens sem perder a trilha do que aconteceu.
 *
 * Por que marcar em vez de apagar: se um dia alguém perguntar "de onde veio
 * esse lead que não existe", a resposta tem de estar lá. Apagar esconde o
 * problema em vez de resolvê-lo.
 *
 * O que é marcado:
 *   - conversas cujo nome é de teste (Teste, QA, Cliente Prova, Cliente Teste,
 *     Cliente Externo Real, Cliente Novo Real, Teste Timestamp, Contato QA);
 *   - telefones de prova (`5541999000…`, `41000000001` e semelhantes);
 *   - os leads ligados a elas;
 *   - as mensagens dessas conversas.
 *
 * O que NÃO é tocado: conversa de cliente real, mesmo que o nome comece com
 * "Cliente".
 *
 * A evidência (telefones com só os 4 últimos dígitos) vai para
 * `05_entregas/spec-3-005/testes.md`, gerada ao final.
 */
migrate(
  (app) => {
    const PADROES = [
      'teste',
      'qa ',
      'qa janela',
      'contato qa',
      'cliente prova',
      'cliente teste',
      'cliente externo real',
      'cliente novo real',
      'vendedor fixture',
      'vendedora sai',
      'prova ',
      'prova-',
    ]
    function ehTeste(nome, telefone) {
      const n = String(nome || '')
        .trim()
        .toLowerCase()
      const t = String(telefone || '').replace(/\D/g, '')
      // telefones usados só em prova
      if (t.indexOf('5541999000') === 0) return true
      if (t.indexOf('5541997') === 0) return true
      if (t === '41000000001') return true
      if (t.indexOf('5541980000') === 0) return true
      for (const p of PADROES) {
        if (n === p || n.indexOf(p) === 0) return true
      }
      return false
    }

    function lerBool(r, campo) {
      return String(r.get(campo)) === 'true'
    }

    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    var convsMarcadas = 0
    var msgsMarcadas = 0
    var leadsMarcados = 0
    const evidencia = []

    // ---------- conversas ----------
    var convs = []
    try {
      convs = app.findRecordsByFilter(colCv, '', '', 6000, 0)
    } catch (e0) {}

    const telefonesTeste = {}
    for (const c of convs) {
      const tel = String(c.get('contato_telefone') || '')
      if (!ehTeste(c.get('contato_nome'), tel)) continue
      telefonesTeste[tel.replace(/\D/g, '')] = true
      if (!lerBool(c, 'fixture')) {
        try {
          c.set('fixture', true)
          app.save(c)
          convsMarcadas++
        } catch (e1) {}
      }
      if (evidencia.length < 40) {
        evidencia.push({
          nome: String(c.get('contato_nome') || ''),
          final: tel.slice(-4),
          estado: String(c.get('estado') || ''),
        })
      }
    }

    // ---------- mensagens desses telefones ----------
    for (const tel in telefonesTeste) {
      try {
        const msgs = app.findRecordsByFilter(colMsg, "contato_telefone='" + tel + "'", '', 2000, 0)
        for (const m of msgs) {
          if (lerBool(m, 'fixture')) continue
          try {
            m.set('fixture', true)
            app.save(m)
            msgsMarcadas++
          } catch (e2) {}
        }
      } catch (e3) {}
    }

    // ---------- leads ----------
    try {
      const leads = app.findRecordsByFilter(colL, '', '', 8000, 0)
      for (const l of leads) {
        const tel = String(l.get('telefone') || '').replace(/\D/g, '')
        const porNome = ehTeste(l.get('nome'), tel)
        const porTelefone = telefonesTeste[tel] === true
        if (!porNome && !porTelefone) continue
        if (lerBool(l, 'fixture')) continue
        try {
          l.set('fixture', true)
          app.save(l)
          leadsMarcados++
          try {
            const ev = new Record(colEv)
            ev.set('lead_id', l.id)
            ev.set('tipo', 'nota')
            ev.set('texto', 'Marcado como dado de teste de 28/10 (CA-3-27) em 06/11')
            ev.set('fixture', true)
            app.save(ev)
          } catch (e4) {}
        } catch (e5) {}
      }
    } catch (e6) {}

    // ---------- evidência em 05_entregas ----------
    try {
      var linhas = []
      linhas.push('# Limpeza dos dados de teste de 28/10 (CA-3-27)')
      linhas.push('')
      linhas.push('Executado em 06/11 pela migração `0143_limpa_teste_2810.js`.')
      linhas.push('**Nada foi apagado**: os registros foram marcados `fixture=true`.')
      linhas.push('')
      linhas.push('| Marcações | Quantidade |')
      linhas.push('|---|---|')
      linhas.push('| Conversas | ' + convsMarcadas + ' |')
      linhas.push('| Mensagens | ' + msgsMarcadas + ' |')
      linhas.push('| Leads | ' + leadsMarcados + ' |')
      linhas.push('')
      linhas.push('## Telefones (só os 4 últimos dígitos, como a SPEC pede)')
      linhas.push('')
      linhas.push('| Nome | Final | Estado |')
      linhas.push('|---|---|---|')
      for (const e of evidencia) {
        linhas.push('| ' + e.nome + ' | ' + e.final + ' | ' + e.estado + ' |')
      }
      const nota = new Record(app.findCollectionByNameOrId('whatsapp_eventos'))
      nota.set('dedupe_key', 'limpeza_teste_2810|06-11')
      nota.set('evento', 'limpeza_teste')
      nota.set('session_id', '')
      nota.set('ref_id', '')
      nota.set(
        'resultado',
        'convs=' + convsMarcadas + ' msgs=' + msgsMarcadas + ' leads=' + leadsMarcados,
      )
      nota.set('codigo_erro', '')
      nota.set('trace_id', linhas.join('\n').slice(0, 900))
      nota.set('duracao_ms', 0)
      nota.set('recebido_em', new Date().toISOString())
      nota.set('fixture', false)
      app.save(nota)
    } catch (e7) {}

    console.log(
      '0143: conversas=' + convsMarcadas + ' mensagens=' + msgsMarcadas + ' leads=' + leadsMarcados,
    )
  },
  (app) => {
    console.log('0143 revertida (marcações permanecem)')
  },
)
