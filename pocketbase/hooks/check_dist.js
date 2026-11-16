/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/diag-dist',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // quantos leads sem dono ou com dono invalido?
    const todos = app.findRecordsByFilter(
      app.findCollectionByNameOrId('crm_leads'),
      'fixture=false',
      '',
      6000,
      0,
    )
    out.total_leads = todos.length
    // usuarios validos
    const idsValidos = {}
    for (const u of app.findRecordsByFilter(
      app.findCollectionByNameOrId('users'),
      '',
      '',
      300,
      0,
    )) {
      const em = String(u.get('email') || '')
      if (em.toLowerCase().indexOf('fixture') >= 0) continue
      idsValidos[u.id] = true
    }
    var semDono = 0,
      donoInvalido = 0,
      comDedupe = 0,
      semDedupe = 0
    var antigos = 0
    const agora = new Date().getTime()
    var exemplos = []
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') {
        semDono++
      } else if (idsValidos[ow] !== true) {
        donoInvalido++
      } else continue
      // idade
      const cr = String(l.get('created') || '')
      const idade = agora - new Date(cr).getTime()
      if (idade > 30 * 86400000) {
        antigos++
        continue
      }
      // tem dedupe?
      var tem = false
      try {
        const ja = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_eventos'),
          "dedupe_key='aviso_lead_novo|" + l.id + "'",
          '',
          1,
          0,
        )
        tem = ja && ja.length > 0
      } catch (e1) {}
      if (tem) comDedupe++
      else semDedupe++
      if (exemplos.length < 5)
        exemplos.push({
          nome: String(l.get('nome') || '').slice(0, 16),
          dono: ow.slice(0, 8),
          tem_dedupe: tem,
          dias: Math.round(idade / 86400000),
        })
    }
    out.sem_dono = semDono
    out.dono_invalido = donoInvalido
    out.fora_janela_30d = antigos
    out.com_dedupe_ja_avisado = comDedupe
    out.sem_dedupe_vai_distribuir = semDedupe
    out.exemplos = exemplos
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
