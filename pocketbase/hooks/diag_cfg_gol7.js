/// <reference path="../pb_data/types.d.ts" />
/**
 * CONFIG-MODELO DA GOL 7 — versão 12 (11/11) — CA-3-92.
 *
 * **A causa da falha:** o campo `versao` de `atendimento_config` tem índice
 * **UNIQUE global** — a versão é do sistema, não da empresa. As 11 existentes
 * são da Haisan (1 a 11), então criar "versão 1" para a Gol 7 colide.
 *
 * **A correção:** a config da Gol 7 nasce na **versão 12** (a próxima livre),
 * com `empresa` da Gol 7 e **todo o conteúdo vazio** — sem texto, FAQ nem
 * palavra da Haisan.
 *
 * GET /backend/v1/empresas/cria-config-gol7-v12
 */
routerAdd(
  'GET',
  '/backend/v1/empresas/cria-config-gol7-v12',
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

    // já existe config dela?
    try {
      const ja = app.findRecordsByFilter('atendimento_config', "empresa='" + idGol7 + "'", '', 1, 0)
      if (ja && ja.length > 0) {
        out.ja_existia = true
        out.versao = Number(ja[0].get('versao') || 0)
        return e.json(200, out)
      }
    } catch (e1) {}

    // maior versao do sistema
    var maior = 0
    try {
      for (const c of app.findRecordsByFilter('atendimento_config', '', '', 500, 0)) {
        const v = Number(c.get('versao') || 0)
        if (v > maior) maior = v
      }
    } catch (e2) {}
    const nova = maior + 1
    out.versao_anterior = maior
    out.versao_nova = nova

    try {
      const colA = app.findCollectionByNameOrId('atendimento_config')
      const cfg = new Record(colA)
      cfg.set('versao', nova)
      cfg.set('ligado', false)
      cfg.set('usar_horario', true)
      cfg.set('hora_inicio', '08:00')
      cfg.set('hora_fim', '17:30')
      cfg.set('janela_min', 720)
      cfg.set('textos', JSON.stringify({}))
      cfg.set('faq', JSON.stringify([]))
      cfg.set('palavras', JSON.stringify({}))
      cfg.set('observacao', 'config-modelo da Gol 7 — sem dado da Haisan')
      cfg.set('empresa', idGol7)
      app.save(cfg)
      out.criada = true
      out.id = cfg.id
    } catch (e3) {
      out.ok = false
      out.erro = String(e3).slice(0, 300)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
