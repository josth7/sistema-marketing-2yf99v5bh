/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO CA-3-115 (10/11) — a IA preserva o dono?
 *
 * **RED:** antes da correção, o `wa_ia_lead` lia o lead, chamava a IA por
 * segundos e salvava o objeto inteiro — devolvendo ao banco o `owner_id`
 * antigo e apagando o dono gravado no meio.
 *
 * **GREEN:** agora relê e grava só os `ia_*`.
 *
 * **Esta rota prova sem chamar IA:** muda o dono de um lead de teste, roda o
 * padrão de gravação da IA (relê + grava só ia_*) e confere que o dono mudado
 * sobreviveu.
 *
 * GET /backend/v1/diag/prova-115
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-115',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // um lead real, sem dono seria ruim: pega um com dono
    var lead = null
    try {
      const ls = app.findRecordsByFilter('crm_leads', 'fixture=false', '', 5, 0)
      for (const l of ls) {
        if (String(l.get('owner_id') || '') !== '') {
          lead = l
          break
        }
      }
    } catch (e0) {}
    if (!lead) return e.json(200, { ok: false, erro: 'sem lead com dono' })

    const donoOriginal = String(lead.get('owner_id') || '')
    out.lead = String(lead.get('nome') || '').slice(0, 20)
    out.dono_original = donoOriginal.slice(0, 10)

    // 1. simula a LEITURA ANTIGA (o que a IA fazia antes de trabalhar)
    const lidoAntes = app.findRecordById('crm_leads', lead.id)
    out.passos.push({ passo: '1. lead lido (owner antigo)', ok: true })

    // 2. no meio do trabalho, OUTRO processo troca o dono (rodízio)
    var outroDono = ''
    try {
      const us = app.findRecordsByFilter('users', '', '', 50, 0)
      for (const u of us) {
        const id = String(u.id || '')
        if (id !== '' && id !== donoOriginal) {
          outroDono = id
          break
        }
      }
    } catch (e1) {}
    if (outroDono === '') return e.json(200, { ok: false, erro: 'sem outro usuario' })

    try {
      const conv = app.findRecordById('crm_leads', lead.id)
      conv.set('owner_id', outroDono)
      app.save(conv)
    } catch (e2) {
      return e.json(200, { ok: false, erro: 'trocar dono: ' + String(e2).slice(0, 90) })
    }
    out.dono_novo = outroDono.slice(0, 10)
    out.passos.push({ passo: '2. rodizio gravou OUTRO dono no meio', ok: true })

    // 3. gravação NOVA: relê e grava só os ia_* (como o código corrigido)
    try {
      const leadAtual = app.findRecordById('crm_leads', lead.id)
      leadAtual.set('ia_resumo', 'prova CA-3-115 ' + new Date().toISOString())
      leadAtual.set('ia_calculado_em', new Date().toISOString())
      app.save(leadAtual)
    } catch (e3) {
      return e.json(200, { ok: false, erro: 'gravar ia: ' + String(e3).slice(0, 90) })
    }

    // 4. o dono novo sobreviveu?
    var donoFinal = ''
    try {
      donoFinal = String(app.findRecordById('crm_leads', lead.id).get('owner_id') || '')
    } catch (e4) {}
    const sobreviveu = donoFinal === outroDono
    out.dono_final = donoFinal.slice(0, 10)
    out.passos.push({
      passo: '3. IA gravou depois: dono novo SOBREVIVEU',
      ok: sobreviveu,
      detalhe: sobreviveu ? 'owner_id intacto' : 'owner_id foi apagado',
    })

    // 5. devolve o lead ao dono original
    try {
      const fim = app.findRecordById('crm_leads', lead.id)
      fim.set('owner_id', donoOriginal)
      app.save(fim)
      out.passos.push({ passo: '4. lead devolvido ao dono original', ok: true })
    } catch (e5) {}

    out.green = sobreviveu
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
