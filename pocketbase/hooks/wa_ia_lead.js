/// <reference path="../pb_data/types.d.ts" />
/**
 * IA NO LEAD — resumo, nota e humor (03/11). Card CA-3-23.
 *
 * O que faz: depois de cada conversa, o lead ganha
 *   - `ia_resumo`   → resumo do que o CLIENTE disse e pediu
 *   - `ia_nota`     → 0 a 100 (interesse, poder de compra, urgência, perfil)
 *   - `ia_humor`    → positivo / neutro / negativo / raiva / ameaca
 *   - `ia_justificativa` → por que daquela nota
 *
 * Por que importa: o vendedor tem 40 conversas esperando. Sem nota, todas
 * parecem iguais e ele atende na ordem da lista. Com nota, ele ataca primeiro
 * quem tem mais chance de comprar.
 *
 * USA O PROMPT EXATO do documento de 22/10 (artifacts/agente-atendimento-haisan.md),
 * inclusive a regra anti-alucinação: o resumo não persiste texto fora do
 * escopo, senão contamina as próximas respostas.
 *
 * ONDE RODA: cron `wa_ia_lead` (5 min). Pega conversas com mensagem nova desde
 * o último cálculo (comparando `ia_calculado_em`), não reprocessa as mesmas.
 * Também expõe POST /backend/v1/crm/leads/{id}/ia para recalcular na hora.
 *
 * JSVM: tudo INLINE nos callbacks ($ai.chat é hook-only).
 */

