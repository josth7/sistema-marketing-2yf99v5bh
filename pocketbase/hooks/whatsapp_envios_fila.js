/// <reference path="../pb_data/types.d.ts" />
/**
 * Fila de envios pela API oficial — RN-69 (SPEC-3-005) + mídia (30/10).
 *
 * Pega os envios `pendente` e `erro`, tenta pela D-API e classifica:
 *   2xx        → `enviado` + wa_message_id
 *   4xx (≠429) → `erro_definitivo` (destino inválido — não adianta repetir)
 *   429/5xx/timeout → `erro`, volta na próxima rodada
 *   3 tentativas sem sucesso → `erro_definitivo`, visível na tela
 *
 * NOVO (Conversas 2.0): envio de MÍDIA pelo vendedor. O envio com `midia`
 * preenchido busca o arquivo em `whatsapp_midia` e chama a rota certa da D-API
 * (image/audio/video/document) com a URL pública do arquivo. A D-API aceita
 * URL pública — o id do registro é aleatório, então o link não é adivinhável.
 *
 * O motivo do envio diz o autor:
 *   ia_*              → a IA respondeu
 *   vendedor_*        → o vendedor respondeu PELO SISTEMA (autor_user)
 *   aviso e teste     → sistema
 *
 * Conexão fixture NUNCA chama a D-API real: usa a rota de fixture do próprio
 * sistema com `X-Fixture-Secret` (lição do projeto).
 *
 * JSVM: `$secrets.get` (não existe $os.env); corpo do $http.send volta como
 * ARRAY DE CHAR-CODES; lógica INLINE nos callbacks.
 */

