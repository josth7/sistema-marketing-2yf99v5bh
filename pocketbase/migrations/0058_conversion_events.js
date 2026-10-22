/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0058 — fila de eventos de conversão (fase 4, card 3).
 *
 * Coleção conversion_events: conversões registradas no CRM que voltam para
 * Meta (CAPI) e Google Ads. O Skip NÃO chama Meta/Google direto (E-12: Google
 * fica no conector Composio do Maestro) — o Maestro puxa a fila pelo canal
 * assinado, envia às plataformas e confirma de volta (marcar-enviado).
 *
 * Campos: lead_id, valor, canal, descricao, estado (pending/sent/erro),
 * meta_event_id (dedupe CAPI), origem_plataforma (meta/google), fixture.
 * Campos como PLAIN OBJECTS (lição reincidente).
 */

migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('conversion_events')
    } catch (_) {
      col = new Collection({
        name: 'conversion_events',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'lead_id', type: 'text', required: true, max: 40 },
          { name: 'valor', type: 'number' },
          { name: 'canal', type: 'text', max: 40 },
          { name: 'descricao', type: 'text', max: 500 },
          { name: 'estado', type: 'select', maxSelect: 1, values: ['pending', 'sent', 'erro'] },
          { name: 'meta_event_id', type: 'text', max: 80 },
          { name: 'origem_plataforma', type: 'text', max: 40 },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: [
          'CREATE INDEX idx_conv_lead ON conversion_events (lead_id)',
          'CREATE INDEX idx_conv_estado ON conversion_events (estado)',
        ],
      })
      app.save(col)
    }
    const c = app.findCollectionByNameOrId('conversion_events')
    console.log('0058: conversion_events campos=' + c.fields.length)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('conversion_events'))
    } catch (_) {}
  },
)
