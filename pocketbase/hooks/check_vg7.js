/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/varre-goo7',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, ocorrencias: [], total: 0 }
    // colecoes onde o nome pode aparecer para o usuario
    const ALVOS = [
      'whatsapp_conexoes',
      'whatsapp_conversas',
      'admin_config',
      'atendimento_config',
      'reports',
      'decisions',
      'alerts',
      'alert_criteria',
      'campanhas',
      'canal_estado',
      'fontes_estado',
      'acessos',
      'access_grants',
      'whatsapp_avisos_email',
      'precisa_acao',
    ]
    for (const nome of ALVOS) {
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, '', '', 500, 0)
      } catch (e1) {
        continue
      }
      for (const r of regs) {
        for (const f of [
          'nome',
          'titulo',
          'apelido',
          'texto',
          'mensagem',
          'observacao',
          'rotulo',
          'detalhe',
          'nota',
          'descricao',
        ]) {
          var v = ''
          try {
            v = String(r.get(f) || '')
          } catch (e2) {
            continue
          }
          if (v.indexOf('Gol 7') >= 0) {
            out.total++
            if (out.ocorrencias.length < 20)
              out.ocorrencias.push({
                colecao: nome,
                campo: f,
                id: r.id.slice(0, 10),
                trecho: v.slice(0, 60),
              })
          }
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
