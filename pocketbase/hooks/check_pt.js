/// <reference path="../pb_data/types.d.ts" />
/**
 * PREPARA O NUMERO DE TESTE PARA O ROBO (12/11 15:07).
 *
 * O 4198903-6170 tem conversa na central em `transferida` (de 12/11 16:28).
 * O robo so age em `triagem`. Aqui se devolve para triagem para o teste poder
 * rodar — e se limpa a marca de resposta da IA, senao ele acha que ja falou.
 *
 * GET /backend/v1/check/prepara-teste?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/prepara-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, alteradas: [], nao_achadas: [] }

    // as conexoes centrais
    var centrais = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        5,
        0,
      )) {
        centrais[c.id] = String(c.get('nome_exibicao') || '')
      }
    } catch (e0) {}

    const TELS = ['554189036170', '4189036170']

    for (const tel of TELS) {
      var cvs = []
      try {
        cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "'",
          '',
          10,
          0,
        )
      } catch (e1) {}
      for (const cv of cvs) {
        const cx = String(cv.get('conexao') || '')
        if (!centrais[cx]) continue // so a da central
        const antes = String(cv.get('estado') || '')
        out.alteradas.push({
          tel: tel,
          conexao: centrais[cx],
          estado_antes: antes,
          acao: antes === 'triagem' ? 'ja estava em triagem' : 'devolver para triagem',
        })
        if (executar && antes !== 'triagem') {
          try {
            cv.set('estado', 'triagem')
            cv.set('pausada_motivo', '')
            cv.set('pausada_em', '')
            // limpa a marca de resposta da IA: o robo tem de poder falar de novo
            try {
              cv.set('ultima_resposta_ia_em', '')
            } catch (eU) {}
            // e o autor volta a ser o cliente (fim do atendimento anterior)
            cv.set('ultimo_autor', 'cliente')
            app.save(cv)
          } catch (e2) {
            out.erro = String(e2).slice(0, 120)
          }
        }
      }
    }

    out.aviso = executar
      ? 'aplicado — a conversa esta em triagem e o robo pode agir'
      : 'simulacao — chame com ?executar=1'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
