/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0164 — chave do aviso ao vendedor e campo da conversa (10/11).
 *
 * **CA-3-112 (RN-191):** quando o cliente de um lead escreve num número que não
 * é o do dono, sai um aviso para o celular do dono. A chave
 * "Avisar o vendedor quando o cliente responder na central" mora na
 * Administração e nasce **ligada** (decisão do dono).
 *
 * **CA-3-113:** a lista de "Conversas esperando" ganha o botão "Resolvida",
 * que tira o cliente da lista até ele mandar mensagem nova. Precisa guardar
 * quem resolveu e quando — na própria conversa.
 *
 * Campos:
 *   - `admin_config.aviso_vendedor_ativo` (bool, nasce true)
 *   - `whatsapp_conversas.resolvida_em` (date)
 *   - `whatsapp_conversas.resolvida_por` (text)
 */
migrate(
  (app) => {
    // ---------- Administração: a chave ----------
    try {
      const colA = app.findCollectionByNameOrId('admin_config')
      const nomes = []
      try {
        for (const f of colA.fields || []) nomes.push(String(f.name))
      } catch (e0) {}
      if (nomes.indexOf('aviso_vendedor_ativo') < 0) {
        try {
          colA.fields.add(new BoolField({ name: 'aviso_vendedor_ativo' }))
          console.log('0164: aviso_vendedor_ativo criado')
        } catch (e1) {}
        try {
          app.save(colA)
        } catch (e2) {}
      }
    } catch (e3) {}

    // liga a chave na config atual (nasce ligada, decisão do dono)
    try {
      const vs = app.findRecordsByFilter('admin_config', '', '', 200, 0)
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg && cfg.get('aviso_vendedor_ativo') !== true) {
        cfg.set('aviso_vendedor_ativo', true)
        app.save(cfg)
        console.log('0164: chave do aviso LIGADA na config v' + String(cfg.get('versao')))
      }
    } catch (e4) {}

    // ---------- Conversas: resolvida ----------
    try {
      const colC = app.findCollectionByNameOrId('whatsapp_conversas')
      const nomes = []
      try {
        for (const f of colC.fields || []) nomes.push(String(f.name))
      } catch (e5) {}
      if (nomes.indexOf('resolvida_em') < 0) {
        try {
          colC.fields.add(new DateField({ name: 'resolvida_em' }))
          console.log('0164: resolvida_em criado')
        } catch (e6) {}
      }
      if (nomes.indexOf('resolvida_por') < 0) {
        try {
          colC.fields.add(new TextField({ name: 'resolvida_por', max: 40 }))
          console.log('0164: resolvida_por criado')
        } catch (e7) {}
      }
      try {
        app.save(colC)
      } catch (e8) {}
    } catch (e9) {}

    console.log('0164: pronto')
  },
  (app) => {
    console.log('0164 revertida (campos permanecem)')
  },
)
