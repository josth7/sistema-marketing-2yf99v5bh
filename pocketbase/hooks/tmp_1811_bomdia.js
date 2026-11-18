/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11): recoloca na fila os avisos ao vendedor recusados hoje
 * pelo limite de envio da Meta para o mesmo número (#131056). Só entre
 * 12:45 e 13:15 UTC de 18/11; depois não faz nada. APAGAR depois.
 */
cronAdd('tmp_1811_bomdia', '*/5 * * * *', () => {
  const agora = new Date().toISOString()
  if (agora < '2026-11-18T12:45' || agora > '2026-11-18T13:15') return
  try {
    const rs = $app.findRecordsByFilter(
      'whatsapp_envios',
      "motivo='aviso_vendedor' && estado='erro_definitivo' && fixture=false && created>='2026-11-18 11:00:00' && ultimo_erro~'131056'",
      '',
      50,
      0,
    )
    var n = 0
    for (const r of rs) {
      r.set('estado', 'pendente')
      r.set('tentativas', 0)
      $app.save(r)
      n++
    }
    if (n > 0)
      console.log('tmp_1811_reenvio: ' + n + ' aviso(s) recolocados na fila (limite #131056)')
  } catch (e) {
    console.log('tmp_1811_reenvio: erro ' + String(e).slice(0, 120))
  }
})
