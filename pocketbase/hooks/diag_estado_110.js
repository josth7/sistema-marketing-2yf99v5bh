/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (09/11) — CA-3-110: o cron distribui e confirma o dono?
 *
 * **SÓ LEITURA + confirmação.** Mostra:
 *   - quantos leads estão sem dono ou com dono inválido;
 *   - quem o cron consideraria vendedor válido;
 *   - se os 6 leads atuais já têm pedido de rodízio.
 *
 * Não distribui nada: só mostra o estado para eu saber se o cron está agindo.
 *
 * GET /backend/v1/diag/estado-110
 */
routerAdd(
  'GET',
  '/backend/v1/diag/estado-110',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, validos: [], sem_dono: [], com_dono_invalido: [], com_pedido: 0 }

    // vendedores com conexão ativa (o critério do CA-3-110)
    const validos = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        30,
        0,
      )) {
        const u = String(c.get('vendedor_user') || '')
        if (u === '') continue
        const nomeCx = String(c.get('nome_exibicao') || '')
        // espelha a exclusão do cron (CA-3-110): conta de teste não é válida
        if (nomeCx.toLowerCase().indexOf('fixture') >= 0) continue
        validos[u] = nomeCx
      }
    } catch (e0) {}
    for (const id in validos) out.validos.push(validos[id])
    out.total_validos = Object.keys(validos).length

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 140) })
    }

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
    } catch (e2) {}

    for (const l of leads) {
      if (String(l.get('status') || '') === 'descartado') continue
      const ow = String(l.get('owner_id') || '')
      if (ow !== '' && validos[ow] !== undefined) continue

      var pedidos = 0
      try {
        pedidos = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + l.id + "'",
          '',
          5,
          0,
        ).length
      } catch (e3) {}
      if (pedidos > 0) out.com_pedido++

      const item = {
        nome: String(l.get('nome') || '').slice(0, 20),
        criado: String(l.get('created') || '').slice(0, 16),
        dono_atual: nomes[ow] || '(vazio)',
        pedidos: pedidos,
      }
      if (ow === '') {
        if (out.sem_dono.length < 12) out.sem_dono.push(item)
      } else {
        if (out.com_dono_invalido.length < 12) out.com_dono_invalido.push(item)
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
