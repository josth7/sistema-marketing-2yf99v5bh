/// <reference path="../pb_data/types.d.ts" />
/**
 * AVISO AO VENDEDOR QUANDO O CLIENTE RESPONDE NA CENTRAL (10/11) — CA-3-112, RN-191.
 *
 * **O caso real (Sabrina, 09/11 17h03):** a Elisângela respondeu o cliente pelo
 * CRM. O cliente respondeu de volta — mas na **central**. Nada chegou ao
 * celular dela. A conversa ficou parada até alguém abrir o sistema.
 *
 * **A regra:** cliente de lead com dono escreve num número que **não é o do
 * dono** → sai um aviso **da central para o número do dono**:
 *
 *   "{{1}} respondeu na central: "{{2}}". Abra no sistema: {{3}}"
 *
 * **As travas (todas do RN-191):**
 *   - no máximo **1 aviso por cliente a cada 15 min** (mensagens seguidas viram um);
 *   - **não avisa** se alguém da equipe já respondeu depois;
 *   - **não avisa** enquanto a IA está atendendo a conversa;
 *   - chave desligada na Administração → não manda nada;
 *   - dono suspenso ou sem conexão → o cliente vai para "Precisa de ação".
 *
 * Cron: a cada 2 minutos.
 */
cronAdd('wa_aviso_resposta', '*/2 * * * *', () => {
  try {
    const app = $app

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    // ---------- chave ligada? ----------
    var cfg = null
    try {
      const vs = app.findRecordsByFilter('admin_config', '', '', 200, 0)
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
    } catch (e0) {
      return
    }
    if (!cfg) return
    // nasce ligada: só não manda se explicitamente false
    if (cfg.get('aviso_vendedor_ativo') === false) return

    // ---------- conexões ----------
    const cxPapel = {}
    const cxVend = {}
    var central = null
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        60,
        0,
      )) {
        cxPapel[c.id] = String(c.get('papel') || '')
        cxVend[c.id] = String(c.get('vendedor_user') || '')
        if (String(c.get('papel')) === 'central') central = c
      }
    } catch (e1) {}
    if (!central) return

    // número do dono: o campo `numero` da conexão do vendedor (não o id!)
    const numeroDoDono = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        60,
        0,
      )) {
        const u = String(c.get('vendedor_user') || '')
        const num = String(c.get('numero') || '').replace(/[^0-9]/g, '')
        if (u !== '' && num !== '') numeroDoDono[u] = num
      }
    } catch (eNum) {}

    const agora = new Date().getTime()
    // ---------- mensagens de cliente recentes ----------
    // BUG (10/11): ler 4000 mensagens SEM filtro de data trazia as antigas e
    // deixava as de hoje FORA (o banco devolve em ordem arbitrária). Aqui se
    // filtra pela data DIRETO no banco: só o que interessa.
    var msgs = []
    const desde = new Date(agora - 6 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    try {
      msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada' && created>='" + desde + "'",
        '',
        3000,
        0,
      )
    } catch (e2) {
      // se o filtro de data falhar, cai no antigo (sem data) para não parar
      try {
        msgs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "direcao='entrada'",
          '',
          4000,
          0,
        )
      } catch (e2b) {
        return
      }
    }

    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || '')
      }
    } catch (e3) {}

    var enviados = 0
    const jaAvisado = {}

    for (const m of msgs) {
      // BUG (10/11): `enviada_em` pode vir VAZIO nas mensagens gravadas pelo
      // webhook — o filtro de 2h matava todas e o aviso nunca saía.
      // Usa `created` como reserva: é sempre preenchido pelo banco.
      var q = new Date(String(m.get('enviada_em') || '')).getTime()
      if (!(q > 0)) q = new Date(String(m.get('created') || '')).getTime()
      if (!(q > 0)) continue
      // só das últimas 6h: aviso atrasado não ajuda, mas 2h era curto demais
      // para o intervalo do cron (2 min) mais o tempo de fila
      if (agora - q > 6 * 3600000) continue
      if (String(m.get('fixture')) === 'true') continue

      const cx = String(m.get('conexao') || '')
      // só a CENTRAL gera aviso (o número do dono não precisa de aviso)
      if (cxPapel[cx] !== 'central') continue

      const tel = String(m.get('contato_telefone') || '').replace(/[^0-9]/g, '')
      if (tel === '') continue
      if (jaAvisado[tel]) continue

      // acha o lead pelo telefone
      var lead = null
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "' && fixture=false",
          '',
          1,
          0,
        )
        if (ls && ls.length > 0) lead = ls[0]
      } catch (e4) {}
      if (!lead) continue

      const dono = String(lead.get('owner_id') || '')
      if (dono === '') continue

      // dono tem conexão ativa?
      var cxDono = ''
      for (const id in cxVend) {
        if (cxVend[id] === dono && cxPapel[id] === 'vendedor') cxDono = id
      }
      if (cxDono === '') {
        // sem conexão: o cliente vai para "Precisa de ação"
        try {
          const colPA = app.findCollectionByNameOrId('precisa_acao')
          const ja = app.findRecordsByFilter(
            colPA,
            "lead='" + lead.id + "' && resolvido=false",
            '',
            1,
            0,
          )
          if (!ja || ja.length === 0) {
            const pa = new Record(colPA)
            pa.set('lead', lead.id)
            pa.set('motivo', 'aviso_sem_canal')
            pa.set('resolvido', false)
            pa.set('fixture', false)
            app.save(pa)
          }
        } catch (e5) {}
        continue
      }

      // ---------- trava 15 min ----------
      const chave = 'aviso_resposta|' + tel
      var recente = false
      try {
        const ant = app.findRecordsByFilter(
          colEnv,
          "dedupe_key~'aviso_resposta' && destino_telefone='" + tel + "'",
          '',
          5,
          0,
        )
        for (const a of ant) {
          const qa = new Date(String(a.get('created') || '')).getTime()
          if (qa > 0 && agora - qa < 15 * 60000) recente = true
        }
      } catch (e6) {}
      if (recente) continue

      // ---------- alguém da equipe respondeu depois? ----------
      var equipeRespondeu = false
      try {
        const saidas = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" + cx + "' && contato_telefone='" + tel + "' && direcao='saida'",
          '',
          200,
          0,
        )
        for (const s of saidas) {
          const qs = new Date(String(s.get('enviada_em') || s.get('created') || '')).getTime()
          if (qs > q) equipeRespondeu = true
        }
      } catch (e7) {}
      if (equipeRespondeu) continue

      // ---------- IA ainda atendendo? ----------
      var iaAtendendo = false
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + cx + "' && contato_telefone='" + tel + "'",
          '',
          1,
          0,
        )
        if (cvs && cvs.length > 0) {
          const est = String(cvs[0].get('estado') || '')
          if (est === 'triagem') iaAtendendo = true
        }
      } catch (e8) {}
      if (iaAtendendo) continue

      // ---------- monta e enfileira ----------
      const primeiro =
        String(lead.get('nome') || '')
          .trim()
          .split(/\s+/)[0] || ''
      const pre = String(m.get('texto') || m.get('legenda') || '').trim()
      var previa = pre !== '' ? pre.slice(0, 60) : '[mídia]'
      const numDono = numeroDoDono[dono] || ''
      const link = 'https://sistema-marketing-1f51e.goskip.app/conversas'

      const textoAviso =
        (primeiro !== '' ? primeiro : 'Um cliente') +
        ' respondeu na central: "' +
        previa +
        '". Abra no sistema: ' +
        link

      try {
        const env = new Record(colEnv)
        env.set('conexao', central.id)
        env.set('destino_telefone', numDono)
        env.set('motivo', 'aviso_vendedor')
        env.set('modo', 'texto')
        env.set('texto', textoAviso)
        env.set('legenda', '')
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('fixture', false)
        // ITEM 3 (12/11) — "Value must be unique" dezenas de vezes por minuto.
        // A chave usava o MINUTO da mensagem: duas rodadas do cron no mesmo
        // minuto geravam a mesma chave e a segunda estourava no índice UNIQUE
        // do banco. Agora, antes de gravar, confere se a chave já existe e
        // simplesmente PULA — sem logar erro.
        const chaveFinal = chave + '|' + String(Math.floor(q / 60000))
        var jaExiste = false
        try {
          const ex = app.findRecordsByFilter(colEnv, "dedupe_key='" + chaveFinal + "'", '', 1, 0)
          if (ex && ex.length > 0) jaExiste = true
        } catch (eCh) {
          // se a consulta falhar, segue: o catch do save trata
        }
        if (jaExiste) {
          jaAvisado[tel] = true
          continue
        }
        env.set('dedupe_key', chaveFinal)
        app.save(env)
        enviados++
        jaAvisado[tel] = true
      } catch (e9) {
        console.log('wa_aviso_resposta: falhou -> ' + String(e9).slice(0, 120))
      }
    }

    if (enviados > 0) {
      console.log('wa_aviso_resposta: ' + enviados + ' aviso(s) enfileirado(s)')
    }
  } catch (eTop) {}
})
