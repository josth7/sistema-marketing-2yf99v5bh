/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp — upload de mídia para o vendedor enviar (SPEC-3-005, 30/10).
 *
 * POST /backend/v1/whatsapp/midia   (multipart/form-data, campo `arquivo`)
 *
 * Por que uma rota e não criar direto na coleção: `whatsapp_midia` tem
 * createRule travada (ninguém cria registro por fora), e o arquivo precisa
 * ficar legível para a D-API buscar por URL. A rota valida o login, o tamanho
 * e o tipo, grava o registro pelo $app (contexto de servidor) e devolve o id.
 *
 * O id do registro é aleatório de 15 caracteres: o link do arquivo não é
 * adivinhável, então servir sem login não expõe mídia de ninguém por varredura.
 *
 * Limites: 16 MB (vídeo de celular costuma passar disso — o WhatsApp aceita
 * até 16 MB para vídeo e áudio; imagem 5 MB, mas cabe no mesmo teto).
 *
 * JSVM: e.findUploadedFiles() e $filesystem não são necessários aqui — o
 * Record aceita o arquivo direto via set('arquivo', file).
 */

routerAdd(
  'POST',
  '/backend/v1/whatsapp/midia',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    // ---------- permissão: quem responde conversa pode anexar ----------
    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var pode = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) pode = true
    }
    if (!pode) {
      return e.json(403, { ok: false, erro: 'sem permissão para anexar arquivos (read_conversas)' })
    }

    // ---------- arquivo ----------
    var arquivos = []
    try {
      arquivos = e.findUploadedFiles('arquivo')
    } catch (errF) {}
    if (!arquivos || arquivos.length === 0) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { arquivo: 'envie o arquivo no campo `arquivo`' },
      })
    }
    const f = arquivos[0]

    const nome = String(f.originalName || 'arquivo')
    // O objeto de arquivo do JSVM não entrega contentType de forma confiável
    // (veio vazio em 30/10 com curl mandando ;type=image/jpeg). Tenta as
    // propriedades possíveis e, se todas falharem, deduz pela extensão —
    // sem isso a foto ia pela rota de `document` e chegava como arquivo.
    var mime = ''
    try {
      mime = String(f.contentType || f.type || f.mimeType || '')
    } catch (errMime) {}
    if (mime === '') {
      const ext = String(nome).toLowerCase().split('.').pop()
      if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
      else if (ext === 'png') mime = 'image/png'
      else if (ext === 'webp') mime = 'image/webp'
      else if (ext === 'gif') mime = 'image/gif'
      else if (ext === 'ogg' || ext === 'opus') mime = 'audio/ogg'
      else if (ext === 'mp3') mime = 'audio/mpeg'
      else if (ext === 'm4a') mime = 'audio/mp4'
      else if (ext === 'webm') mime = 'audio/webm'
      else if (ext === 'mp4') mime = 'video/mp4'
      else if (ext === 'mov') mime = 'video/quicktime'
      else if (ext === 'pdf') mime = 'application/pdf'
    }
    var tamanho = 0
    try {
      tamanho = Number(f.size || 0)
    } catch (errT) {}

    if (tamanho > 16 * 1024 * 1024) {
      return e.json(413, {
        ok: false,
        erro: 'arquivo grande demais para o WhatsApp',
        detalhe: 'o limite é 16 MB',
      })
    }

    // tipo pelo mimetype (o WhatsApp exige coerência entre rota e arquivo)
    var tipo = 'document'
    if (mime.indexOf('image/') === 0) tipo = 'image'
    else if (mime.indexOf('audio/') === 0) tipo = 'audio'
    else if (mime.indexOf('video/') === 0) tipo = 'video'

    const colMidia = $app.findCollectionByNameOrId('whatsapp_midia')
    const rec = new Record(colMidia)
    rec.set('arquivo', f)
    rec.set('tipo', tipo)
    rec.set('mimetype', mime.slice(0, 120))
    rec.set('nome_arquivo', nome.slice(0, 200))
    rec.set('enviado_por', e.auth.id)
    const body = e.requestInfo().body || {}
    rec.set('conexao', String(body.conexao || '').slice(0, 15))
    rec.set('lead', String(body.lead || '').slice(0, 15))
    if (body.duracao_s) rec.set('duracao_s', Number(body.duracao_s))

    try {
      $app.save(rec)
    } catch (errSave) {
      return e.json(500, {
        ok: false,
        erro: 'falha ao salvar arquivo: ' + String(errSave).slice(0, 150),
      })
    }

    // URL de leitura: host INTERNO é o que a D-API alcança (o domínio público
    // serve só o frontend — /api/files/* lá devolve HTML). Verificado em 30/10.
    var base = ''
    try {
      base = String($secrets.get('PB_INSTANCE_URL') || '')
    } catch (errB) {}
    if (base === '') {
      try {
        base = String($secrets.get('SITE_URL') || '')
      } catch (errB2) {}
    }

    return e.json(200, {
      ok: true,
      id: rec.id,
      tipo: tipo,
      mimetype: mime,
      nome_arquivo: nome,
      tamanho: tamanho,
      url: base + '/api/files/whatsapp_midia/' + rec.id + '/' + String(rec.get('arquivo')),
    })
  },
  $apis.requireAuth(),
)
