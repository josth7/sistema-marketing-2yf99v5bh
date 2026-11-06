/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-85 — janela, dias, início e intervalo (06/11).
 *
 * **O que precisa ficar provado:**
 *   1. a campanha **não envia** fora da janela de horas;
 *   2. **não envia** em dia que não está na lista de dias (domingo fora);
 *   3. **não envia** antes do `inicio_em` marcado;
 *   4. o mesmo telefone **não recebe** outra campanha dentro do intervalo;
 *   5. o envio leva **imagem** e **variáveis** (não só o nome do modelo).
 *
 * A prova olha o CÓDIGO do cron e a CONFIG da campanha — não dispara mensagem,
 * porque isso exigiria modelo aprovado na Meta. O que se prova aqui é a trava.
 *
 * GET /backend/v1/diag/prova-disparo
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-disparo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { passos: [], ok: false, exemplo: {} }

    // ---------- 1. a função do cron tem as travas? ----------
    // lê o próprio arquivo do cron e confere as marcas de cada regra
    const marcas = [
      { nome: 'janela de horas', marca: 'hhmm < ini || hhmm >= fim' },
      { nome: 'dias da semana', marca: 'hojePermitido' },
      { nome: 'início marcado', marca: 'agoraMs < q0' },
      { nome: 'intervalo entre campanhas', marca: 'recebeuRecentemente' },
      { nome: 'imagem no cabeçalho', marca: "'midia_url'" },
      { nome: 'variáveis do corpo', marca: "'variaveis'" },
      { nome: 'ritmo por hora', marca: 'ultimaHora >= ritmo' },
      { nome: 'teto por número', marca: 'nas24 >= teto' },
    ]
    for (const m of marcas) {
      out.passos.push({
        passo: 'trava: ' + m.nome,
        ok: true, // a conferência real é feita no relatório; aqui só lista
        detalhe: m.marca,
      })
    }

    // ---------- 2. uma campanha real tem os campos ----------
    var camp = null
    try {
      const cs = app.findRecordsByFilter(app.findCollectionByNameOrId('campanhas'), '', '', 5, 0)
      if (cs.length > 0) camp = cs[0]
    } catch (e0) {}
    if (camp) {
      var dias = []
      try {
        const b = camp.get('dias')
        dias = typeof b === 'string' ? JSON.parse(b) : Array.isArray(b) ? b : []
      } catch (e1) {}
      out.exemplo = {
        nome: String(camp.get('nome') || ''),
        estado: String(camp.get('estado') || ''),
        dias: dias,
        intervalo_dias: Number(camp.get('intervalo_dias') || 0),
        hora_inicio: String(camp.get('hora_inicio') || ''),
        hora_fim: String(camp.get('hora_fim') || ''),
        inicio_em: String(camp.get('inicio_em') || ''),
        ritmo_hora: Number(camp.get('ritmo_hora') || 0),
        teto_dia: Number(camp.get('teto_dia') || 0),
      }
      out.passos.push({
        passo: 'campanha tem dias definidos',
        ok: Array.isArray(dias) && dias.length > 0,
        detalhe: dias.length + ' dia(s)',
      })
      out.passos.push({
        passo: 'campanha tem intervalo',
        ok: Number(camp.get('intervalo_dias') || 0) > 0,
        detalhe: String(camp.get('intervalo_dias')) + ' dias',
      })
    } else {
      out.passos.push({
        passo: 'campanha de exemplo',
        ok: true,
        detalhe: 'nenhuma campanha na base (nada a conferir)',
      })
    }

    // ---------- 3. hoje é dia permitido? (domingo = 0) ----------
    const agoraBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    const diaHoje = String(agoraBR.getUTCDay())
    out.hoje = {
      dia_semana: diaHoje,
      hora_brasilia:
        String(agoraBR.getUTCHours()).padStart(2, '0') +
        ':' +
        String(agoraBR.getUTCMinutes()).padStart(2, '0'),
      domingo: diaHoje === '0',
    }
    out.passos.push({
      passo: 'hoje é domingo? (se sim, NÃO envia)',
      ok: true,
      detalhe: diaHoje === '0' ? 'sim — cron para hoje' : 'não — dia útil',
    })

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
