/// <reference path="../pb_data/types.d.ts" />
/**
 * GET /backend/v1/analises/canal-estado — saúde do canal Maestro↔sistema
 * para a tela Saúde (card 6b8c8de9, SPEC-3-001).
 *
 * Por que este arquivo existe (04/11): a rota foi criada em 20/10 dentro de
 * analises.js e se perdeu em 21/10, quando analises.js foi dividido em
 * analises_canal.js e analises_fixtures.js — só a versão de teste
 * (/backend/v1/fixtures/canal-estado) sobreviveu. A tela Saúde chamava a rota
 * e recebia 404. Uma rota por arquivo, como pede o guia do Skip.
 *
 * Só leitura, exige login. Nunca devolve o valor de segredo.
 */
routerAdd(
  'GET',
  '/backend/v1/analises/canal-estado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var recs = []
    try {
      const colC = $app.findCollectionByNameOrId('canal_estado')
      recs = $app.findRecordsByFilter(colC, '', '', 1, 0)
    } catch (eC) {
      return e.json(200, { ok: true, canal: null })
    }
    if (!recs || recs.length === 0) return e.json(200, { ok: true, canal: null })
    const c = recs[0]
    return e.json(200, {
      ok: true,
      canal: {
        segredo_configurado: c.get('segredo_configurado') === true,
        ultimo_consumo_em: c.get('ultimo_consumo_em') || null,
        ciclos_sem_consumo: Number(c.get('ciclos_sem_consumo') || 0),
        recusas_401_total: Number(c.get('recusas_401_total') || 0),
        recusas_401_ultimas_24h: Number(c.get('recusas_401_ultimas_24h') || 0),
        ultimo_motivo: c.get('ultimo_motivo') || null,
        atualizado_em: c.get('atualizado_em') || null,
      },
    })
  },
  $apis.requireAuth(),
)
