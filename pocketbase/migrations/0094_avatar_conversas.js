/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0094 — campos de avatar em whatsapp_conversas (30/10).
 *
 * O dono quer a FOTO REAL do WhatsApp do cliente no lugar das iniciais.
 * A D-API expõe `GET /api/v1/contacts/{phone}/avatar?sessionId=...`; a rota
 * `/backend/v1/whatsapp/avatares` busca e guarda aqui, com cache de uma
 * semana (`avatar_em` = quando buscou; `?forcar=1` ignora).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conversas')
    var temUrl = false
    var temEm = false
    for (const f of col.fields) {
      if (f.name === 'avatar_url') temUrl = true
      if (f.name === 'avatar_em') temEm = true
    }
    if (!temUrl) col.fields.add(new TextField({ name: 'avatar_url', required: false, max: 600 }))
    if (!temEm) col.fields.add(new DateField({ name: 'avatar_em', required: false }))
    try {
      app.save(col)
      console.log('0094: avatar_url/avatar_em garantidos')
    } catch (e1) {
      console.log('0094: falhou -> ' + String(e1).slice(0, 180))
    }
  },
  (app) => {
    console.log('0094 revertida')
  },
)
