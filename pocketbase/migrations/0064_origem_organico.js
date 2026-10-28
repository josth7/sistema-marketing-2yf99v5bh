/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0064 — corrige a origem dos 122 leads de "Marketing Orgânico".
 *
 * Causa: o arquivo crm.js tem DUAS listas ORIGENS (uma na rota de criação, uma
 * na rota de importação). O patch de 28/10 acrescentou `organico` só na
 * primeira; a importação usou a segunda, que não conhecia o valor, e gravou
 * todos esses leads como `importacao`.
 *
 * Correção em duas frentes:
 *  1) o dado (esta migração), pela lista de telefones que a planilha marca como
 *     "Marketing Orgânico" — só toca lead com origem `importacao`, então não
 *     pode estragar nada que já esteja certo;
 *  2) a causa (rota de importação no crm.js, corrigida junto).
 *
 * Idempotente: lead que já está `organico` é ignorado.
 */

migrate(
  (app) => {
    const ORGANICOS = [
      '5493755414741',
      '5493757608030',
      '551151233423',
      '551151922432',
      '551151922694',
      '5511913232142',
      '5511940282208',
      '5511941011020',
      '5511949246690',
      '5511953110612',
      '5511958748840',
      '5511959153445',
      '5511963929652',
      '5511970354386',
      '5511974629522',
      '5511977046681',
      '5511978648424',
      '5511981208691',
      '5511981223653',
      '5511981355663',
      '5511983516503',
      '5511984071762',
      '5511998179707',
      '5512996696778',
      '5513974105359',
      '5516981491316',
      '5517981434884',
      '5517991705872',
      '5517992460986',
      '5518996392492',
      '5519983175187',
      '5519989506782',
      '5519993349702',
      '5521968260758',
      '5521972368896',
      '5521985306605',
      '5521998890471',
      '5527992740664',
      '5527999401522',
      '553173316986',
      '553399042982',
      '553399926692',
      '553491025684',
      '553491223223',
      '553599685148',
      '553799883000',
      '553891032281',
      '553898907087',
      '554184794866',
      '554187127964',
      '554187752736',
      '554188027667',
      '554188391221',
      '554188481050',
      '554192421297',
      '554192674997',
      '554192847995',
      '554195017280',
      '554195064933',
      '554195779359',
      '554196443977',
      '554196869690',
      '554196962917',
      '554197081233',
      '554197206353',
      '554197213499',
      '554197349246',
      '554198008695',
      '554198719368',
      '554198880128',
      '554199368900',
      '554199964672',
      '554298258883',
      '554398116797',
      '554430315269',
      '554491610825',
      '554497705658',
      '554499785049',
      '554598331413',
      '554599984084',
      '554792148959',
      '554792853959',
      '554796243882',
      '554796334352',
      '554797802131',
      '554832363313',
      '554888024739',
      '554891933789',
      '554896150967',
      '554899051818',
      '554999181918',
      '554999846051',
      '555596424514',
      '556196504424',
      '556282678237',
      '556293918303',
      '556294382244',
      '556484011036',
      '556592085373',
      '556593079066',
      '556793035252',
      '556799259780',
      '557498141422',
      '557591185218',
      '557788459301',
      '557999986688',
      '558173329567',
      '558194789283',
      '558195437635',
      '558196517856',
      '558296993993',
      '558381381808',
      '558487349861',
      '558488515401',
      '558587117782',
      '558588003545',
      '558686219544',
      '559292172808',
      '559681130323',
      '8613822451718',
      '8618354725206',
      '905370651850',
    ]
    const col = app.findCollectionByNameOrId('crm_leads')
    let corrigidos = 0
    let naoAchados = 0
    for (const tel of ORGANICOS) {
      let achou = null
      try {
        const r = app.findRecordsByFilter(col, "telefone='" + tel + "'", '', 1, 0)
        if (r && r.length > 0) achou = r[0]
      } catch (eF) {}
      if (!achou) {
        naoAchados++
        continue
      }
      // só corrige o que está errado: importacao → organico
      if (String(achou.get('origem') || '') !== 'importacao') continue
      achou.set('origem', 'organico')
      try {
        app.save(achou)
        corrigidos++
      } catch (eS) {}
    }
    console.log(
      '0064: corrigidos para organico = ' +
        corrigidos +
        ' | nao encontrados = ' +
        naoAchados +
        ' | total na lista = ' +
        ORGANICOS.length,
    )
    // conferência pós-correção
    try {
      const org = app.findRecordsByFilter(col, "origem='organico'", '', 2000, 0)
      const imp = app.findRecordsByFilter(col, "origem='importacao'", '', 2000, 0)
      console.log('0064: agora organico=' + org.length + ' importacao=' + imp.length)
    } catch (eC) {
      console.log('0064: conferencia falhou: ' + eC)
    }
  },
  (app) => {
    // reversão: devolve os mesmos telefones para `importacao`
    try {
      const col = app.findCollectionByNameOrId('crm_leads')
      const org = app.findRecordsByFilter(col, "origem='organico'", '', 2000, 0)
      for (const r of org) {
        r.set('origem', 'importacao')
        app.save(r)
      }
    } catch (e2) {}
    console.log('0064 revertida')
  },
)