// ==================== RECALCULAR UM LEAD NA HORA ====================
routerAdd(
  'POST',
  '/backend/v1/crm/leads/{id}/ia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const idLead = String(e.request.pathValue('id') || '')
    if (idLead === '') return e.json(400, { ok: false, erro: 'lead não informado' })

    var lead = null
    try {
      lead = $app.findRecordById('crm_leads', idLead)
    } catch (e0) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }

    // ---------- mensagens do lead ----------
    const telefone = String(lead.get('telefone') || '').replace(/[^0-9]/g, '')
    var msgs = []
    try {
      const colM = $app.findCollectionByNameOrId('whatsapp_mensagens')
      msgs = $app.findRecordsByFilter(colM, "contato_telefone='" + telefone + "'", '', 40, 0)
    } catch (e1) {}
    msgs.sort(function (a, b) {
      return String(a.get('created') || '').localeCompare(String(b.get('created') || ''))
    })
    if (msgs.length === 0) {
      return e.json(200, { ok: false, erro: 'sem conversa para analisar' })
    }

    // ---------- monta a conversa (só o que o cliente disse) ----------
    var dialogo = ''
    var quantas = 0
    for (const m of msgs) {
      const dir = String(m.get('direcao') || '')
      const txt = String(m.get('texto') || '').trim()
      if (txt === '') continue
      dialogo += (dir === 'entrada' ? 'CLIENTE: ' : 'HAISAN: ') + txt.slice(0, 400) + '\n'
      quantas++
    }
    if (dialogo === '') {
      return e.json(200, { ok: false, erro: 'conversa sem texto' })
    }

    // ---------- 1. NOTA (prompt exato do documento) ----------
    var nota = null
    var justificativa = ''
    try {
      const r1 = $ai.chat({
        model: 'fast',
        messages: [
          {
            role: 'system',
            content:
              'Você é um analista de vendas da HAISAN, fábrica de MÓVEIS para salão de beleza, barbearia e clínica de estética. ' +
              'Avalie o lead SEMPRE como comprador de móveis desse setor — nunca invente outro ramo.\n' +
              'Com base na conversa, atribua uma nota de 0 a 100 para o lead.\n' +
              'Critérios:\n' +
              '- Interesse demonstrado (0-25)\n' +
              '- Poder de compra aparente (0-25)\n' +
              '- Urgencia da necessidade (0-25)\n' +
              '- Adequacao ao perfil ideal (0-25)\n' +
              'Responda APENAS com um JSON: {"nota": <numero>, "justificativa": "<texto curto>"}',
          },
          { role: 'user', content: dialogo.slice(0, 4000) },
        ],
      })
      const txt = String(r1.choices[0].message.content || '')
      const mN = txt.match(/\{[\s\S]*\}/)
      if (mN) {
        const obj = JSON.parse(mN[0])
        if (typeof obj.nota === 'number') nota = Math.max(0, Math.min(100, Math.round(obj.nota)))
        justificativa = String(obj.justificativa || '').slice(0, 500)
      }
    } catch (eN) {}

    // ---------- 2. HUMOR (prompt exato do documento) ----------
    var humor = ''
    var score = null
    // usa a ÚLTIMA mensagem do cliente (é o que o documento pede)
    var ultimaCliente = ''
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (
        String(msgs[i].get('direcao')) === 'entrada' &&
        String(msgs[i].get('texto') || '').trim() !== ''
      ) {
        ultimaCliente = String(msgs[i].get('texto')).slice(0, 800)
        break
      }
    }
    try {
      const r2 = $ai.chat({
        model: 'fast',
        messages: [
          {
            role: 'system',
            content:
              'Você é um analista de sentimento. Analise o tom emocional da ultima mensagem do cliente.\n' +
              'Classifique em uma das categorias: positivo, neutro, negativo, raiva, ameaca.\n' +
              'Atribua um score de 0 a 1 (0 = muito positivo, 1 = muito negativo/ameaca).\n' +
              'Responda APENAS com um JSON: {"sentimento": "<categoria>", "score": <numero>}',
          },
          { role: 'user', content: ultimaCliente !== '' ? ultimaCliente : dialogo.slice(-800) },
        ],
      })
      const txt2 = String(r2.choices[0].message.content || '')
      const mH = txt2.match(/\{[\s\S]*\}/)
      if (mH) {
        const obj2 = JSON.parse(mH[0])
        const cat = String(obj2.sentimento || '')
          .toLowerCase()
          .trim()
        const validos = ['positivo', 'neutro', 'negativo', 'raiva', 'ameaca']
        if (validos.indexOf(cat) >= 0) humor = cat
        if (typeof obj2.score === 'number') score = Math.max(0, Math.min(1, obj2.score))
      }
    } catch (eH) {}

    // ---------- 3. RESUMO (prompt exato, com anti-alucinação) ----------
    var resumo = ''
    try {
      const r3 = $ai.chat({
        model: 'fast',
        messages: [
          {
            role: 'system',
            content:
              'Resuma a conversa de forma concisa, focando no que o LEAD/CLIENTE disse e perguntou. Destaque:\n' +
              '- O que o lead pediu, perguntou ou expressou interesse\n' +
              '- Dados que o lead informou (nome, contato, preferencias)\n' +
              '- Decisoes que o lead tomou (aceitou/recusou ofertas, escolheu opcoes)\n' +
              '- Pontos de atencao e proximos passos do lado do lead\n' +
              'Maximo 200 palavras.\n' +
              'REGRA CRITICA — ANTI-ALUCINACAO PERSISTIDA:\n' +
              '- Resuma APENAS o que efetivamente faz parte do contexto do produto/servico (móveis para salão de beleza, barbearia e clínica de estética).\n' +
              '- Se a HAISAN em alguma resposta SAIU DO TOPICO ou disse algo claramente fora do escopo, NAO inclua isso no resumo. Esses trechos sao alucinacoes e NAO DEVEM ser persistidos.\n' +
              '- Se a conversa inteira parece off-topic, apenas resuma "Cliente iniciou contato, ainda sem topico definido."\n' +
              'IMPORTANTE: Use apenas texto puro, sem markdown.',
          },
          { role: 'user', content: dialogo.slice(0, 5000) },
        ],
      })
      resumo = String(r3.choices[0].message.content || '')
        .trim()
        .slice(0, 2000)
    } catch (eR) {}

    // ---------- grava ----------
    // RN-192 (10/11): este processo levou SEGUNDOS (três chamadas de IA).
    // O `lead` foi lido ANTES. Salvar o objeto inteiro devolve ao banco o
    // `owner_id` daquele momento e APAGA o dono que o rodízio gravou no meio —
    // foi o caso de 09/11 22h49 (dono gravado às 22h50, apagado 4 s depois).
    //
    // Aqui se RELÊ o lead e grava SÓ os campos de IA.
    var gravou = false
    try {
      const leadAtual = $app.findRecordById('crm_leads', lead.id)
      if (nota !== null) leadAtual.set('ia_nota', nota)
      if (humor !== '') leadAtual.set('ia_humor', humor)
      if (resumo !== '') leadAtual.set('ia_resumo', resumo.slice(0, 2000))
      if (justificativa !== '') leadAtual.set('ia_justificativa', justificativa)
      if (score !== null) leadAtual.set('ia_humor_score', score)
      leadAtual.set('ia_calculado_em', new Date().toISOString())
      try {
        leadAtual.set('ia_atualizado_em', new Date().toISOString())
      } catch (eU) {}
      $app.save(leadAtual)
      gravou = true
    } catch (eSave) {
      return e.json(500, {
        ok: false,
        erro: 'falha ao gravar: ' + String(eSave).slice(0, 200),
      })
    }

    // ameaça (procon/processo) avisa a equipe na trilha
    if (humor === 'ameaca') {
      try {
        const colEv = $app.findCollectionByNameOrId('crm_lead_events')
        const ev = new Record(colEv)
        ev.set('lead_id', lead.id)
        ev.set('tipo', 'nota')
        ev.set(
          'texto',
          'ATENÇÃO: cliente com tom de ameaça (procon/processo). Revisar o atendimento.',
        )
        ev.set('fixture', false)
        $app.save(ev)
      } catch (eEv) {}
    }

    return e.json(200, {
      ok: gravou,
      lead: lead.id,
      mensagens_analisadas: quantas,
      nota: nota,
      humor: humor,
      humor_score: score,
      justificativa: justificativa,
      resumo: resumo,
    })
  },
  $apis.requireAuth(),
)

