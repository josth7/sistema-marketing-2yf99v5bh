/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA — só VENDEDOR com conexão ativa aparece para o cliente (17/11).
 *
 * A regra nova em dois pontos:
 *   1. `whatsapp_transferencias`: se não há número de vendedor, a frase ao
 *      cliente sai SEM nome (texto neutro).
 *   2. `wa_roteiro_cron`: o nome dito vem só do nome público da conexão; nunca
 *      `name || email` do usuário.
 *
 * Aqui se confere, nos envios reais de `aviso_cliente` e nas transferências de
 * hoje em diante, se algum nome citado NÃO corresponde a um vendedor com
 * conexão ativa — e se algum e-mail apareceu.
 *
 * GET /backend/v1/check/prova-cliente
 */
routerAdd(
  'GET',
  '/backend/v1/check/prova-cliente',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      vendedores_validos: [],
      envios_analisados: 0,
      com_email: [],
      com_nome_invalido: [],
      ok_count: 0,
    }

    // nomes válidos = conexões de vendedor ativas
    const nomesValidos = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )) {
        const pub = String(c.get('vendedor_nome_publico') || '')
        const exib = String(c.get('nome_exibicao') || '')
        const num = String(c.get('numero') || '').replace(/[^0-9]/g, '')
        if (pub !== '') nomesValidos[pub.toLowerCase()] = true
        if (exib !== '') nomesValidos[exib.toLowerCase()] = true
        out.vendedores_validos.push({ nome: pub || exib, numero: num.slice(-6) })
      }
    } catch (e0) {}

    // analisa os avisos ao cliente dos últimos 3 dias
    var envs = []
    try {
      envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='aviso_cliente' && created>='2026-11-14'",
        '-created',
        300,
        0,
      )
    } catch (e1) {}
    out.envios_analisados = envs.length

    for (const x of envs) {
      const tx = String(x.get('texto') || '')

      // e-mail no texto? nunca deve acontecer
      if (tx.indexOf('@') >= 0) {
        out.com_email.push({
          quando: String(x.get('created') || '').slice(0, 16),
          dest: String(x.get('destino_telefone') || '').slice(-6),
          texto: tx.slice(0, 120),
        })
        continue
      }

      // nome citado entre asteriscos
      var citado = ''
      try {
        const m = tx.match(/\*([^*]+)\*/)
        if (m) citado = m[1].trim()
      } catch (e2) {}

      if (citado === '') continue
      // "Haisan Vendas" é a marca, não uma pessoa
      if (citado.toLowerCase() === 'haisan vendas') continue

      if (nomesValidos[citado.toLowerCase()] !== true) {
        out.com_nome_invalido.push({
          quando: String(x.get('created') || '').slice(0, 16),
          citado: citado,
          dest: String(x.get('destino_telefone') || '').slice(-6),
        })
      } else {
        out.ok_count++
      }
    }

    out.resumo = {
      analisados: out.envios_analisados,
      nome_valido: out.ok_count,
      com_email: out.com_email.length,
      nome_invalido: out.com_nome_invalido.length,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
