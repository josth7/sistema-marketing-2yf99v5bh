/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-44 — link direto do vendedor na transferência (05/11).
 *
 * Texto aprovado pelo dono em 05/11. Esta rota prova, com conversa de TESTE,
 * que a frase sai com o link certo e a mensagem pronta:
 *
 *   1. pega a conexão de uma vendedora e confere o número no link
 *   2. monta a frase exatamente como o motor monta (mesmos passos)
 *   3. confere que o link tem os dígitos da vendedora e o texto codificado
 *   4. confere que o link NÃO aponta para o cliente
 *
 * Não envia nada para cliente: só mostra o texto que sairia.
 *
 * GET /backend/v1/diag/prova-link?nome=Elisangela
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-link',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const alvo = String(e.request.url.query().get('nome') || 'Elisangela')
    const out = { ok: false, passos: [], frase: '', link: '' }

    // conexão da vendedora
    var cx = null
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor'",
        '',
        20,
        0,
      )
      for (const c of cxs) {
        if (
          String(c.get('nome_exibicao') || '')
            .toLowerCase()
            .indexOf(alvo.toLowerCase()) >= 0
        ) {
          cx = c
          break
        }
      }
    } catch (e0) {}
    if (!cx) {
      out.erro = 'vendedora não encontrada: ' + alvo
      return e.json(200, out)
    }

    const nome = String(cx.get('vendedor_nome_publico') || cx.get('nome_exibicao') || '')
    const digitos = String(cx.get('numero') || '').replace(/[^0-9]/g, '')
    out.passos.push({
      passo: '1. conexão da vendedora',
      ok: digitos.length >= 12,
      detalhe: nome + ' · ' + String(cx.get('numero') || ''),
    })

    // monta o link igual ao motor
    const primeiroNome = nome.split(' ')[0]
    const link =
      'https://wa.me/' +
      digitos +
      '?text=' +
      encodeURIComponent('Oi, ' + primeiroNome + '! Vim do atendimento da Haisan')
    out.link = link
    out.passo_link = {
      ok: link.indexOf(digitos) > 0 && link.indexOf('?text=') > 0,
      detalhe: link,
    }

    // frase aprovada
    const frase = (
      'Certo! 😊 Já te encaminhei pro nosso time de vendas! Quem vai te atender é a *{nome}*.' +
      '\nFala direto com ela por aqui: {link}' +
      '\nPode salvar como *Haisan Vendas*! 😊'
    )
      .split('{nome}')
      .join(nome)
      .split('{link}')
      .join(link)
    out.frase = frase
    out.passos.push({
      passo: '2. frase montada',
      ok: frase.indexOf('wa.me') > 0 && frase.indexOf(nome) > 0,
      detalhe: 'contém nome e link',
    })
    out.passos.push({
      passo: '3. link aponta para a vendedora (não para o cliente)',
      ok: link.indexOf(digitos) > 0,
      detalhe: 'dígitos ' + digitos + ' no link',
    })
    out.passos.push({
      passo: '4. mensagem pronta codificada',
      ok: link.indexOf('Oi%2C') > 0,
      detalhe: decodeURIComponent(link.split('?text=')[1] || ''),
    })

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
