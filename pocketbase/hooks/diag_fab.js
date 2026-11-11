routerAdd(
  'GET',
  '/backend/v1/piloto/diag-fabio',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cv = $app.findRecordById('whatsapp_conversas', '2tk4ky74ahqvi6t')
    const cx = $app.findRecordById('whatsapp_conexoes', String(cv.get('conexao')))
    const cfg = $app.findRecordsByFilter('atendimento_config', '', '', 200, 0)
    var ativa = null
    for (const c of cfg)
      if (!ativa || Number(c.get('versao') || 0) > Number(ativa.get('versao') || 0)) ativa = c
    return e.json(200, {
      conversa_estado: String(cv.get('estado')),
      conexao_papel: String(cx.get('papel')),
      conexao_nome: String(cx.get('nome_exibicao')),
      robo_ligado: ativa ? ativa.get('ligado') === true : false,
      robo_versao: ativa ? Number(ativa.get('versao')) : 0,
      regra: 'o robo so age na conexao CENTRAL em estado triagem',
    })
  },
  $apis.requireAuth(),
)
