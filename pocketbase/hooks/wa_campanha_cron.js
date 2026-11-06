/// <reference path="../pb_data/types.d.ts" />
/**
 * CRON DO DISPARO — CA-3-54 (SPEC-3-012, 06/11).
 *
 * Roda a cada 10 minutos. Para cada campanha `em_andamento`:
 *
 *   1. **Janela** (decisão do dono, 06/11): só envia entre **7h e 20h** de
 *      Brasília. Fora disso, espera.
 *   2. **Ritmo** (RN-152): envia `floor(ritmo_hora/6)` por rodada e **nunca**
 *      passa de `ritmo_hora` nos últimos 60 min.
 *   3. **Teto** (RN-152): nunca passa de `teto_dia` nas últimas 24 h **por
 *      número** — orçamento único, contando apresentação e aviso ao vendedor.
 *   4. **Opt-out**: quem pediu para sair nunca entra (checado de novo aqui,
 *      porque pode ter saído depois da campanha começar).
 *   5. **Proteção** (RN-154): 10% ou mais de recusa nos últimos 50 envios
 *      → pausa automática. `131050` (cliente parou marketing) → opt-out na hora.
 *   6. **Fim**: sem destino `na_fila` → `concluida`.
 *
 * Enfileira em `whatsapp_envios` com motivo `campanha`; a fila existente faz o
 * envio. Nada aqui chama a D-API direto.
 */
cronAdd('wa_campanha_disparo', '*/10 * * * *', () => {
  try {
    const app = $app

    // ---------- relógio de Brasília ----------
    const agoraBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    const hhmm =
      String(agoraBR.getUTCHours()).padStart(2, '0') +
      ':' +
      String(agoraBR.getUTCMinutes()).padStart(2, '0')
    const agoraMs = new Date().getTime()

    var camps = []
    try {
      camps = app.findRecordsByFilter(
        app.findCollectionByNameOrId('campanhas'),
        "estado='em_andamento' && fixture=false",
        '',
        20,
        0,
      )
    } catch (e0) {
      return
    }
    if (camps.length === 0) return

    const colDest = app.findCollectionByNameOrId('campanha_destinos')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')

    // opt-out (pode ter crescido desde a criação)
    const fora = {}
    try {
      for (const o of app.findRecordsByFilter(
        app.findCollectionByNameOrId('opt_out'),
        '',
        '',
        20000,
        0,
      )) {
        fora[String(o.get('telefone') || '').replace(/\D/g, '')] = true
      }
    } catch (e1) {}

    for (const camp of camps) {
      // ---------- 1. janela 7h-20h (decisão do dono) ----------
      const ini = String(camp.get('hora_inicio') || '07:00')
      const fim = String(camp.get('hora_fim') || '20:00')
      if (hhmm < ini || hhmm >= fim) continue

      const conexaoId = String(camp.get('conexao') || '')
      const ritmo = Number(camp.get('ritmo_hora') || 20)
      const teto = Number(camp.get('teto_dia') || 200)
      const modelo = String(camp.get('modelo_nome') || '')

      // ---------- 2. ritmo: quantos já saíram nos últimos 60 min ----------
      var ultimaHora = 0
      try {
        const envs = app.findRecordsByFilter(
          colEnv,
          "conexao='" + conexaoId + "' && motivo='campanha'",
          '',
          5000,
          0,
        )
        for (const en of envs) {
          const q = new Date(String(en.get('created') || '')).getTime()
          if (q > 0 && agoraMs - q < 3600000) ultimaHora++
        }
      } catch (e2) {}
      if (ultimaHora >= ritmo) continue

      // ---------- 3. teto por número em 24h (orçamento único) ----------
      var nas24 = 0
      try {
        const envs = app.findRecordsByFilter(colEnv, "conexao='" + conexaoId + "'", '', 8000, 0)
        for (const en of envs) {
          const motivo = String(en.get('motivo') || '')
          // campanha + apresentação + recontato contam no MESMO teto
          if (
            motivo !== 'campanha' &&
            motivo !== 'apresentacao_vendedor' &&
            motivo !== 'aviso_vendedor'
          )
            continue
          const q = new Date(String(en.get('created') || '')).getTime()
          if (q > 0 && agoraMs - q < 86400000) nas24++
        }
      } catch (e3) {}
      if (nas24 >= teto) continue

      // ---------- 4. proteção: 10% de recusa nos últimos 50 ----------
      var ultimos = []
      try {
        ultimos = app.findRecordsByFilter(
          colEnv,
          "conexao='" + conexaoId + "' && motivo='campanha'",
          '',
          50,
          0,
        )
      } catch (e4) {}
      var falhas = 0
      for (const en of ultimos) {
        const est = String(en.get('estado') || '')
        const er = String(en.get('ultimo_erro') || '')
        if (est === 'erro_definitivo' || est === 'erro' || er !== '') {
          if (est !== 'enviado') falhas++
        }
      }
      if (ultimos.length >= 20 && falhas * 10 >= ultimos.length) {
        try {
          camp.set('estado', 'pausada')
          camp.set('pausada_em', new Date().toISOString())
          camp.set(
            'pausada_motivo',
            'pausa automatica: ' + falhas + ' de ' + ultimos.length + ' envios com recusa',
          )
          app.save(camp)
        } catch (e5) {}
        continue
      }

      // ---------- 5. quantos enviar nesta rodada ----------
      const porRodada = Math.max(1, Math.floor(ritmo / 6))
      const espacoRitmo = ritmo - ultimaHora
      const espacoTeto = teto - nas24
      var quantos = Math.min(porRodada, espacoRitmo, espacoTeto)
      if (quantos <= 0) continue

      // ---------- 6. pega destinos na fila ----------
      var fila = []
      try {
        fila = app.findRecordsByFilter(
          colDest,
          "campanha='" + camp.id + "' && estado='na_fila'",
          '',
          200,
          0,
        )
      } catch (e6) {}
      if (fila.length === 0) {
        // nada mais na fila -> concluída
        try {
          camp.set('estado', 'concluida')
          app.save(camp)
        } catch (e7) {}
        continue
      }

      var enviados = 0
      for (const d of fila) {
        if (enviados >= quantos) break
        const tel = String(d.get('telefone') || '').replace(/\D/g, '')
        // opt-out de última hora
        if (fora[tel]) {
          try {
            d.set('estado', 'optout')
            app.save(d)
          } catch (e8) {}
          continue
        }
        // enfileira o envio de verdade
        try {
          const env = new Record(colEnv)
          env.set('conexao', conexaoId)
          env.set('destino_telefone', tel)
          env.set('motivo', 'campanha')
          env.set('modo', 'modelo')
          env.set('modelo_nome', modelo)
          env.set('texto', '')
          env.set('legenda', '')
          env.set('autor_user', '')
          env.set('criado_por', String(camp.get('criada_por') || ''))
          env.set('estado', 'pendente')
          env.set('tentativas', 0)
          env.set('fixture', false)
          env.set('dedupe_key', 'camp-' + camp.id + '-' + tel)
          app.save(env)
          d.set('estado', 'enviado')
          d.set('enviado_em', new Date().toISOString())
          app.save(d)
          enviados++
        } catch (e9) {
          try {
            d.set('estado', 'erro')
            d.set('erro', 'falha_ao_enfileirar')
            app.save(d)
          } catch (eA) {}
        }
      }
    }
  } catch (eTop) {}
})
