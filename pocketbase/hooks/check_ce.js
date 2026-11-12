/// <reference path="../pb_data/types.d.ts" />
/**
 * A CENTRAL ESTÁ NA EMPRESA ERRADA (12/11).
 *
 * O cron `wa_roteiro` lê a config pela empresa da conexão central. Mas a
 * conexão central está com `empresa` = GOO7 (`78b71ryg`), e a config da GOO7
 * é a **v12, desligada**.
 *
 * Resultado: o robô da Haisan sai por "desligado" e não responde ninguém.
 *
 * **Isto é resíduo do teste:** quando a conexão foi tocada na migração de
 * empresa, recebeu a empresa errada.
 *
 * GET /backend/v1/check/central-empresa
 */
routerAdd(
  'GET',
  '/backend/v1/check/central-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conexoes: [], empresas: [] }

    const emps = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        emps[x.id] = String(x.get('apelido') || x.get('nome') || '')
        out.empresas.push({ id: x.id.slice(0, 8), nome: emps[x.id] })
      }
    } catch (e0) {}

    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        30,
        0,
      )) {
        const nome = String(c.get('nome_exibicao') || '')
        if (nome.toLowerCase().indexOf('fixture') >= 0) continue
        const emp = String(c.get('empresa') || '')
        out.conexoes.push({
          nome: nome,
          papel: String(c.get('papel') || ''),
          empresa_id: emp.slice(0, 8),
          empresa_nome: emps[emp] || '(vazio)',
        })
      }
    } catch (e1) {}

    // a config de cada empresa
    try {
      out.configs = []
      for (const c of app.findRecordsByFilter('atendimento_config', '', '', 200, 0)) {
        const emp = String(c.get('empresa') || '')
        out.configs.push({
          versao: Number(c.get('versao') || 0),
          empresa: emps[emp] || '(vazio)',
          ligado: c.get('ligado') === true,
        })
      }
      out.configs.sort(function (a, b) {
        return b.versao - a.versao
      })
      out.configs = out.configs.slice(0, 4)
    } catch (e2) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
