/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — a conversa chega ao WhatsApp do vendedor?
 *
 * **SÓ LEITURA.** O dono relata: "conversa/lead só aparecia no CRM, não estava
 * indo para o celular". Celular = WhatsApp do vendedor.
 *
 * Para cada vendedor, verifica:
 *   - tem conexão própria ativa com sessão?
 *   - recebeu mensagem nos últimos dias?
 *   - os leads dele têm conversa no número dele?
 *   - quantos envios `aviso_vendedor` e `apresentacao_vendedor` saíram e com que estado?
 *
 * GET /backend/v1/diag/chega-no-celular
 */
routerAdd(
  'GET',
  '/backend/v1/diag/chega-no-celular',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, vendedores: [], envios_por_motivo: {}, janela_dias: 7 }

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e0) {}

    // ---------- conexões ----------
    var cxs = []
    try {
      cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        60,
        0,
      )
    } catch (e1) {}

    // ---------- mensagens recebidas por conexão (7 dias) ----------
    const agora = new Date().getTime()
    const recebidasPorCx = {}
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada'",
        '',
        12000,
        0,
      )
      for (const m of msgs) {
        const q = new Date(String(m.get('enviada_em') || m.get('created') || '')).getTime()
        if (!(q > 0)) continue
        if (agora - q > out.janela_dias * 86400000) continue
        const cx = String(m.get('conexao') || '')
        recebidasPorCx[cx] = (recebidasPorCx[cx] || 0) + 1
      }
    } catch (e2) {}

    // ---------- envios por motivo ----------
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        '',
        '',
        12000,
        0,
      )
      for (const en of envs) {
        const m = String(en.get('motivo') || '?')
        if (!out.envios_por_motivo[m]) out.envios_por_motivo[m] = {}
        const est = String(en.get('estado') || '?')
        out.envios_por_motivo[m][est] = (out.envios_por_motivo[m][est] || 0) + 1
      }
    } catch (e3) {}

    // ---------- por vendedor ----------
    for (const c of cxs) {
      const vend = String(c.get('vendedor_user') || '')
      if (vend === '') continue
      const papel = String(c.get('papel') || '')
      if (papel !== 'vendedor') continue
      out.vendedores.push({
        nome: nomes[vend] || vend,
        conexao: String(c.get('nome_exibicao') || ''),
        numero: String(c.get('numero') || ''),
        tem_sessao: String(c.get('session_id') || '') !== '',
        recebeu_7d: recebidasPorCx[c.id] || 0,
        ultimo_evento: String(c.get('ultimo_evento_em') || '').slice(0, 16),
        status: String(c.get('ultimo_status_conexao') || ''),
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
