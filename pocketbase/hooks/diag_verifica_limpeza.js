/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO DA LIMPEZA — CA-3-27 (06/11).
 *
 * Prova que a limpeza **marcou** em vez de apagar:
 *   - conta quantos registros estão `fixture=true` hoje;
 *   - confirma que os registros continuam existindo (nada foi perdido);
 *   - mostra a evidência com só os 4 últimos dígitos.
 *
 * GET /backend/v1/diag/verifica-limpeza
 */
routerAdd(
  'GET',
  '/backend/v1/diag/verifica-limpeza',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversas: {}, mensagens: {}, leads: {}, amostra: [] }

    function conta(col, filtro) {
      try {
        return app.findRecordsByFilter(app.findCollectionByNameOrId(col), filtro, '', 20000, 0)
          .length
      } catch (err) {
        return -1
      }
    }

    out.conversas = {
      total: conta('whatsapp_conversas', ''),
      fixture: conta('whatsapp_conversas', 'fixture=true'),
      reais: conta('whatsapp_conversas', 'fixture=false'),
    }
    out.mensagens = {
      total: conta('whatsapp_mensagens', ''),
      fixture: conta('whatsapp_mensagens', 'fixture=true'),
    }
    out.leads = {
      total: conta('crm_leads', ''),
      fixture: conta('crm_leads', 'fixture=true'),
      reais: conta('crm_leads', 'fixture=false'),
    }

    // amostra: os marcados continuam existindo, com nome e final do telefone
    try {
      const marcadas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=true',
        '',
        12,
        0,
      )
      for (const c of marcadas) {
        out.amostra.push({
          nome: String(c.get('contato_nome') || ''),
          final: String(c.get('contato_telefone') || '').slice(-4),
        })
      }
    } catch (e0) {}

    // o que a tela mostra (só reais)
    out.tela_mostra = out.conversas.reais
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
