/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0170 — Gol 7 + os dois donos das duas empresas (11/11) — CA-3-92.
 *
 * **Decisão do dono (11/11):** "a Anezia é gerente administrativa, ela e o Josth
 * ficam nas duas empresas". Ou seja: **dois donos** — `josth7@icloud.com` (dono)
 * e `anezia@haisan.com.br` (gerente administrativa).
 *
 * **O que esta migração faz:**
 *   1. cria a empresa **Gol 7** (ativa, sem dado da Haisan);
 *   2. dá à Anezia o grant de **dona** (`*`) — as duas empresas;
 *   3. cria a **configuração-modelo** da Gol 7 (painel de atendimento em branco,
 *      sem texto, FAQ nem palavra da Haisan);
 *   4. cria o usuário `goo7.ecmm@gmail.com` (Sabrina) com acesso **só à Gol 7**.
 *
 * **O que NÃO faz:** não conecta número de WhatsApp nem segredo de Meta/Google —
 * isso depende da D-API e das contas da Gol 7, que ainda não existem.
 */
migrate(
  (app) => {
    // ---------- 1. empresa Gol 7 ----------
    var idGol7 = ''
    try {
      const es = app.findRecordsByFilter('empresas', "apelido='Gol 7'", '', 1, 0)
      if (es.length > 0) idGol7 = es[0].id
    } catch (e0) {}

    if (idGol7 === '') {
      try {
        const colE = app.findCollectionByNameOrId('empresas')
        const emp = new Record(colE)
        emp.set('nome', 'Gol 7')
        emp.set('apelido', 'Gol 7')
        emp.set('cnpj', '')
        emp.set('ativa', true)
        emp.set('criada_em', new Date().toISOString())
        app.save(emp)
        idGol7 = emp.id
        console.log('0170: empresa Gol 7 criada')
      } catch (e1) {
        console.log('0170: falhou criar Gol 7 -> ' + String(e1).slice(0, 150))
        return
      }
    } else {
      console.log('0170: Gol 7 ja existia')
    }

    // ---------- 2. Anezia como DONA das duas ----------
    var idAnezia = ''
    try {
      const us = app.findRecordsByFilter('users', "email='anezia@haisan.com.br'", '', 1, 0)
      if (us.length > 0) idAnezia = us[0].id
    } catch (e2) {}

    if (idAnezia !== '') {
      try {
        const colG = app.findCollectionByNameOrId('access_grants')
        const gs = app.findRecordsByFilter(
          colG,
          "user_id='" + idAnezia + "' && revoked_at=''",
          '',
          5,
          0,
        )
        var achouDono = false
        for (const g of gs) {
          var sc = []
          try {
            const rawS = g.get('scope_accounts')
            sc =
              Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawS))
                : typeof rawS === 'string'
                  ? JSON.parse(rawS)
                  : rawS || []
          } catch (eS) {}
          if (Array.isArray(sc) && sc.indexOf('*') >= 0) achouDono = true
        }
        if (!achouDono && gs.length > 0) {
          // eleva o grant dela para dona (mantém as ações que ela já tem)
          gs[0].set('scope_accounts', JSON.stringify(['*']))
          app.save(gs[0])
          console.log('0170: Anezia elevada a dona das duas empresas')
        } else if (achouDono) {
          console.log('0170: Anezia ja era dona')
        }
      } catch (e3) {
        console.log('0170: falhou grant Anezia -> ' + String(e3).slice(0, 150))
      }
    }

    // ---------- 3. configuração-modelo da Gol 7 (em branco) ----------
    try {
      const colA = app.findCollectionByNameOrId('atendimento_config')
      const ja = app.findRecordsByFilter(colA, "empresa='" + idGol7 + "'", '', 1, 0)
      if (!ja || ja.length === 0) {
        const cfg = new Record(colA)
        cfg.set('versao', 1)
        cfg.set('ligado', false) // nasce DESLIGADO
        cfg.set('usar_horario', true)
        cfg.set('hora_inicio', '08:00')
        cfg.set('hora_fim', '17:30')
        cfg.set('dias', JSON.stringify([1, 2, 3, 4, 5]))
        cfg.set('janela_min', 720)
        cfg.set('textos', JSON.stringify({}))
        cfg.set('faq', JSON.stringify([]))
        cfg.set('palavras', JSON.stringify({}))
        cfg.set('observacao', 'configuracao-modelo da Gol 7 — sem dado da Haisan')
        cfg.set('empresa', idGol7)
        app.save(cfg)
        console.log('0170: config-modelo da Gol 7 criada (vazia, desligada)')
      }
    } catch (e4) {
      console.log('0170: falhou config Gol 7 -> ' + String(e4).slice(0, 150))
    }

    // ---------- 4. usuario goo7.ecmm@gmail.com (Sabrina) — SO Gol 7 ----------
    const emailSab = 'goo7.ecmm@gmail.com'
    var idSab = ''
    try {
      const us = app.findRecordsByFilter('users', "email='" + emailSab + "'", '', 1, 0)
      if (us.length > 0) idSab = us[0].id
    } catch (e5) {}

    if (idSab === '') {
      try {
        const colU = app.findCollectionByNameOrId('users')
        const novo = new Record(colU)
        novo.set('email', emailSab)
        novo.set('emailVisibility', true)
        novo.set('name', 'Sabrina — Gol 7')
        novo.set('verified', true)
        // LIÇÃO 29/10: em migração é setPassword, nunca set('password')
        novo.setPassword('Gol7@2026')
        app.save(novo)
        idSab = novo.id
        console.log('0170: usuario da Sabrina criado (goo7.ecmm@gmail.com)')
      } catch (e6) {
        console.log('0170: falhou criar Sabrina -> ' + String(e6).slice(0, 150))
      }
    }

    if (idSab !== '') {
      try {
        const colG = app.findCollectionByNameOrId('access_grants')
        const ja = app.findRecordsByFilter(
          colG,
          "user_id='" + idSab + "' && revoked_at=''",
          '',
          1,
          0,
        )
        if (!ja || ja.length === 0) {
          const g = new Record(colG)
          g.set('user_id', idSab)
          g.set('role', 'management')
          g.set(
            'actions',
            JSON.stringify([
              'read_leads',
              'read_conversas',
              'reply_conversas',
              'read_metrics',
              'manage_criteria',
              'read_alerts',
              'read_decisions',
              'read_reports',
              'manage_whatsapp',
              'read_analyses',
            ]),
          )
          // escopo VAZIO = só o próprio; a empresa é a Gol 7 e é o que a limita
          g.set('scope_accounts', JSON.stringify([]))
          g.set('scope_channels', JSON.stringify([]))
          g.set('empresa', idGol7) // ← SÓ a Gol 7
          g.set('valid_from', '')
          g.set('valid_until', '')
          g.set('approved_by', '')
          g.set('approved_at', new Date().toISOString())
          g.set('version', 1)
          g.set('revoked_at', '')
          g.set('note', 'admin da Gol 7 (decisao do dono 11/11)')
          app.save(g)
          console.log('0170: Sabrina com acesso SO na Gol 7')
        }
      } catch (e7) {
        console.log('0170: falhou grant Sabrina -> ' + String(e7).slice(0, 150))
      }
    }

    console.log(
      '0170: pronto (Gol7=' + idGol7 + ', Anezia=' + idAnezia + ', Sabrina=' + idSab + ')',
    )
  },
  (app) => {
    console.log('0170 revertida (empresa e usuarios permanecem)')
  },
)
