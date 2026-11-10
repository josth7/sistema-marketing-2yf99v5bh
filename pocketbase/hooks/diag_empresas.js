/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (10/11) — por que a coleção `empresas` não foi criada?
 *
 * A migração 0165 está registrada como aplicada mas a coleção não existe.
 * Aqui se tenta recriar **passo a passo**, mostrando o erro de cada tentativa
 * (a migração engole o erro com try/catch).
 *
 * GET /backend/v1/diag/testa-empresas
 */
routerAdd(
  'GET',
  '/backend/v1/diag/testa-empresas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // 1. a coleção existe?
    var existe = false
    try {
      const c = app.findCollectionByNameOrId('empresas')
      existe = c !== null && c !== undefined
    } catch (e0) {
      out.passos.push({ passo: 'buscar empresas', erro: String(e0).slice(0, 120) })
    }
    out.passos.push({ passo: '1. empresas existe', ok: existe })

    // 2. tenta criar
    if (!existe) {
      try {
        const col = new Collection({
          name: 'empresas',
          type: 'base',
          fields: [
            { name: 'nome', type: 'text', required: true, max: 120 },
            { name: 'apelido', type: 'text', max: 40 },
            { name: 'cnpj', type: 'text', max: 20 },
            { name: 'ativa', type: 'bool' },
          ],
        })
        app.save(col)
        out.passos.push({ passo: '2. criar empresas', ok: true, id: col.id })
      } catch (e1) {
        out.passos.push({ passo: '2. criar empresas', ok: false, erro: String(e1).slice(0, 300) })
      }
    }

    // 3. testa o campo `empresa` numa coleção pequena
    try {
      const col = app.findCollectionByNameOrId('opt_out')
      var tem = false
      for (const f of col.fields || []) {
        if (String(f.name) === 'empresa') tem = true
      }
      if (!tem) {
        col.fields.add(new TextField({ name: 'empresa', max: 30 }))
        app.save(col)
        out.passos.push({ passo: '3. campo empresa em opt_out', ok: true })
      } else {
        out.passos.push({ passo: '3. campo empresa em opt_out', ok: true, detalhe: 'ja existia' })
      }
    } catch (e2) {
      out.passos.push({ passo: '3. campo em opt_out', ok: false, erro: String(e2).slice(0, 300) })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
