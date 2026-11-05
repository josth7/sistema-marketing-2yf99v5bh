/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0133 — apresentação por modelo, opcional e DESLIGADA (CA-3-68).
 *
 * **Decisão do dono (05/11):** a apresentação por modelo pago, saindo do número
 * do vendedor, fica **opcional e desligada**. A gestão liga na Administração se
 * quiser, e para funcionar exige modelo aprovado na conta de cada número.
 *
 * **Por que isso existe:** hoje, com um vendedor novo, o cliente não recebe
 * nenhuma mensagem do número dele — só o link. A apresentação automática faria
 * o vendedor se apresentar sozinho, mas custa mensagem paga e depende de
 * template aprovado. Por isso é opcional e desligada.
 *
 * **Enquanto desligada, NADA sai pelo número do vendedor.** Nenhum envio com
 * motivo `apresentacao_vendedor` é criado.
 *
 * O que esta migração cria:
 *   - `apresentacao_ativa` (bool, padrão **false**) em `whatsapp_conexoes`
 *   - `modelo_apresentacao_vendedor` (text) em `whatsapp_conexoes`
 *   - o valor `apresentacao_vendedor` no select de `whatsapp_envios.motivo`
 *   - o estado `aguardando_modelo` no select de `whatsapp_envios.estado`
 */
migrate(
  (app) => {
    // ---------- conexões ----------
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const nomes = []
    try {
      for (const f of colCx.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('apresentacao_ativa') < 0) {
      try {
        colCx.fields.add(new BoolField({ name: 'apresentacao_ativa' }))
        console.log('0133: campo apresentacao_ativa criado (padrao false)')
      } catch (e1) {
        console.log('0133: falhou apresentacao_ativa -> ' + String(e1).slice(0, 140))
      }
    }
    if (nomes.indexOf('modelo_apresentacao_vendedor') < 0) {
      try {
        colCx.fields.add(new TextField({ name: 'modelo_apresentacao_vendedor', max: 120 }))
        console.log('0133: campo modelo_apresentacao_vendedor criado')
      } catch (e2) {
        console.log('0133: falhou modelo -> ' + String(e2).slice(0, 140))
      }
    }
    try {
      app.save(colCx)
    } catch (e3) {
      console.log('0133: falhou salvar conexoes -> ' + String(e3).slice(0, 160))
    }

    // ---------- envios: motivo e estado novos ----------
    try {
      const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
      for (const f of colEnv.fields || []) {
        const nome = String(f.name)
        if (nome === 'motivo') {
          const vals = f.values || []
          if (vals.indexOf('apresentacao_vendedor') < 0) {
            f.values = vals.concat(['apresentacao_vendedor'])
            console.log('0133: motivo apresentacao_vendedor acrescentado')
          }
        }
        if (nome === 'estado') {
          const vals = f.values || []
          if (vals.indexOf('aguardando_modelo') < 0) {
            f.values = vals.concat(['aguardando_modelo'])
            console.log('0133: estado aguardando_modelo acrescentado')
          }
        }
      }
      app.save(colEnv)
    } catch (e4) {
      console.log('0133: falhou envios -> ' + String(e4).slice(0, 160))
    }

    // ---------- garante DESLIGADA em todas as conexões ----------
    try {
      const cxs = app.findRecordsByFilter(colCx, '', '', 60, 0)
      for (const c of cxs) {
        if (c.get('apresentacao_ativa') !== true) continue
        c.set('apresentacao_ativa', false)
        app.save(c)
      }
      console.log('0133: apresentacao desligada em todas as conexoes')
    } catch (e5) {}

    console.log('0133: pronto (apresentacao DESLIGADA)')
  },
  (app) => {
    console.log('0133 revertida (campos permanecem)')
  },
)
