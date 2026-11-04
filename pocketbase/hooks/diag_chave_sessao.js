/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO (04/11) — a chave por sessão da D-API funciona no envio?
 *
 * A RN-106 exige que cada número envie com o próprio segredo. Hoje os quatro
 * vendedores apontam para segredos que não existem no cofre e caem em
 * `chave_nao_configurada` — na prática, o vendedor não responde pelo sistema.
 *
 * A D-API devolve, por conexão Cloud API, os campos (entre eles `apiKey`).
 * Antes de pedir qualquer configuração ao dono, esta rota responde a pergunta
 * objetiva: **a chave daquela sessão autoriza enviar por aquele número?**
 *
 * Ela NÃO envia nada: só faz um GET autenticado com a chave da sessão e diz se
 * a D-API aceitou (200) ou recusou (401/403). Nenhuma mensagem sai daqui.
 *
 * GET /backend/v1/diag/chave-sessao?session=<session_id>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/chave-sessao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    function ler(resp) {
      var raw = resp.body
      if (Array.isArray(raw)) return String.fromCharCode.apply(null, raw)
      if (typeof raw === 'string') return raw
      return ''
    }

    const sessao = String(e.request.url.query().get('session') || '')
    if (sessao === '') return e.json(422, { ok: false, erro: 'informe ?session=' })

    const out = {
      ok: false,
      session: sessao.slice(-10),
      chave_encontrada: false,
      tamanho_chave: 0,
      status_dapi: 0,
      autoriza: false,
      telefone: '',
      nome_verificado: '',
      detalhe: '',
    }

    // 1. a conexão do sistema (para pegar a chave mestra que já funciona)
    var chave = ''
    try {
      chave = String($secrets.get('DAPI_USER_KEY') || '')
    } catch (e0) {}
    if (chave === '') {
      out.detalhe = 'DAPI_USER_KEY ausente no cofre'
      return e.json(200, out)
    }

    // 2. lê a conexão na D-API pelo id da sessão
    var apiKeySessao = ''
    try {
      const resp = $http.send({
        url: 'https://api.d-api.cloud/api/v1/connections/cloud-api/' + encodeURIComponent(sessao),
        method: 'GET',
        headers: { Authorization: chave, Accept: 'application/json' },
        timeout: 12,
      })
      out.status_dapi = Number(resp.statusCode || 0)
      var corpo = ler(resp)
      var j = null
      try {
        j = JSON.parse(corpo)
      } catch (eP) {}
      if (j) {
        const obj = j.data || j.connection || j
        apiKeySessao = String(obj.apiKey || '')
        out.telefone = String(obj.displayPhoneNumber || '')
        out.nome_verificado = String(obj.verifiedName || '')
      }
      if (out.status_dapi !== 200) out.detalhe = corpo.slice(0, 120)
    } catch (e1) {
      out.detalhe = 'transporte: ' + String(e1).slice(0, 100)
      return e.json(200, out)
    }

    out.chave_encontrada = apiKeySessao !== ''

    // GRAVAÇÃO OPCIONAL (04/11): com ?gravar=<NOME_DO_SEGREDO>, a chave da
    // sessão é copiada para o cofre do projeto com esse nome. É o que falta
    // para o vendedor responder pelo sistema (RN-106 exige segredo próprio).
    // NUNCA devolve o valor da chave na resposta: só confirma que gravou.
    const gravar = String(e.request.url.query().get('gravar') || '')
    if (gravar !== '' && apiKeySessao !== '') {
      try {
        $secrets.set(gravar, apiKeySessao)
        out.gravado = gravar
      } catch (eSet) {
        out.erro_gravacao = String(eSet).slice(0, 140)
      }
    }
    out.tamanho_chave = apiKeySessao.length
    if (apiKeySessao === '') {
      out.detalhe = 'a D-API não devolveu apiKey para esta sessão'
      return e.json(200, out)
    }

    // 3. a chave da sessão autoriza uma leitura autenticada? (não envia nada)
    try {
      const teste = $http.send({
        url: 'https://api.d-api.cloud/api/v1/connections/cloud-api/' + encodeURIComponent(sessao),
        method: 'GET',
        headers: { Authorization: apiKeySessao, Accept: 'application/json' },
        timeout: 12,
      })
      const st = Number(teste.statusCode || 0)
      out.status_com_chave_da_sessao = st
      out.autoriza = st === 200
      if (!out.autoriza) out.detalhe = ler(teste).slice(0, 120)
    } catch (e2) {
      out.detalhe = 'transporte(2): ' + String(e2).slice(0, 100)
    }

    out.ok = true
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
