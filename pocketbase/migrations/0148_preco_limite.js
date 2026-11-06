/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0148 — preço da mensagem e limite do número (CA-3-83, 06/11).
 *
 * **Por que preço configurável:** a Meta cobra por mensagem de marketing e o
 * preço muda por categoria e por período. A tela precisa estimar o custo
 * ANTES de a gestão aprovar — sem isso ela aprova no escuro.
 *
 * **Por que limite do número:** cada número tem um teto diário que a Meta
 * impõe (250 é o menor). Passar disso arrisca bloqueio. O limite mora na
 * conexão, porque é por número.
 *
 * O que esta migração acrescenta:
 *   - `preco_marketing` e `preco_utilidade` em `admin_config` (centavos);
 *   - `limite_dia_meta` em `whatsapp_conexoes` (padrão 250).
 */
migrate(
  (app) => {
    // ---------- preços na Administração ----------
    const colA = app.findCollectionByNameOrId('admin_config')
    const na = []
    try {
      for (const f of colA.fields || []) na.push(String(f.name))
    } catch (e0) {}
    if (na.indexOf('preco_marketing') < 0) {
      try {
        colA.fields.add(new NumberField({ name: 'preco_marketing' }))
        console.log('0148: preco_marketing criado')
      } catch (e1) {}
    }
    if (na.indexOf('preco_utilidade') < 0) {
      try {
        colA.fields.add(new NumberField({ name: 'preco_utilidade' }))
        console.log('0148: preco_utilidade criado')
      } catch (e2) {}
    }
    try {
      app.save(colA)
    } catch (e3) {}

    // ---------- limite do número ----------
    const colC = app.findCollectionByNameOrId('whatsapp_conexoes')
    const nc = []
    try {
      for (const f of colC.fields || []) nc.push(String(f.name))
    } catch (e4) {}
    if (nc.indexOf('limite_dia_meta') < 0) {
      try {
        colC.fields.add(new NumberField({ name: 'limite_dia_meta' }))
        app.save(colC)
        console.log('0148: limite_dia_meta criado')
      } catch (e5) {
        console.log('0148: falhou limite -> ' + String(e5).slice(0, 140))
      }
    }

    // 250 é o menor limite da Meta: aplica onde estiver vazio
    try {
      const cxs = app.findRecordsByFilter(colC, '', '', 60, 0)
      var postos = 0
      for (const c of cxs) {
        const atual = Number(c.get('limite_dia_meta') || 0)
        if (atual > 0) continue
        c.set('limite_dia_meta', 250)
        app.save(c)
        postos++
      }
      console.log('0148: limite 250 aplicado em ' + postos + ' conexao(oes)')
    } catch (e6) {}

    console.log('0148: pronto')
  },
  (app) => {
    console.log('0148 revertida (campos permanecem)')
  },
)
