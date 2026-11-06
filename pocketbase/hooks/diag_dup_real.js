/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (06/11) — existe conversa duplicada na coleção?
 *
 * A tela agrupa por telefone, então a duplicata fica escondida nela. Aqui se lê
 * a coleção CRUA e se procura o mesmo par (conexão + telefone) em mais de um
 * registro — que é o defeito real: duas conversas para o mesmo cliente no mesmo
 * número.
 *
 * Também mostra se há registro com telefone vazio ou com formatos diferentes
 * do mesmo número (com/sem 9), que é como a duplicata nasce.
 *
 * GET /backend/v1/diag/dup-real
 */
routerAdd(
  'GET',
  '/backend/v1/diag/dup-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      total: 0,
      pares_duplicados: 0,
      telefone_vazio: 0,
      exemplos: [],
      formatos: {},
    }

    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        '',
        '',
        12000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 150) })
    }
    out.total = convs.length

    const porPar = {}
    const porTel = {}
    for (const c of convs) {
      const cx = String(c.get('conexao') || '')
      const tel = String(c.get('contato_telefone') || '')
      if (tel === '') {
        out.telefone_vazio++
        continue
      }
      out.formatos[tel.length] = (out.formatos[tel.length] || 0) + 1
      const chave = cx + '|' + tel
      if (!porPar[chave]) porPar[chave] = []
      porPar[chave].push(c)
      // também agrupa só por telefone (para achar o mesmo número em 2 conexões)
      if (!porTel[tel]) porTel[tel] = 0
      porTel[tel]++
    }

    for (const k in porPar) {
      const lista = porPar[k]
      if (lista.length < 2) continue
      out.pares_duplicados++
      if (out.exemplos.length >= 10) continue
      const itens = []
      for (const c of lista) {
        itens.push({
          id: c.id,
          msgs: Number(c.get('total_mensagens') || 0),
          estado: String(c.get('estado') || ''),
          criado: String(c.get('created') || '').slice(0, 16),
          fixture: String(c.get('fixture')) === 'true',
        })
      }
      out.exemplos.push({ par: k.slice(0, 40), quantas: lista.length, itens: itens })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
