/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — por que o envio da IA não entra na fila.
 *
 * O motor decide, marca a conversa como `transferida`... e o registro em
 * `whatsapp_envios` não existe. O `catch (eEnv) {}` esconde o motivo.
 *
 * Aqui eu tento criar o registro EXATAMENTE como o cron faz e devolvo o erro
 * real do PocketBase, em vez de engolir.
 *
 * GET /backend/v1/diag/teste-envio-fila
 */
routerAdd(
  'GET',
  '/backend/v1/diag/teste-envio-fila',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { tentativas: [] }

    // campos obrigatórios da coleção (para comparar)
    try {
      const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
      const campos = []
      for (const f of colEnv.fields || []) {
        if (f.required) campos.push(String(f.name))
      }
      out.obrigatorios = campos
    } catch (eC) {}

    var central = null
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) central = cxs[0]
    } catch (e0) {}
    if (!central) {
      out.erro = 'sem central'
      return e.json(200, out)
    }

    // exatamente como o cron monta
    const cvId = 'teste-diag'
    const tenta = [
      { nome: 'como o cron', campos: { lead: '', destino: '5541999000088', motivo: 'ia_roteiro' } },
      { nome: 'sem lead', campos: { lead: null, destino: '5541999000088', motivo: 'ia_roteiro' } },
      {
        nome: 'com lead vazio string',
        campos: { lead: '', destino: '5541999000088', motivo: 'ia_roteiro' },
      },
    ]

    for (const t of tenta) {
      const item = { nome: t.nome, ok: false, erro: '' }
      try {
        const env = new Record($app.findCollectionByNameOrId('whatsapp_envios'))
        if (t.campos.lead !== null) env.set('lead', t.campos.lead)
        env.set('conexao', central.id)
        env.set('destino_telefone', t.campos.destino)
        env.set('motivo', 'ia_roteiro')
        env.set('modo', 'texto')
        env.set('texto', 'teste de fila ' + new Date().toISOString())
        env.set('legenda', '')
        env.set('autor_user', '')
        env.set('criado_por', '')
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('fixture', false)
        env.set(
          'dedupe_key',
          'diagfila-' + cvId + '-' + new Date().getTime() + '-' + t.nome.replace(/ /g, ''),
        )
        $app.save(env)
        item.ok = true
        item.id = env.id
      } catch (err) {
        item.erro = String(err).slice(0, 300)
      }
      out.tentativas.push(item)
      if (item.ok) break // se funcionou, não precisa testar as outras
    }

    // e o mínimo absoluto?
    if (
      !out.tentativas.some(function (t) {
        return t.ok
      })
    ) {
      try {
        const env = new Record($app.findCollectionByNameOrId('whatsapp_envios'))
        env.set('texto', 'minimo')
        $app.save(env)
        out.minimo = { ok: true, id: env.id }
      } catch (err2) {
        out.minimo = { ok: false, erro: String(err2).slice(0, 300) }
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
