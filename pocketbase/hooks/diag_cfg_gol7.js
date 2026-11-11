/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE A CONFIG DA GOL 7 NÃO É CRIADA? (11/11) — CA-3-92.
 *
 * A migração tenta criar a config-modelo e o `save` falha sem dizer nada.
 * Aqui se tenta pela ROTA, mostrando o erro completo.
 *
 * GET /backend/v1/empresas/cria-config-gol7
 */
routerAdd(
  'GET',
  '/backend/v1/empresas/cria-config-gol7',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    var idGol7 = ''
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        if (String(x.get('apelido') || '').indexOf('Gol') >= 0) idGol7 = x.id
      }
    } catch (e0) {}
    if (idGol7 === '') return e.json(200, { ok: false, erro: 'Gol 7 nao encontrada' })
    out.empresa = idGol7.slice(0, 10)

    // campos da colecao (para saber se algum nome esta errado)
    try {
      const colA = app.findCollectionByNameOrId('atendimento_config')
      const campos = []
      for (const f of colA.fields || []) campos.push(String(f.name))
      out.campos_disponiveis = campos
    } catch (e1) {
      out.erro_campos = String(e1).slice(0, 120)
    }

    // tenta criar
    try {
      const colA = app.findCollectionByNameOrId('atendimento_config')
      const cfg = new Record(colA)
      cfg.set('versao', 1)
      cfg.set('ligado', false)
      cfg.set('usar_horario', true)
      cfg.set('hora_inicio', '08:00')
      cfg.set('hora_fim', '17:30')
      cfg.set('janela_min', 720)
      cfg.set('textos', JSON.stringify({}))
      cfg.set('faq', JSON.stringify([]))
      cfg.set('palavras', JSON.stringify({}))
      cfg.set('observacao', 'config-modelo da Gol 7')
      cfg.set('empresa', idGol7)
      app.save(cfg)
      out.criada = true
      out.id = cfg.id
    } catch (e2) {
      out.ok = false
      out.erro = String(e2).slice(0, 400)
    }

    // confere
    try {
      const ja = app.findRecordsByFilter('atendimento_config', "empresa='" + idGol7 + "'", '', 5, 0)
      out.quantas_depois = ja.length
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
