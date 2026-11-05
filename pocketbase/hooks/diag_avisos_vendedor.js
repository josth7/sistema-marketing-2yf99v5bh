/// <reference path="../pb_data/types.d.ts" />
/**
 * AVISOS AO VENDEDOR (05/11) — leitura, só gestão.
 *
 * O dono disse: "a conversa precisa ir para o celular também, não só o
 * sistema". A tela já mostra; o WhatsApp do vendedor é outra coisa.
 *
 * O aviso ao vendedor é criado pela rota de TRANSFERÊNCIA
 * (`whatsapp_transferencias.js`, motivo `aviso_vendedor`). O rodízio de 05/11
 * (migração 0128) só gravou `owner_id` no lead — ele NÃO passa pela rota de
 * transferência, portanto não dispara aviso.
 *
 * Esta rota mostra, para cada vendedor:
 *   - quantos `aviso_vendedor` existem e em que estado
 *   - se a conexão dele tem número válido
 *   - se há modelo aprovado configurado (`modelo_aviso_vendedor`)
 *   - quantos leads ele recebeu hoje sem aviso
 *
 * GET /backend/v1/diag/avisos-vendedor
 */
routerAdd(
  'GET',
  '/backend/v1/diag/avisos-vendedor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { conexoes: [], envios: {}, por_vendedor: [], erro: '' }

    // ---------- conexões ----------
    var cxs = []
    try {
      cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor'",
        '',
        20,
        0,
      )
    } catch (e0) {
      out.erro = String(e0).slice(0, 150)
    }

    // ---------- envios de aviso ----------
    var envios = []
    try {
      envios = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='aviso_vendedor'",
        '',
        500,
        0,
      )
    } catch (e1) {}

    const porEstado = {}
    const porDestino = {}
    for (const en of envios) {
      const st = String(en.get('estado') || '(vazio)')
      porEstado[st] = (porEstado[st] || 0) + 1
      const d = String(en.get('destino_telefone') || '')
      porDestino[d] = (porDestino[d] || 0) + 1
    }
    out.envios = { total: envios.length, por_estado: porEstado }

    // ---------- modelo aprovado na central ----------
    var modelo = ''
    try {
      const ce = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central'",
        '',
        3,
        0,
      )
      if (ce.length > 0) modelo = String(ce[0].get('modelo_aviso_vendedor') || '')
    } catch (e2) {}
    out.modelo_aviso_vendedor = modelo

    // ---------- por vendedor ----------
    for (const c of cxs) {
      const numero = String(c.get('numero') || '')
      const nd = numero.replace(/\D/g, '')
      const uid = String(c.get('vendedor_user') || '')
      out.por_vendedor.push({
        nome: String(c.get('nome_exibicao') || ''),
        numero: numero,
        numero_valido: nd.indexOf('55') === 0 && (nd.length === 12 || nd.length === 13),
        vendedor_user: uid.slice(0, 12),
        segredo_ok: c.get('segredo_configurado') === true,
        avisos_enviados: porDestino[numero] || 0,
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