// ==================== CRON: calcula para quem mudou ====================
cronAdd('wa_ia_lead', '*/5 * * * *', () => {
  // 20 por rodada (03/11): com 3 a fila de 144 leads com conversa levaria 4
  // horas. Com 20 sai em ~40 min. Custo segue baixo: só entram leads cuja
  // conversa mudou desde o último cálculo.
  const LIMITE = 20

  try {
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const colM = $app.findCollectionByNameOrId('whatsapp_mensagens')

    var leads = []
    try {
      leads = $app.findRecordsByFilter(colL, 'fixture=false', '', 3000, 0)
    } catch (e0) {
      return
    }

    // só quem tem conversa com mensagem do cliente e está em jogo
    var candidatos = []
    for (const l of leads) {
      const st = String(l.get('status') || '')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      const tel = String(l.get('telefone') || '').replace(/[^0-9]/g, '')
      if (tel.length < 10) continue
      const calc = String(l.get('ia_calculado_em') || '')
      const upd = String(l.get('updated') || '')
      // nunca calculado, ou mudou depois do cálculo
      if (calc === '' || (upd !== '' && upd > calc)) candidatos.push(l)
    }
    if (candidatos.length === 0) return

    // mais recentes primeiro
    candidatos.sort(function (a, b) {
      return String(b.get('updated') || '').localeCompare(String(a.get('updated') || ''))
    })

    var feitos = 0
    for (const lead of candidatos) {
      if (feitos >= LIMITE) break
      try {
        const telefone = String(lead.get('telefone') || '').replace(/[^0-9]/g, '')
        var msgs = []
        try {
          msgs = $app.findRecordsByFilter(colM, "contato_telefone='" + telefone + "'", '', 40, 0)
        } catch (e1) {
          continue
        }
        if (msgs.length === 0) continue
        msgs.sort(function (a, b) {
          return String(a.get('created') || '').localeCompare(String(b.get('created') || ''))
        })

        var dialogo = ''
        for (const m of msgs) {
          const txt = String(m.get('texto') || '').trim()
          if (txt === '') continue
          dialogo +=
            (String(m.get('direcao')) === 'entrada' ? 'CLIENTE: ' : 'HAISAN: ') +
            txt.slice(0, 400) +
            '\n'
        }
        if (dialogo === '') continue

        // nota
        var nota = null
        var just = ''
        try {
          const r1 = $ai.chat({
            model: 'fast',
            messages: [
              {
                role: 'system',
                content:
                  'Você é um analista de vendas da HAISAN, fábrica de MÓVEIS para salão de beleza, barbearia e clínica de estética. ' +
                  'Avalie o lead SEMPRE como comprador de móveis desse setor — nunca invente outro ramo.\n' +
                  'Com base na conversa, atribua uma nota de 0 a 100 para o lead.\n' +
                  'Critérios:\n- Interesse demonstrado (0-25)\n- Poder de compra aparente (0-25)\n' +
                  '- Urgencia da necessidade (0-25)\n- Adequacao ao perfil ideal (0-25)\n' +
                  'Responda APENAS com um JSON: {"nota": <numero>, "justificativa": "<texto curto>"}',
              },
              { role: 'user', content: dialogo.slice(0, 4000) },
            ],
          })
          const t1 = String(r1.choices[0].message.content || '')
          const m1 = t1.match(/\{[\s\S]*\}/)
          if (m1) {
            const o1 = JSON.parse(m1[0])
            if (typeof o1.nota === 'number') nota = Math.max(0, Math.min(100, Math.round(o1.nota)))
            just = String(o1.justificativa || '').slice(0, 500)
          }
        } catch (eN2) {}

        // humor (ultima mensagem do cliente)
        var humor = ''
        var score = null
        var ult = ''
        for (var i = msgs.length - 1; i >= 0; i--) {
          if (
            String(msgs[i].get('direcao')) === 'entrada' &&
            String(msgs[i].get('texto') || '').trim() !== ''
          ) {
            ult = String(msgs[i].get('texto')).slice(0, 800)
            break
          }
        }
        try {
          const r2 = $ai.chat({
            model: 'fast',
            messages: [
              {
                role: 'system',
                content:
                  'Você é um analista de sentimento. Analise o tom emocional da ultima mensagem do cliente.\n' +
                  'Classifique em uma das categorias: positivo, neutro, negativo, raiva, ameaca.\n' +
                  'Atribua um score de 0 a 1 (0 = muito positivo, 1 = muito negativo/ameaca).\n' +
                  'Responda APENAS com um JSON: {"sentimento": "<categoria>", "score": <numero>}',
              },
              { role: 'user', content: ult !== '' ? ult : dialogo.slice(-800) },
            ],
          })
          const t2 = String(r2.choices[0].message.content || '')
          const m2 = t2.match(/\{[\s\S]*\}/)
          if (m2) {
            const o2 = JSON.parse(m2[0])
            const cat = String(o2.sentimento || '')
              .toLowerCase()
              .trim()
            if (['positivo', 'neutro', 'negativo', 'raiva', 'ameaca'].indexOf(cat) >= 0) humor = cat
            if (typeof o2.score === 'number') score = Math.max(0, Math.min(1, o2.score))
          }
        } catch (eH2) {}

        // resumo
        var resumo = ''
        try {
          const r3 = $ai.chat({
            model: 'fast',
            messages: [
              {
                role: 'system',
                content:
                  'Resuma a conversa de forma concisa, focando no que o LEAD/CLIENTE disse e perguntou. Destaque: o que pediu/perguntou, dados que informou, decisoes que tomou, pontos de atencao e proximos passos.\n' +
                  'Maximo 200 palavras.\n' +
                  'REGRA CRITICA — ANTI-ALUCINACAO: resuma APENAS o que faz parte do contexto (móveis para salão de beleza, barbearia e estética). Se a HAISAN saiu do topico, NAO inclua. Se tudo parece off-topic, escreva "Cliente iniciou contato, ainda sem topico definido."\n' +
                  'Texto puro, sem markdown.',
              },
              { role: 'user', content: dialogo.slice(0, 5000) },
            ],
          })
          resumo = String(r3.choices[0].message.content || '')
            .trim()
            .slice(0, 2000)
        } catch (eR2) {}

        if (nota === null && humor === '' && resumo === '') continue

        try {
          // RN-192: mesmo cuidado do cron — relê e grava só os campos de IA,
          // senão o `owner_id` lido antes volta por cima do dono atual.
          const leadAtual2 = $app.findRecordById('crm_leads', lead.id)
          if (nota !== null) leadAtual2.set('ia_nota', nota)
          if (humor !== '') leadAtual2.set('ia_humor', humor)
          if (resumo !== '') leadAtual2.set('ia_resumo', resumo.slice(0, 2000))
          if (just !== '') leadAtual2.set('ia_justificativa', just)
          if (score !== null) leadAtual2.set('ia_humor_score', score)
          leadAtual2.set('ia_calculado_em', new Date().toISOString())
          try {
            leadAtual2.set('ia_atualizado_em', new Date().toISOString())
          } catch (eU) {}
          $app.save(leadAtual2)
          feitos++
        } catch (eS) {}

        // ameaca -> trilha
        if (humor === 'ameaca') {
          try {
            const colEv = $app.findCollectionByNameOrId('crm_lead_events')
            const ev = new Record(colEv)
            ev.set('lead_id', lead.id)
            ev.set('tipo', 'nota')
            ev.set(
              'texto',
              'ATENÇÃO: cliente com tom de ameaça (procon/processo). Revisar o atendimento.',
            )
            ev.set('fixture', false)
            $app.save(ev)
          } catch (eEv2) {}
        }
      } catch (eLead) {}
    }
    if (feitos > 0) console.log('wa_ia_lead: ' + feitos + ' lead(s) analisado(s)')
  } catch (eTop) {}
})
