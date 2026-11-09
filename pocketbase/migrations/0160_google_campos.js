/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0160 — campos do envio ao Google (CA-3-61, 09/11).
 *
 * Para o Maestro mandar a conversão ao Google Ads, ele precisa de:
 *   - `gclid`: o clique do anúncio (Google Click ID), que liga a venda ao
 *     anúncio certo. Sem ele o Google não sabe qual campanha gerou a venda.
 *   - `ph_google_sha256`: o telefone do cliente **hasheado** em SHA-256 no
 *     formato E.164 com "+". O Google exige o hash; **o telefone cru nunca
 *     sai do nosso sistema**.
 *
 * O hash é calculado no Skip e só o resultado é servido ao Maestro.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('conversion_events')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('gclid') < 0) {
      try {
        col.fields.add(new TextField({ name: 'gclid', max: 300 }))
        console.log('0160: gclid criado')
      } catch (e1) {}
    }
    if (nomes.indexOf('ph_google_sha256') < 0) {
      try {
        col.fields.add(new TextField({ name: 'ph_google_sha256', max: 100 }))
        console.log('0160: ph_google_sha256 criado')
      } catch (e2) {}
    }
    try {
      app.save(col)
      console.log('0160: pronto')
    } catch (e3) {
      console.log('0160: falhou -> ' + String(e3).slice(0, 150))
    }
  },
  (app) => {
    console.log('0160 revertida (campos permanecem)')
  },
)
