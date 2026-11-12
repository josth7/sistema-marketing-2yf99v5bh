/// <reference path="../pb_data/types.d.ts" />
/**
 * O PILOTO ESTÁ PRONTO PARA UM TESTE REAL? (12/11 14:47).
 *
 * O bloqueio 130497 caiu. Antes de pedir um teste ao dono, confiro:
 *   1. o template da apresentação existe e está ligado em cada vendedor;
 *   2. o modelo tem as variáveis que o código manda;
 *   3. a janela de 24h: quem falou nas últimas 24h (esses podem receber);
 *   4. o robô está ligado e com a config da Haisan.
 *
 * GET /backend/v1/check/pronto-piloto
 */
routerAdd(
  'GET',
  '/backend/v1/check/pronto-piloto',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, vendedores: [], janela: {}, robo: null }

    // ---------- 1 e 2. vendedores com apresentação ----------
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        20,
        0,
      )
      for (const c of cxs) {
        var segredo = false
        try {
          const n = String(c.get('nome_segredo_chave') || '')
          if (n !== '') segredo = String($secrets.get(n) || '') !== ''
        } catch (eS) {}
        out.vendedores.push({
          nome: String(c.get('nome_exibicao') || ''),
          apresentacao_ligada: c.get('apresentacao_ativa') === true,
          modelo: String(c.get('modelo_apresentacao_vendedor') || ''),
          tem_chave: segredo,
          session: String(c.get('session_id') || '').slice(0, 18),
        })
      }
    } catch (e0) {}

    // ---------- 3. janela de 24h ----------
    // quem recebeu mensagem do cliente nas ultimas 24h pode receber resposta
    try {
      const agora = new Date().getTime()
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada'",
        '',
        500,
        0,
      )
      var abertas = 0
      var total = 0
      for (const m of msgs) {
        const q = new Date(String(m.get('created') || '')).getTime()
        if (!(q > 0)) continue
        total++
        if (agora - q < 24 * 3600000) abertas++
      }
      out.janela = { msgs_entrada_total: total, janela_aberta_24h: abertas }
    } catch (e1) {}

    // ---------- 4. robô ----------
    try {
      const empC = (function () {
        const cs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conexoes'),
          "papel='central' && ativo=true && fixture=false",
          '',
          1,
          0,
        )
        return cs.length > 0 ? String(cs[0].get('empresa') || '') : ''
      })()
      const vs = app.findRecordsByFilter(
        'atendimento_config',
        empC !== '' ? "empresa='" + empC + "'" : '',
        '',
        200,
        0,
      )
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg) {
        out.robo = {
          versao: Number(cfg.get('versao') || 0),
          ligado: cfg.get('ligado') === true,
          hora_inicio: String(cfg.get('hora_inicio') || ''),
          hora_fim: String(cfg.get('hora_fim') || ''),
          janela_min: Number(cfg.get('janela_min') || 0),
        }
      }
    } catch (e2) {}

    // o que o codigo espera no template
    out.template_esperado = {
      language: 'pt_BR (texto, nao objeto)',
      bodyVariables: '2 valores: primeiro nome do destinatario | primeiro nome do vendedor',
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
