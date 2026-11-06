/// <reference path="../pb_data/types.d.ts" />
/**
 * POST /backend/v1/atendimento/internos — números da equipe que o sistema
 * trata como internos (tela Atendimento).
 *
 * O webhook já ignora mensagem vinda de número desta lista (RN-58, migração
 * 0081): não vira lead, não aparece como cliente e o robô nunca responde.
 * Antes só dava para cadastrar por migração; agora a gestão cadastra na tela.
 *
 * Só manage_atendimento.
 * Corpo: { acao: 'adicionar', numero, rotulo } | { acao: 'remover', id }
 *
 * Celular: o WhatsApp às vezes manda o número SEM o 9 depois do DDD. Ao
 * adicionar um celular, grava as duas formas para a trava valer sempre.
 */
routerAdd(
  'POST',
  '/backend/v1/atendimento/internos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const uid = String(e.auth.id)

    var pode = false
    try {
      const colG = $app.findCollectionByNameOrId('access_grants')
      const gs = $app.findRecordsByFilter(colG, "user_id='" + uid + "' && revoked_at=''", '', 50, 0)
      const hoje = new Date().toISOString().slice(0, 10)
      for (const g of gs) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        var a = []
        try {
          const raw = g.get('actions')
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            a = JSON.parse(String.fromCharCode.apply(null, raw))
          } else if (typeof raw === 'string') {
            a = JSON.parse(raw)
          } else {
            a = raw || []
          }
        } catch (eA) {
          a = []
        }
        if (Array.isArray(a) && a.indexOf('manage_atendimento') >= 0) pode = true
      }
    } catch (eG) {}
    if (!pode)
      return e.json(403, { ok: false, erro: 'só a gestão (manage_atendimento) altera esta lista' })

    const body = e.requestInfo().body || {}
    const acao = String(body.acao || '')
    const col = $app.findCollectionByNameOrId('whatsapp_numeros_internos')

    if (acao === 'remover') {
      const id = String(body.id || '').replace(/[^a-z0-9]/g, '')
      if (id === '') return e.json(422, { ok: false, erro: 'informe o id' })
      try {
        const rec = $app.findRecordById(col, id)
        $app.delete(rec)
      } catch (eR) {
        return e.json(404, { ok: false, erro: 'número não encontrado' })
      }
      console.log('atendimento_internos: número removido da lista da equipe')
      return e.json(200, { ok: true })
    }

    if (acao !== 'adicionar') return e.json(422, { ok: false, erro: 'acao: adicionar ou remover' })

    var dig = String(body.numero || '').replace(/[^0-9]/g, '')
    if (dig.length === 10 || dig.length === 11) dig = '55' + dig
    if (dig.slice(0, 2) !== '55' || (dig.length !== 12 && dig.length !== 13)) {
      return e.json(422, {
        ok: false,
        erro: 'Número inválido. Use DDD + número, ex.: (41) 99999-9999.',
      })
    }
    const rotulo = String(body.rotulo || '')
      .trim()
      .slice(0, 120)
    if (rotulo === '') return e.json(422, { ok: false, erro: 'Informe de quem é o número.' })

    const formas = [dig]
    // celular com 9 extra: também a forma sem o 9 (55 + DDD + 8 dígitos)
    if (dig.length === 13 && dig.charAt(4) === '9') formas.push(dig.slice(0, 4) + dig.slice(5))
    var gravados = 0
    for (const n of formas) {
      var existe = []
      try {
        existe = $app.findRecordsByFilter(col, "numero='" + n + "'", '', 1, 0)
      } catch (eE) {}
      if (existe && existe.length > 0) continue
      const r = new Record(col)
      r.set('numero', n)
      r.set('rotulo', n === dig ? rotulo : rotulo + ' (sem o 9)')
      try {
        $app.save(r)
      } catch (eSaveSolto) {
        console.log('save falhou em atendimento_internos.js: ' + String(eSaveSolto).slice(0, 160))
      }
      gravados++
    }
    if (gravados === 0) return e.json(409, { ok: false, erro: 'Este número já está na lista.' })
    console.log('atendimento_internos: número da equipe adicionado (' + gravados + ' forma(s))')
    return e.json(200, { ok: true, gravados: gravados })
  },
  $apis.requireAuth(),
)
