/// <reference path="../pb_data/types.d.ts" />
/**
 * O NÚMERO DA GOL 7 JÁ EXISTE NO SISTEMA? (11/11).
 *
 * O dono informou que o número da Gol 7 é 55 41 9156-2937. **Esse número foi
 * usado hoje no teste do piloto** e virou conversa + lead na HAISAN.
 *
 * Antes de conectar, preciso saber: ele já é uma sessão na D-API? Em qual
 * conta? Está vinculado à Haisan?
 *
 * GET /backend/v1/check/numero-gol7
 */
routerAdd(
  'GET',
  '/backend/v1/check/numero-gol7',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, ocorrencias: [], conexoes: [] }

    // 1. já existe como conexão?
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "numero~'91562937'",
        '',
        10,
        0,
      )
      for (const c of cs) {
        out.conexoes.push({
          nome: String(c.get('nome_exibicao') || ''),
          papel: String(c.get('papel') || ''),
          numero: String(c.get('numero') || ''),
          session: String(c.get('session_id') || '').slice(0, 20),
          ativo: c.get('ativo') === true,
          empresa: String(c.get('empresa') || '').slice(0, 10),
        })
      }
    } catch (e0) {}

    // 2. já existe como contato/conversa? (usado no piloto)
    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone~'91562937'",
        '',
        10,
        0,
      )
      for (const c of cvs) {
        var cxNome = ''
        try {
          cxNome = String(
            app
              .findRecordById('whatsapp_conexoes', String(c.get('conexao')))
              .get('nome_exibicao') || '',
          )
        } catch (eC) {}
        out.ocorrencias.push({
          tipo: 'conversa',
          nome: String(c.get('contato_nome') || ''),
          conexao: cxNome,
          estado: String(c.get('estado') || ''),
          quando: String(c.get('created') || '').slice(0, 16),
        })
      }
    } catch (e1) {}

    // 3. já existe como lead?
    try {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone~'91562937'",
        '',
        10,
        0,
      )
      for (const l of ls) {
        out.ocorrencias.push({
          tipo: 'lead',
          nome: String(l.get('nome') || ''),
          estado: String(l.get('status') || ''),
          quando: String(l.get('created') || '').slice(0, 16),
        })
      }
    } catch (e2) {}

    // 4. é número interno da equipe?
    try {
      const its = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_numeros_internos'),
        "numero~'91562937'",
        '',
        5,
        0,
      )
      if (its.length > 0) {
        out.numero_interno = String(its[0].get('rotulo') || '')
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
