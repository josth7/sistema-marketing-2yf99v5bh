/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0172 — isola os acessos da Gol 7 (13/11).
 *
 * **O que a gestão viu (12/11):** uma conta criada para a Gol 7 mostrava dados
 * da Haisan no painel, nas análises e nos critérios.
 *
 * **Causa:**
 *   1. a tela "Nova pessoa" criava o grant SEM empresa; o cron
 *      `wa_empresa_auto` carimbava a Haisan em todo grant vazio;
 *   2. o cargo gestão nasce com `*`, e `*` era lido como "dono das duas";
 *   3. `/backend/v1/metricas` e `/backend/v1/analises` não filtravam empresa.
 * Os itens 1 a 3 foram corrigidos nos hooks; esta migração arruma os dados.
 *
 * **O que faz:** toda conta cujo e-mail é da Gol 7 (`gol7` / `goo7`) passa a
 * ter o grant SÓ na Gol 7 e perde o `*` (não é dona). Josth e Anezia, os
 * donos decididos em 11/11, não são tocados. Não apaga nada.
 *
 * Também registra no log quantas contas que não são donas têm `*` (só a
 * contagem e o e-mail mascarado), para a gestão conferir.
 */
migrate(
  (app) => {
    var idGol7 = ''
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        if (String(x.get('apelido') || '').indexOf('Gol') >= 0) idGol7 = x.id
      }
    } catch (e0) {}
    if (idGol7 === '') {
      console.log('0172: Gol 7 nao encontrada — nada a fazer')
      return
    }

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
    function mascara(em) {
      const s = String(em || '')
      const a = s.indexOf('@')
      if (a < 0) return '***'
      return s.slice(0, 2) + '***' + s.slice(a)
    }
    function ehDono(em) {
      const s = String(em || '').toLowerCase()
      return s === 'anezia@haisan.com.br' || s.indexOf('josth') >= 0
    }

    var usuarios = []
    try {
      usuarios = app.findRecordsByFilter('users', '', '', 2000, 0)
    } catch (e1) {}

    var movidos = 0
    var semEstrela = 0
    const naoDonosComEstrela = []
    for (const u of usuarios) {
      const em = String(u.get('email') || '').toLowerCase()
      const daGol7 = em.indexOf('gol7') >= 0 || em.indexOf('goo7') >= 0
      var gs = []
      try {
        gs = app.findRecordsByFilter(
          'access_grants',
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          20,
          0,
        )
      } catch (e2) {
        continue
      }
      for (const g of gs) {
        const sc = lerL(g.get('scope_accounts'))
        const temEstrela = Array.isArray(sc) && sc.indexOf('*') >= 0
        if (daGol7 && !ehDono(em)) {
          var mudou = false
          if (String(g.get('empresa') || '') !== idGol7) {
            g.set('empresa', idGol7)
            mudou = true
            movidos++
          }
          if (temEstrela) {
            g.set('scope_accounts', JSON.stringify([]))
            mudou = true
            semEstrela++
          }
          if (mudou) {
            try {
              app.save(g)
            } catch (e3) {
              console.log('0172: falhou salvar grant -> ' + String(e3).slice(0, 120))
            }
          }
        } else if (temEstrela && !ehDono(em)) {
          if (naoDonosComEstrela.indexOf(mascara(em)) < 0) naoDonosComEstrela.push(mascara(em))
        }
      }
    }

    console.log(
      '0172: grants da Gol 7 movidos para a Gol 7 = ' + movidos + '; `*` retirado = ' + semEstrela,
    )
    console.log(
      '0172: contas com `*` que nao sao donas (gestao) = ' +
        naoDonosComEstrela.length +
        ' -> ' +
        naoDonosComEstrela.join(', '),
    )
  },
  (app) => {
    console.log('0172 revertida (nada a desfazer)')
  },
)
