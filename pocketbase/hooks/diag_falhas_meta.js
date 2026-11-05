/// <reference path="../pb_data/types.d.ts" />
/**
 * diag_falhas_meta.js — TEMPORÁRIO (consultor, 05/11/2026). Remover logo após a leitura.
 *
 * Escreve no log, no máximo 3 vezes, o recorte já guardado das últimas recusas
 * da Meta (whatsapp_eventos com resultado 'falha_meta') e o estado dos envios
 * da fila desde 04/11. Só leitura: não grava nada em coleção nenhuma.
 * Privacidade: sem telefone e sem texto de mensagem; sequências de 8 ou mais
 * dígitos viram <num>; código da sessão só com os 4 últimos caracteres.
 * JSVM: toda a lógica dentro do callback.
 */
cronAdd('diag_falhas_meta_0511', '* * * * *', () => {
  let n = 0
  try {
    n = Number($app.store().get('diag_falhas_meta_n') || 0)
  } catch (e0) {
    n = 0
  }
  if (n >= 3) return
  try {
    $app.store().set('diag_falhas_meta_n', n + 1)
  } catch (e1) {}

  const limpa = (v) => String(v === null || v === undefined ? '' : v).replace(/\d{8,}/g, '<num>')
  const fim4 = (v) => {
    const s = String(v || '')
    return s.length > 4 ? '…' + s.slice(-4) : s
  }
  const nomeSessao = (sid) => {
    try {
      const cx = $app.findRecordsByFilter(
        'whatsapp_conexoes',
        "session_id = '" + String(sid || '').replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (cx && cx.length > 0) return String(cx[0].get('nome_exibicao') || '?')
    } catch (eS) {}
    return '?'
  }
  const nomeConexao = (id) => {
    try {
      const cx = $app.findRecordById('whatsapp_conexoes', String(id || ''))
      return String(cx.get('nome_exibicao') || '?')
    } catch (eC) {}
    return '?'
  }

  try {
    const evs = $app.findRecordsByFilter(
      'whatsapp_eventos',
      "resultado = 'falha_meta'",
      '-created',
      12,
      0,
    )
    console.log('diag_falhas_meta: rodada ' + (n + 1) + ' | recusas guardadas = ' + evs.length)
    for (let i = 0; i < evs.length; i++) {
      const r = evs[i]
      console.log(
        'diag_falhas_meta: EV ' +
          limpa(r.get('created')) +
          ' | ' +
          nomeSessao(r.get('session_id')) +
          ' (' +
          fim4(r.get('session_id')) +
          ') | ' +
          limpa(r.get('codigo_erro')).slice(0, 700),
      )
    }
  } catch (e2) {
    console.log('diag_falhas_meta: erro lendo eventos -> ' + limpa(e2).slice(0, 200))
  }

  try {
    const envs = $app.findRecordsByFilter(
      'whatsapp_envios',
      "created >= '2026-11-04 00:00:00'",
      '-created',
      15,
      0,
    )
    console.log('diag_falhas_meta: envios desde 04/11 = ' + envs.length)
    for (let j = 0; j < envs.length; j++) {
      const s = envs[j]
      console.log(
        'diag_falhas_meta: ENV ' +
          limpa(s.get('created')) +
          ' | ' +
          limpa(s.get('motivo')) +
          ' | modo ' +
          limpa(s.get('modo')) +
          ' | por ' +
          nomeConexao(s.get('conexao')) +
          ' | estado ' +
          limpa(s.get('estado')) +
          ' | msgid ' +
          (String(s.get('wa_message_id') || '') === '' ? 'vazio' : 'ok') +
          ' | erro ' +
          limpa(s.get('ultimo_erro')).slice(0, 200),
      )
    }
  } catch (e3) {
    console.log('diag_falhas_meta: erro lendo envios -> ' + limpa(e3).slice(0, 200))
  }
})
