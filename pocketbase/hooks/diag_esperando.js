/// <reference path="../pb_data/types.d.ts" />
/**
 * PAINEL OPERACIONAL (04/11) — quem está esperando resposta AGORA.
 *
 * O dono disse: "clientes estão ficando sem respostas, não está tendo
 * atendimento". Isso não é pergunta sobre status de envio, é sobre fila real.
 *
 * Esta rota responde, para a conexão central:
 *   - quantas conversas têm a ÚLTIMA mensagem do cliente (esperando nós)
 *   - há quanto tempo cada uma espera
 *   - por que o robô não atendeu (mesma regra do cron)
 *
 * GET /backend/v1/diag/esperando
 */
routerAdd(
  'GET',
  '/backend/v1/diag/esperando',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      agora: new Date().toISOString(),
      config: {},
      total_conversas: 0,
      esperando: 0,
      ha_mais_de_1h: 0,
      itens: [],
      erro: '',
    }

    // ---------- configuração do painel ----------
    var cfg = null
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('atendimento_config'),
        '',
        '',
        500,
        0,
      )
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
    } catch (e0) {}
    out.config = {
      ligado: cfg ? cfg.get('ligado') === true : false,
      janela_min: cfg ? Number(cfg.get('janela_min') || 0) : 0,
      usar_horario: cfg ? cfg.get('usar_horario') === true : false,
      versao: cfg ? Number(cfg.get('versao') || 0) : 0,
    }

    // ---------- conversas da central ----------
    var central = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) central = cxs[0]
    } catch (e1) {}
    if (!central) {
      out.erro = 'sem conexão central ativa'
      return e.json(200, out)
    }

    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "'",
        '',
        800,
        0,
      )
    } catch (e2) {
      out.erro = 'conversas: ' + String(e2).slice(0, 180)
      return e.json(200, out)
    }
    out.total_conversas = conversas.length

    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const agoraMs = new Date().getTime()

    for (const cv of conversas) {
      // última mensagem do contato
      var ultimas = []
      try {
        ultimas = app.findRecordsByFilter(
          colMsg,
          "conexao='" +
            central.id +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone') || '') +
            "'",
          '',
          6,
          0,
        )
      } catch (e3) {
        continue
      }
      if (ultimas.length === 0) continue
      // ordena por enviada_em (created pode vir vazio)
      ultimas.sort(function (a, b) {
        const ka = String(a.get('enviada_em') || a.get('created') || '')
        const kb = String(b.get('enviada_em') || b.get('created') || '')
        return kb.localeCompare(ka)
      })
      const ultima = ultimas[0]
      if (String(ultima.get('direcao')) !== 'entrada') continue

      // esperando resposta
      const quando = new Date(
        String(ultima.get('enviada_em') || ultima.get('created') || ''),
      ).getTime()
      const minutos = quando > 0 ? Math.round((agoraMs - quando) / 60000) : -1
      out.esperando++
      if (minutos >= 60) out.ha_mais_de_1h++

      const est = String(cv.get('estado') || '')
      var motivo = ''
      if (est !== 'triagem') motivo = 'conversa em ' + est + ' (humano assumiu)'
      else if (out.config.janela_min > 0 && minutos > out.config.janela_min)
        motivo = 'fora da janela de ' + out.config.janela_min + ' min'
      else if (!out.config.ligado) motivo = 'painel DESLIGADO'
      else motivo = 'DEVERIA TER RESPONDIDO'

      out.itens.push({
        nome: String(cv.get('contato_nome') || ''),
        telefone: String(cv.get('contato_telefone') || ''),
        estado: est,
        minutos: minutos,
        quando: String(ultima.get('enviada_em') || ultima.get('created') || '').slice(0, 16),
        texto: String(ultima.get('texto') || '(mídia)').slice(0, 45),
        motivo: motivo,
      })
    }

    out.itens.sort(function (a, b) {
      return a.minutos - b.minutos
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
