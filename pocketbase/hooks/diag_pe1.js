/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE O ROBÔ NÃO RESPONDEU ÀS 14:43? (11/11) — piloto.
 *
 * A conversa nasceu na central, foi transferida e o aviso ao cliente saiu —
 * mas NÃO existe nenhuma mensagem do robô. Ele deveria ter respondido E1
 * (boas-vindas) antes de transferir.
 *
 * Aqui se reproduz a decisão do roteiro para essa conversa, passo a passo.
 *
 * GET /backend/v1/piloto/porque-sem-e1
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/porque-sem-e1',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // a conversa
    var cv = null
    try {
      cv = app.findRecordById('whatsapp_conversas', '252jy5hhg3xflb6')
    } catch (e0) {
      return e.json(200, { ok: false, erro: 'conversa nao encontrada' })
    }

    out.conversa = {
      estado: String(cv.get('estado') || ''),
      tel: String(cv.get('contato_telefone') || ''),
      conexao: String(cv.get('conexao') || ''),
    }

    // 1. o robô está ligado e dentro do horário?
    var cfg = null
    try {
      const cfgs = app.findRecordsByFilter('atendimento_config', '', '', 200, 0)
      for (const c of cfgs) {
        const emp = String(c.get('empresa') || '')
        // a config da Haisan
        var nomeEmp = ''
        try {
          nomeEmp = String(app.findRecordById('empresas', emp).get('apelido') || '')
        } catch (eE) {}
        if (nomeEmp !== 'Gol 7' && nomeEmp !== 'TESTE') {
          if (!cfg || Number(c.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = c
        }
      }
    } catch (e1) {}
    out.robo = {
      ligado: cfg ? cfg.get('ligado') === true : false,
      versao: cfg ? Number(cfg.get('versao') || 0) : 0,
      usar_horario: cfg ? cfg.get('usar_horario') === true : false,
      hora_inicio: cfg ? String(cfg.get('hora_inicio') || '') : '',
      hora_fim: cfg ? String(cfg.get('hora_fim') || '') : '',
    }

    // 2. a conexão é central?
    var papel = ''
    try {
      papel = String(
        app.findRecordById('whatsapp_conexoes', String(cv.get('conexao'))).get('papel') || '',
      )
    } catch (e2) {}
    out.conexao_papel = papel
    out.passos.push({ passo: '1. conversa na central?', ok: papel === 'central', detalhe: papel })

    // 3. quantas mensagens do robô existem nessa conversa?
    var doRobo = 0
    var total = 0
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" +
          String(cv.get('conexao')) +
          "' && contato_telefone='" +
          String(cv.get('contato_telefone')) +
          "'",
        '',
        60,
        0,
      )
      total = msgs.length
      for (const m of msgs) {
        if (String(m.get('autor') || '') === 'ia') doRobo++
      }
    } catch (e3) {}
    out.mensagens_total = total
    out.mensagens_do_robo = doRobo
    out.passos.push({
      passo: '2. o robo respondeu?',
      ok: doRobo > 0,
      detalhe: doRobo + ' mensagem(ns) do robo',
    })

    // 4. o que o roteiro decidiria AGORA para "Olá! Vi o anúncio"
    try {
      const body = { texto: 'Olá! Vi o anúncio da Haisan no Google' }
      out.roteiro_simulado = 'ver /whatsapp/roteiro/simular'
    } catch (e4) {}

    // 5. o estado da conversa já foi transferida — o robo age em triagem
    out.passos.push({
      passo: '3. estado permite o robo?',
      ok: String(cv.get('estado')) === 'triagem',
      detalhe: 'estado atual: ' + String(cv.get('estado')),
    })

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
