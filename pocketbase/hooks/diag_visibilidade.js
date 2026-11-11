/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (consultor, 11/11) — só LÊ e escreve no log.
 *
 * Relato da gestão (11/11): "no CRM da Elisângela aparece conversa do Fábio,
 * da Adriana e do Douglas". A rota GET /backend/v1/whatsapp/conversas filtra no
 * servidor; este cron refaz a mesma conta para cada vendedor e diz POR QUAL
 * regra cada conversa aparece e de qual número ela é.
 *
 * Não grava nada. Não escreve telefone, nome de cliente nem texto de mensagem.
 * Desliga sozinho às 22:00 UTC de 11/11 e será removido em seguida.
 */
cronAdd('diag_visibilidade', '*/5 * * * *', () => {
  if (new Date().getTime() > new Date('2026-11-11T22:00:00Z').getTime()) return
  try {
    const lerL = function (raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          const p = JSON.parse(String.fromCharCode.apply(null, raw))
          return Array.isArray(p) ? p : []
        }
        if (typeof raw === 'string') {
          if (raw === '') return []
          const p2 = JSON.parse(raw)
          return Array.isArray(p2) ? p2 : []
        }
        return Array.isArray(raw) ? raw : []
      } catch (eL) {
        return []
      }
    }

    // ---------- conexões ----------
    const cxs = $app.findRecordsByFilter('whatsapp_conexoes', '', '', 200, 0)
    const cx = {}
    var empresaCentral = ''
    const vendedores = []
    for (const c of cxs) {
      const papel = String(c.get('papel') || '')
      const fx = String(c.get('fixture')) === 'true'
      const ativo = String(c.get('ativo')) === 'true'
      cx[c.id] = {
        papel: papel,
        vd: String(c.get('vendedor_user') || ''),
        nome: String(c.get('nome_exibicao') || papel),
      }
      if (!fx && ativo && papel === 'central' && empresaCentral === '') {
        empresaCentral = String(c.get('empresa') || '')
      }
      const vdU = String(c.get('vendedor_user') || '')
      if (!fx && ativo && papel === 'vendedor' && vdU !== '' && vendedores.indexOf(vdU) < 0) {
        vendedores.push(vdU)
      }
    }

    // ---------- dono de cada lead ----------
    const dono = {}
    const ls = $app.findRecordsByFilter('crm_leads', 'fixture=false', '', 8000, 0)
    for (const l of ls) dono[l.id] = String(l.get('owner_id') || '')

    // ---------- leitores de cada conversa ----------
    const leit = {}
    const ss = $app.findRecordsByFilter('whatsapp_sinais', '', '', 8000, 0)
    for (const s of ss) leit[String(s.get('conversa') || '')] = lerL(s.get('leitores'))

    // ---------- conversas, como a rota (fixture=false e empresa da central) ----------
    const convs = $app.findRecordsByFilter(
      'whatsapp_conversas',
      'fixture=false' + (empresaCentral !== '' ? " && empresa='" + empresaCentral + "'" : ''),
      '',
      8000,
      0,
    )
    console.log(
      'diag_vis: conversas=' +
        convs.length +
        ' leads=' +
        ls.length +
        ' vendedores=' +
        vendedores.length,
    )

    for (const uid of vendedores) {
      var nomeU = uid
      try {
        nomeU = String($app.findRecordById('users', uid).get('name') || uid)
      } catch (eU) {}

      var tudo = false
      var temConv = false
      const acoes = []
      const gs = $app.findRecordsByFilter(
        'access_grants',
        "user_id='" + uid + "' && revoked_at=''",
        '',
        20,
        0,
      )
      for (const g of gs) {
        const a = lerL(g.get('actions'))
        for (const x of a) if (acoes.indexOf(x) < 0) acoes.push(x)
        if (a.indexOf('read_conversas') >= 0) temConv = true
        if (a.indexOf('read_leads') >= 0 && lerL(g.get('scope_accounts')).indexOf('*') >= 0) {
          tudo = true
        }
      }

      const razoes = { tudo: 0, leitor: 0, dono_lead: 0, sem_lead_meu_numero: 0 }
      const porNumero = {}
      var outroNumDono = 0
      var outroNumLeitor = 0
      var leitorSemDono = 0
      var internas = 0
      for (const c of convs) {
        const info = cx[String(c.get('conexao') || '')] || { papel: '?', vd: '', nome: '?' }
        const lid = String(c.get('lead') || '')
        const ow = lid !== '' ? dono[lid] || '' : ''
        var r = ''
        if (tudo) r = 'tudo'
        if (r === '' && (leit[c.id] || []).indexOf(uid) >= 0 && !(ow !== '' && ow !== uid)) {
          r = 'leitor'
          if (ow === '') leitorSemDono++
        }
        if (r === '' && lid !== '' && ow === uid) r = 'dono_lead'
        if (r === '' && lid === '' && info.papel === 'vendedor' && info.vd === uid) {
          r = 'sem_lead_meu_numero'
        }
        if (r === '') continue
        razoes[r]++
        if (String(c.get('interna')) === 'true') internas++
        porNumero[info.nome] = (porNumero[info.nome] || 0) + 1
        const outroNumero = info.papel === 'vendedor' && info.vd !== uid
        if (outroNumero && r === 'dono_lead') outroNumDono++
        if (outroNumero && r === 'leitor') outroNumLeitor++
      }
      console.log(
        'diag_vis: ' +
          nomeU +
          ' | tudo=' +
          tudo +
          ' conv=' +
          temConv +
          ' acoes=' +
          acoes.join(',') +
          ' | razoes=' +
          JSON.stringify(razoes) +
          ' | numeros=' +
          JSON.stringify(porNumero) +
          ' | outro_numero_dono=' +
          outroNumDono +
          ' outro_numero_leitor=' +
          outroNumLeitor +
          ' leitor_sem_dono=' +
          leitorSemDono +
          ' internas=' +
          internas,
      )
    }
  } catch (e) {
    console.log('diag_vis: erro ' + String(e).slice(0, 200))
  }
})
