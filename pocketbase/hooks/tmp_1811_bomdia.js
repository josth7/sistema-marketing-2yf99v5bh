/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11) — a pedido do Rodrigo: os vendedores mandaram "bom dia"
 * para a central hoje (confirmado pela Anézia), mas o webhook descartava essas
 * mensagens, então o sistema não via a janela aberta. Aqui se soltam para a
 * fila TODOS os avisos ao vendedor guardados das últimas 48h.
 * Só roda em 18/11 até 13:00 UTC. APAGAR depois.
 */
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  const agora = new Date()
  if (agora.toISOString().slice(0, 13) > '2026-11-18T13') return
  try {
    const desde48 = new Date(agora.getTime() - 48 * 3600000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19)
    const retidos = $app.findRecordsByFilter(
      'whatsapp_envios',
      "motivo='aviso_vendedor' && estado='fora_da_janela_sem_modelo' && fixture=false && created>='" +
        desde48 +
        "'",
      'created',
      1000,
      0,
    )
    if (!retidos || retidos.length === 0) return
    var n = 0
    for (const r of retidos) {
      try {
        r.set('estado', 'pendente')
        r.set('tentativas', 0)
        $app.save(r)
        n++
      } catch (e1) {}
    }
    console.log('tmp_1811_liberar: ' + n + ' aviso(s) ao vendedor soltos para a fila')
  } catch (e) {
    console.log('tmp_1811_liberar: erro ' + String(e).slice(0, 150))
  }
})
