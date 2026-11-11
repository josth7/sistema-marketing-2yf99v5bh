/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0171 — corrige dois pontos do CA-3-92 (11/11).
 *
 * **1. A config-modelo da Gol 7 não foi criada** pela migração anterior (o
 * `app.save` falhou silencioso). Sem ela, o painel de atendimento da Gol 7 não
 * existe e ninguém consegue configurar.
 *
 * **2. Três pessoas ficaram com escopo `*`** (todas as empresas) sem serem
 * donas de verdade:
 *   - `haisan.ecmm@gmail.com` — é o e-mail de retorno da D-API, não é pessoa;
 *   - `rodrigo@adapta.org` — é da **agência**, não é funcionário;
 *
 * **A decisão do dono (11/11):** "a Anezia é gerente administrativa, ela e o
 * Josth ficam nas duas empresas". Só esses dois.
 */
migrate(
  (app) => {
    // ---------- 1. config-modelo da Gol 7 ----------
    var idGol7 = ''
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        if (String(x.get('apelido') || '').indexOf('Gol') >= 0) idGol7 = x.id
      }
    } catch (e0) {}

    if (idGol7 === '') {
      console.log('0171: Gol 7 nao encontrada — abortando')
      return
    }

    var jaTem = false
    try {
      const ja = app.findRecordsByFilter('atendimento_config', "empresa='" + idGol7 + "'", '', 1, 0)
      jaTem = ja && ja.length > 0
    } catch (e1) {}

    if (!jaTem) {
      try {
        const colA = app.findCollectionByNameOrId('atendimento_config')
        const cfg = new Record(colA)
        cfg.set('versao', 1)
        cfg.set('ligado', false)
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
        console.log('0171: config-modelo da Gol 7 CRIADA')
      } catch (e2) {
        console.log('0171: falhou config -> ' + String(e2).slice(0, 180))
      }
    } else {
      console.log('0171: config da Gol 7 ja existia')
    }

    // ---------- 2. tirar o escopo `*` de quem não é dono ----------
    const NAO_DONOS = ['haisan.ecmm@gmail.com', 'rodrigo@adapta.org']
    for (const email of NAO_DONOS) {
      try {
        const us = app.findRecordsByFilter('users', "email='" + email + "'", '', 1, 0)
        if (!us || us.length === 0) continue
        const uid = us[0].id
        const gs = app.findRecordsByFilter(
          'access_grants',
          "user_id='" + uid + "' && revoked_at=''",
          '',
          10,
          0,
        )
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
          if (Array.isArray(sc) && sc.indexOf('*') >= 0) {
            g.set('scope_accounts', JSON.stringify([]))
            app.save(g)
            console.log('0171: tirei o escopo * de ' + email)
          }
        }
      } catch (e3) {
        console.log('0171: falhou ' + email + ' -> ' + String(e3).slice(0, 120))
      }
    }

    console.log('0171: pronto')
  },
  (app) => {
    console.log('0171 revertida')
  },
)