cronAdd('whatsapp_envios_fila', '*/2 * * * *', () => {
  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const alvos = []
  try {
    const pendentes = $app.findRecordsByFilter(colEnv, 'estado="pendente"', '', 100, 0)
    for (const p of pendentes) alvos.push(p)
  } catch (e1) {}
  try {
    const comErro = $app.findRecordsByFilter(colEnv, 'estado="erro"', '', 100, 0)
    for (const p of comErro) {
      if (Number(p.get('tentativas') || 0) >= 3) {
        p.set('estado', 'erro_definitivo')
        try {
          $app.save(p)
        } catch (e2) {}
        continue
      }
      alvos.push(p)
    }
  } catch (e3) {}

  for (const env of alvos) {
    // ---------- destino válido? ----------
    const destino = String(env.get('destino_telefone') || '')
    if (destino.replace(/\D/g, '').length < 10) {
      env.set('estado', 'sem_numero')
      env.set('ultimo_erro', 'destino_invalido')
      try {
        $app.save(env)
      } catch (e4) {}
      continue
    }

    // ---------- conexão ----------
    let conexao = null
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', String(env.get('conexao') || ''))
    } catch (_) {
      env.set('estado', 'erro_definitivo')
      env.set('ultimo_erro', 'conexao_nao_encontrada')
      try {
        $app.save(env)
      } catch (e5) {}
      continue
    }

    const ehFixture =
      String(env.get('fixture')) === 'true' || String(conexao.get('fixture')) === 'true'
    const texto = String(env.get('texto') || '')

    // ---------- RN-194 (10/11): fora do horário, NÃO prometer minutos ----------
    // A fila não manda ao cliente texto da central com promessa imediata
    // ("nos próximos minutos", "só um momento", "alguns minutos", "encaminhar
    // agora"). O envio fica `bloqueado_horario`, visível na tela.
    try {
      const ehParaCliente =
        String(env.get('motivo') || '') === 'aviso_cliente' ||
        String(env.get('motivo') || '') === 'ia_resposta'
      if (ehParaCliente && texto !== '') {
        const baixo = texto.toLowerCase()
        const promete =
          baixo.indexOf('próximos minutos') >= 0 ||
          baixo.indexOf('proximos minutos') >= 0 ||
          baixo.indexOf('em alguns minutos') >= 0 ||
          baixo.indexOf('só um momento') >= 0 ||
          baixo.indexOf('so um momento') >= 0 ||
          baixo.indexOf('encaminhar agora') >= 0

        if (promete) {
          var dentroH = true
          try {
            const cfgF = $app.findRecordsByFilter('atendimento_config', '', '', 50, 0)
            var cfgFv = null
            for (const cf of cfgF) {
              if (!cfgFv || Number(cf.get('versao') || 0) > Number(cfgFv.get('versao') || 0))
                cfgFv = cf
            }
            const iniF = cfgFv ? String(cfgFv.get('hora_inicio') || '08:00') : '08:00'
            const fimF = cfgFv ? String(cfgFv.get('hora_fim') || '17:30') : '17:30'
            const brF = new Date(new Date().getTime() - 3 * 3600000)
            const diaF = brF.getUTCDay()
            const hhF =
              ('0' + brF.getUTCHours()).slice(-2) + ':' + ('0' + brF.getUTCMinutes()).slice(-2)
            const utilF = diaF >= 1 && diaF <= 5
            dentroH = utilF && hhF >= iniF && hhF <= fimF
          } catch (eHF) {}
          if (!dentroH) {
            env.set('estado', 'bloqueado_horario')
            env.set('ultimo_erro', 'promessa de contato imediato fora do horario (RN-194)')
            try {
              $app.save(env)
            } catch (eBH) {}
            continue
          }
        }
      }
    } catch (eR194) {}

    // ---------- RN-195 (10/11): apresentação NUNCA fora do horário ----------
    // Redundância com o cron: mesmo que o envio já esteja na fila, fora do
    // horário comercial ele não sai — fica `bloqueado_horario` até a abertura.
    try {
      if (String(env.get('motivo') || '') === 'apresentacao_vendedor') {
        var dentroAp = true
        try {
          const cfgApF = $app.findRecordsByFilter('atendimento_config', '', '', 50, 0)
          var cfgApFv = null
          for (const cfA of cfgApF) {
            if (!cfgApFv || Number(cfA.get('versao') || 0) > Number(cfgApFv.get('versao') || 0))
              cfgApFv = cfA
          }
          const iniA = cfgApFv ? String(cfgApFv.get('hora_inicio') || '08:00') : '08:00'
          const fimA = cfgApFv ? String(cfgApFv.get('hora_fim') || '17:30') : '17:30'
          const brA = new Date(new Date().getTime() - 3 * 3600000)
          const diaA = brA.getUTCDay()
          const hhA =
            ('0' + brA.getUTCHours()).slice(-2) + ':' + ('0' + brA.getUTCMinutes()).slice(-2)
          dentroAp = diaA >= 1 && diaA <= 5 && hhA >= iniA && hhA <= fimA
        } catch (eApF) {}
        if (!dentroAp) {
          env.set('estado', 'bloqueado_horario')
          env.set('ultimo_erro', 'apresentacao fora do horario comercial (RN-195)')
          try {
            $app.save(env)
          } catch (eApS) {}
          continue
        }
      }
    } catch (eR195) {}
    // TEMPLATE (modelo aprovado): é o único jeito de mandar mensagem FORA da
    // janela de 24h. Usado no aviso de lead novo ao vendedor, quando ele não
    // falou com a central nas últimas 24h (erro 131047).
    const modo = String(env.get('modo') || 'texto')
    const ehModelo = modo === 'modelo'
    const nomeModelo = String(env.get('modelo_nome') || '')
    const sessionId = String(conexao.get('session_id') || '')
    const secao = String(conexao.get('nome_segredo_chave') || 'DAPI_API_KEY')

    // ---------- mídia? ----------
    var midia = null
    var tipoMidia = ''
    try {
      const midiaId = String(env.get('midia') || '')
      if (midiaId !== '') {
        midia = $app.findRecordById('whatsapp_midia', midiaId)
        if (midia) tipoMidia = String(midia.get('tipo') || '')
      }
    } catch (eMid) {}

    var url = ''
    var auth = ''
    if (ehFixture) {
      var baseFit = String($secrets.get('SITE_URL') || '')
      if (baseFit === '') baseFit = 'https://sistema-marketing-1f51e.shrd03.internal.goskip.dev'
      url = baseFit + '/backend/v1/fixtures/dapi/send'
      auth = String($secrets.get('FIXTURE_TICK_SECRET') || '')
    } else {
      var chave = ''
      try {
        chave = String($secrets.get(secao) || '')
      } catch (eSec) {}
      // Cada número usa a PRÓPRIA chave (coexistência em todos os números;
      // decisão do consultor, 04/11). Sem a chave do número, o envio por ele
      // fica parado com `chave_nao_configurada` até a Haisan cadastrar o
      // segredo (DAPI_KEY_<NOME>) no Skip — a chave mestra da conta NÃO é usada
      // (SPEC do atendimento, regra "chave por número"). Não religar o fallback.
      if (chave === '') {
        env.set('ultimo_erro', 'chave_nao_configurada')
        try {
          $app.save(env)
        } catch (e6) {}
        continue
      }
      // rota certa por tipo (texto continua na rota antiga)
      if (midia) {
        if (tipoMidia === 'image') url = 'https://api.d-api.cloud/api/v1/messages/send/image'
        else if (tipoMidia === 'audio') url = 'https://api.d-api.cloud/api/v1/messages/send/audio'
        else if (tipoMidia === 'video') url = 'https://api.d-api.cloud/api/v1/messages/send/video'
        else url = 'https://api.d-api.cloud/api/v1/messages/send/document'
      } else if (ehModelo && nomeModelo !== '') {
        url = 'https://api.d-api.cloud/api/v1/messages/send/template'
      } else {
        url = 'https://api.d-api.cloud/api/v1/messages/send/text'
      }
      auth = chave
    }

    const tentativas = Number(env.get('tentativas') || 0) + 1
    env.set('tentativas', tentativas)

    // ---------- corpo por tipo ----------
    var corpo = {}
    if (midia && !ehFixture) {
      // URL pública do arquivo: o id do registro é aleatório (não adivinhável)
      // o host do arquivo tem de ser o INTERNO: o domínio público serve só o
      // frontend (/api/files lá devolve HTML — verificado 30/10)
      var basePub = String($secrets.get('PB_INSTANCE_URL') || '')
      if (basePub === '') basePub = String($secrets.get('SITE_URL') || '')
      if (basePub === '') basePub = 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev'
      var urlArquivo =
        basePub + '/api/files/whatsapp_midia/' + midia.id + '/' + midia.get('arquivo')
      corpo = { sessionId: sessionId, to: destino }
      if (tipoMidia === 'image') corpo.image = urlArquivo
      else if (tipoMidia === 'audio') corpo.audio = urlArquivo
      else if (tipoMidia === 'video') corpo.video = urlArquivo
      else corpo.document = urlArquivo
      var legenda = String(env.get('legenda') || '')
      if (
        legenda !== '' &&
        (tipoMidia === 'image' || tipoMidia === 'video' || tipoMidia === 'document')
      ) {
        corpo.caption = legenda
      }
      if (tipoMidia === 'document') {
        corpo.filename = String(midia.get('nome_arquivo') || 'arquivo')
      }
    } else if (ehModelo && nomeModelo !== '') {
      // corpo do modelo aprovado: nome + idioma + variáveis na ordem.
      // As variáveis vêm em `legenda` separadas por | (ex.: "Fabio|(41) 9721-3499")
      // CA-3-106 (emenda 09/11): o formato é o da DOCUMENTAÇÃO da D-API, não o
      // da Meta direto. `language` é TEXTO e as variáveis vão em
      // `bodyVariables`, na ordem. Era isso que fazia a D-API recusar com 400
      // as 28 apresentações de 09/11 — e nenhuma chegava ao cliente.
      //
      // ERRADO (antes):  language: { code: 'pt_BR' }, components: [{...}]
      // CERTO  (agora):  language: 'pt_BR',          bodyVariables: ['...','...']
      const idioma = String(env.get('modelo_idioma') || 'pt_BR')
      corpo = {
        sessionId: sessionId,
        to: destino,
        template: {
          name: nomeModelo,
          language: idioma,
          bodyVariables: [],
        },
      }
      var vars = String(env.get('legenda') || '')
      if (vars !== '') {
        var partes = vars.split('|')
        var valores = []
        for (var iv = 0; iv < partes.length; iv++) {
          if (String(partes[iv]) !== '') valores.push(String(partes[iv]).slice(0, 200))
        }
        corpo.template.bodyVariables = valores
      }
    } else {
      corpo = { sessionId: sessionId, to: destino, text: texto }
      if (midia && ehFixture) {
        // fixture: a rota de teste só conhece texto; manda a legenda como texto
        var legendaF = String(env.get('legenda') || '')
        if (legendaF !== '') corpo.text = legendaF
      }
    }

    var status = 0
    var corpoResp = ''
    try {
      const resp = $http.send({
        url: url,
        method: 'POST',
        headers: (function () {
          // BUG (10/11): mandar `X-Fixture-Secret: ''` (string vazia) fazia o
          // gateway responder **405 Not Allowed** em HTML — era o erro dos
          // avisos ao vendedor. Header só entra quando é fixture de verdade.
          var h = { 'Content-Type': 'application/json', Authorization: auth }
          if (ehFixture) h['X-Fixture-Secret'] = auth
          return h
        })(),
        body: JSON.stringify(corpo),
        timeout: 20,
      })
      status = Number(resp.statusCode || 0)
      var raw = resp.body
      if (Array.isArray(raw)) corpoResp = String.fromCharCode.apply(null, raw)
      else if (typeof raw === 'string') corpoResp = raw
    } catch (eHttp) {
      env.set('estado', tentativas >= 3 ? 'erro_definitivo' : 'erro')
      env.set('ultimo_erro', 'dapi_transporte')
      try {
        $app.save(env)
      } catch (e7) {}
      continue
    }

    // registro sem telefone nem texto (04/11): mostra no log do Skip se a D-API
    // aceitou. A recusa da Meta chega depois pelo webhook (message.failed).
    console.log(
      'whatsapp_envios_fila: ' +
        String(env.get('motivo') || '') +
        ' -> HTTP ' +
        status +
        (ehFixture ? ' (teste)' : ''),
    )

    if (status >= 200 && status < 300) {
      var idEnviado = ''
      try {
        const j = JSON.parse(corpoResp)
        idEnviado = String(j.id || j.messageId || (j.data ? j.data.id : '') || '')
      } catch (eP) {}
      env.set('estado', 'enviado')
      env.set('ultimo_erro', '')
      env.set('wa_message_id', idEnviado)
      env.set('enviado_em', new Date().toISOString())
      try {
        $app.save(env)
      } catch (e8) {}

      // DEFEITO CORRIGIDO (13/11): a mensagem enviada NAO era gravada no
      // historico da conversa. Quem fazia isso era o webhook no evento
      // `messages.sent` — e a D-API NAO envia esse evento (confirmado: 0 em
      // 430+ eventos de hoje). Resultado: o vendedor abria a tela de Conversas
      // e via APENAS as mensagens do cliente, nunca o que o robo respondeu.
      // Agora a propria fila grava a saida usando o `wa_message_id` (dedupe).
      try {
        const colMsgF = $app.findCollectionByNameOrId('whatsapp_mensagens')
        var jaTem = false
        if (idEnviado !== '') {
          try {
            const exM = $app.findRecordsByFilter(
              colMsgF,
              "wa_message_id='" + idEnviado.replace(/'/g, '') + "'",
              '',
              1,
              0,
            )
            if (exM && exM.length > 0) jaTem = true
          } catch (eJa) {}
        }
        if (!jaTem) {
          const motivoM = String(env.get('motivo') || '')
          var autorM = 'sistema'
          if (motivoM.indexOf('ia_') === 0) autorM = 'ia'
          else if (motivoM.indexOf('vendedor_') === 0) autorM = 'vendedor'
          else if (motivoM === 'aviso_cliente') autorM = 'equipe_central'
          const m = new Record(colMsgF)
          m.set('conexao', String(env.get('conexao') || ''))
          m.set('contato_telefone', String(env.get('destino_telefone') || ''))
          m.set('direcao', 'saida')
          m.set('autor', autorM)
          m.set('texto', String(env.get('texto') || '').slice(0, 4000))
          m.set('status', 'enviado')
          try {
            m.set('wa_message_id', idEnviado)
          } catch (eWid) {}
          try {
            m.set('fixture', ehFixture)
          } catch (eFix) {}
          $app.save(m)
        }
      } catch (eMsgF) {}

      // CA-3-70 (05/11) — AO ENVIAR, A CONVERSA PASSA A "RESPONDIDA".
      // Antes disto só o webhook atualizava `ultimo_autor`, e quando o evento
      // de volta não chegava a conversa continuava marcada como "não lida"
      // mesmo depois de a vendedora responder. O bug apareceu na prova: a
      // resposta saiu pelo sistema e a marcação não sumiu.
      try {
        const convId = String(env.get('conversa') || '')
        var cvUp = null
        if (convId !== '') {
          try {
            cvUp = $app.findRecordById('whatsapp_conversas', convId)
          } catch (eCvId) {}
        }
        // a fila não guarda a conversa: acha por conexão + telefone
        if (!cvUp) {
          try {
            const achadas = $app.findRecordsByFilter(
              'whatsapp_conversas',
              "conexao='" +
                String(env.get('conexao') || '') +
                "' && contato_telefone='" +
                String(env.get('destino_telefone') || '') +
                "'",
              '',
              1,
              0,
            )
            if (achadas && achadas.length > 0) cvUp = achadas[0]
          } catch (eCvBusca) {}
        }
        if (cvUp) {
          const motivoUp = String(env.get('motivo') || '')
          // BUG CORRIGIDO (11/11): a condição estava INVERTIDA. `ia_resposta` é
          // o motivo do ROBÔ, mas ela marcava `equipe_central` — e então a
          // conversa parecia ter sido respondida por um humano. Resultado: o
          // robô seguia falando (não pausava) e as conversas ficavam em
          // triagem com "ultimo_autor" de gente.
          // Agora: robô -> 'ia'; vendedor/central -> 'vendedor'/'equipe_central'.
          if (motivoUp.indexOf('ia_') === 0) cvUp.set('ultimo_autor', 'ia')
          else if (String(env.get('conexao') || '') !== '') cvUp.set('ultimo_autor', 'vendedor')
          cvUp.set('ultima_previa', String(env.get('texto') || '').slice(0, 160))
          cvUp.set('ultima_mensagem_em', new Date().toISOString())
          $app.save(cvUp)
        }
      } catch (eCvUp) {}
      continue
    }

    if (status >= 400 && status < 500 && status !== 429) {
      env.set('estado', 'erro_definitivo')
      // CA-3-106/CA-3-108 (09/11): guarda o MOTIVO REAL da recusa, não só
      // "dapi_http_4xx". Antes o operador não sabia o que a D-API reclamou.
      // O telefone vai mascarado e a chave nunca entra.
      var motivo4xx = 'dapi_http_4xx'
      try {
        var limpo = corpoResp
        // mascara telefone (10+ dígitos seguidos) e qualquer token
        limpo = limpo.replace(/[0-9]{10,}/g, '***')
        limpo = limpo.replace(/"(api[_-]?key|token|authorization)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
        if (limpo !== '') motivo4xx = status + ' ' + limpo.slice(0, 240)
      } catch (eLimpo) {}
      env.set('ultimo_erro', motivo4xx.slice(0, 60))
      try {
        $app.save(env)
      } catch (e9) {}
      continue
    }

    // 16/11: o 5xx também guarda a RESPOSTA da D-API (mascarada), igual ao 4xx.
    // Antes ficava só "dapi_http_5xx" e não dava para saber por que a
    // apresentação pelo número do vendedor era recusada. O log leva até 240
    // caracteres; o campo, 60. Telefone e token nunca entram. (reenvio 16/11)
    var motivo5xx = status === 429 ? 'dapi_http_429' : 'dapi_http_5xx'
    try {
      var limpo5 = corpoResp
      limpo5 = limpo5.replace(/[0-9]{10,}/g, '***')
      limpo5 = limpo5.replace(/"(api[_-]?key|token|authorization)"\s*:\s*"[^"]*"/gi, '"$1":"***"')
      if (limpo5 !== '') motivo5xx = status + ' ' + limpo5.slice(0, 240)
    } catch (eLimpo5) {}
    console.log(
      'whatsapp_envios_fila: ' +
        String(env.get('motivo') || '') +
        ' -> resposta ' +
        motivo5xx.slice(0, 240),
    )
    env.set('ultimo_erro', motivo5xx.slice(0, 60))
    env.set('estado', tentativas >= 3 ? 'erro_definitivo' : 'erro')
    try {
      $app.save(env)
    } catch (e10) {}
  }
})
