/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0174 — fecha o acesso público direto a 3 coleções (16/11).
 *
 * **O defeito:** `metricas_diarias`, `conversion_events` e `concorrentes_obs`
 * ficaram com as regras vazias ("") desde a fase 1 (0003_leitura_publica e as
 * migrações que criaram as outras duas). Regra vazia no PocketBase = qualquer
 * pessoa, sem login, lê pela API `/api/collections/<nome>/records`. Em
 * `conversion_events` também cria, altera e apaga — dava para injetar venda
 * falsa (que segue para a Meta e o Google) ou apagar as reais.
 *
 * **Por que fechar não quebra nada:** nenhuma tela lê essas coleções direto
 * pelo SDK (conferido no bundle publicado em 16/11). Quem lê e grava são os
 * hooks do servidor (`$app`, que não passa pelas regras): ingestão, métricas,
 * conversões (Meta e canal assinado do Maestro para o Google), concorrentes,
 * `wa_empresa_auto`.
 *
 * **O que faz:** as 5 regras (list, view, create, update, delete) das 3
 * coleções passam a `null` = só superusuário pela API; o acesso das pessoas
 * continua pelas rotas `/backend/v1/...`, que já filtram por empresa e grant.
 * Não apaga nem altera nenhum registro.
 * (Reenvio 16/11: a 1ª tentativa de subir esta migração pegou 502 da Skip Cloud.)
 */
migrate(
  (app) => {
    const NOMES = ['metricas_diarias', 'conversion_events', 'concorrentes_obs']
    for (const nome of NOMES) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        col.listRule = null
        col.viewRule = null
        col.createRule = null
        col.updateRule = null
        col.deleteRule = null
        app.save(col)
        console.log('0174: ' + nome + ' fechada (regras = superusuario)')
      } catch (e) {
        console.log('0174: falhou fechar ' + nome + ' -> ' + String(e).slice(0, 150))
      }
    }
  },
  (app) => {
    // Reversão deliberadamente NÃO reabre: voltar a "" exporia vendas reais.
    console.log('0174 revertida (as regras continuam fechadas de propósito)')
  },
)
