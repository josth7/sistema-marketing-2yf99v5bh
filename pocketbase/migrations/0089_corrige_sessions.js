/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0089 — corrige session_id TROCADO entre Elisangela e Adriana (30/10).
 *
 * **Erro meu.** Ao gravar as sessões das duas eu inverti os `session_id`:
 *
 *   errado (antes):  Elisangela(9501-7280) → session da ADRIANA (9800-8695)
 *                    Adriana(9800-8695)    → session da ELISANGELA (9501-7280)
 *
 * Consequência: mensagem que chegava no número de uma era gravada como se fosse
 * da outra — conversa no lugar errado, dono errado. Corrigido aqui.
 *
 * O estado correto, conferido um a um contra a D-API:
 *   cloud-ad4d4f5d…  →  +55 41 9501-7280  (Elisangela)
 *   cloud-b36d3afa…  →  +55 41 9800-8695  (Adriana)
 *
 * O `PATCH` da rota devolve 409 aqui porque há UNIQUE em `session_id`: com as
 * duas trocadas, cada valor novo já está em uso pela outra. Por isso a correção
 * passa por migração, que faz na ordem certa (libera as duas primeiro).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conexoes')

    const ELISANGELA_NUM = '554195017280'
    const ELISANGELA_SID = 'cloud-ad4d4f5d-59e6-4fad-a895-341d5564579f'
    const ADRIANA_NUM = '554198008695'
    const ADRIANA_SID = 'cloud-b36d3afa-f131-48af-aec1-83275b7b9832'

    var eli = null
    var adri = null
    try {
      const r1 = app.findRecordsByFilter(col, "numero='" + ELISANGELA_NUM + "'", '', 1, 0)
      if (r1 && r1.length > 0) eli = r1[0]
      const r2 = app.findRecordsByFilter(col, "numero='" + ADRIANA_NUM + "'", '', 1, 0)
      if (r2 && r2.length > 0) adri = r2[0]
    } catch (e0) {
      console.log('0089: busca falhou -> ' + String(e0).slice(0, 120))
      return
    }

    if (!eli || !adri) {
      console.log('0089: conexões não encontradas, nada a fazer')
      return
    }

    // passo 1: solta as duas (o UNIQUE não aceita valor repetido durante a troca)
    try {
      eli.set('session_id', '')
      app.save(eli)
      adri.set('session_id', '')
      app.save(adri)
      console.log('0089: session_id liberado nas duas')
    } catch (e1) {
      console.log('0089: falhou ao liberar -> ' + String(e1).slice(0, 150))
      return
    }

    // passo 2: grava o valor certo em cada uma
    try {
      eli.set('session_id', ELISANGELA_SID)
      app.save(eli)
      console.log('0089: Elisangela -> ' + ELISANGELA_SID.slice(-8))
    } catch (e2) {
      console.log('0089: falhou Elisangela -> ' + String(e2).slice(0, 150))
    }
    try {
      adri.set('session_id', ADRIANA_SID)
      app.save(adri)
      console.log('0089: Adriana -> ' + ADRIANA_SID.slice(-8))
    } catch (e3) {
      console.log('0089: falhou Adriana -> ' + String(e3).slice(0, 150))
    }

    // passo 3: confere
    try {
      const conf = app.findRecordsByFilter(col, "numero='" + ELISANGELA_NUM + "'", '', 1, 0)
      const c2 = app.findRecordsByFilter(col, "numero='" + ADRIANA_NUM + "'", '', 1, 0)
      console.log(
        '0089: conferencia -> Elisangela=' +
          String(conf[0].get('session_id') || '').slice(-8) +
          ' Adriana=' +
          String(c2[0].get('session_id') || '').slice(-8),
      )
    } catch (e4) {}
  },
  (app) => {
    console.log(
      '0089 revertida (não desfaz a correção: o estado errado gravava conversa na vendedora errada)',
    )
  },
)
