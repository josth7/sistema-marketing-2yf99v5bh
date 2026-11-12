/// <reference path="../pb_data/types.d.ts" />
/**
 * IMPORTAR VENDAS ANTIGAS (12/11) — CA-3-76, SPEC-3-013.
 *
 * **Para que serve:** as vendas de 01/01 a 05/11 viram **histórico** no CRM.
 * Esse histórico aponta **qual vendedor atende cada cliente** (RN-157e,
 * planilha que a Anézia mandou em 05/11). Sem ele, quando o cliente escrever, o
 * sistema não sabe que já é cliente dele.
 *
 * **CSV** (cabeçalho obrigatório, ordem livre):
 *   `cliente,telefone,data,vendedor,valor`
 *
 * **Casamento por telefone — por CHAVE CANÔNICA, não por string:**
 * o banco guarda o mesmo número em formatos diferentes (com/sem 55, com/sem o
 * 9). Comparar variantes uma a uma falhou nos testes. Aqui se reduz cada número
 * a uma chave: `DDD + assinante sem o 9`. Assim `558899898584` e `55889898584`
 * dão a mesma chave (`889898584`) e casam com o mesmo lead.
 *
 * **Travas:**
 *   - **não** manda nada para a fila de conversões (senão a Meta recebe venda
 *     de janeiro como se fosse de hoje) — decisão do CA-3-76;
 *   - reimportar **não muda nada** (mesmo valor = pula).
 *
 * POST /backend/v1/crm/vendas/importar
 *   body: { csv: "...", confirmar: true }   (sem `confirmar` = simulação)
 */
routerAdd(
  'POST',
  '/backend/v1/crm/vendas/importar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const app = $app
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const csv = String(body.csv || '')
    const confirmar = body.confirmar === true
    if (csv === '') return e.json(422, { ok: false, erro: 'informe o csv' })

    const out = {
      ok: true,
      confirmar: confirmar,
      atualizadas: 0,
      criadas: 0,
      ignoradas: 0,
      motivos: [],
    }

    // ---------- chave canônica do telefone ----------
    // DDD + assinante, sem o 55 do país e sem o 9 de celular.
    // BUG CORRIGIDO (12/11): com 11 digitos eu tratava o '55' do PAIS como DDD,
    // gerando chave errada (5588989858 em vez de 889898584). O 55 tem de sair
    // SEMPRE que o que sobra ainda parece numero nacional.
    //   com pais: 55 DD 9XXXXXXXX (12) ou 55 DD XXXXXXXX (11)
    //   sem pais:    DD 9XXXXXXXX (11) ou    DD XXXXXXXX (10)
    function chaveTel(v) {
      var d = String(v || '').replace(/[^0-9]/g, '')
      if (d === '') return ''
      // remove o 55 do pais quando o resto continua com tamanho nacional
      if (d.slice(0, 2) === '55' && (d.length === 12 || d.length === 13)) d = d.slice(2)
      if (d.length !== 10 && d.length !== 11) return ''
      var ddd = d.slice(0, 2)
      var assinante = d.slice(2)
      // celular: o 9 nao faz parte da identidade
      if (assinante.length === 9 && assinante.slice(0, 1) === '9') assinante = assinante.slice(1)
      if (assinante.length !== 8) return ''
      return ddd + assinante
    }

    // ---------- parser do CSV ----------
    const linhas = csv.split(/\r?\n/).filter(function (l) {
      return String(l).trim() !== ''
    })
    if (linhas.length < 2) return e.json(422, { ok: false, erro: 'csv sem dados' })

    const cab = String(linhas[0])
      .toLowerCase()
      .split(',')
      .map(function (x) {
        return String(x).trim()
      })
    const idx = {
      cliente: cab.indexOf('cliente'),
      telefone: cab.indexOf('telefone'),
      data: cab.indexOf('data'),
      vendedor: cab.indexOf('vendedor'),
      valor: cab.indexOf('valor'),
    }
    if (idx.cliente < 0 || idx.telefone < 0) {
      return e.json(422, {
        ok: false,
        erro: 'o csv precisa das colunas cliente e telefone',
        encontradas: cab,
      })
    }

    // ---------- vendedores por primeiro nome (sem acento) ----------
    const vendedores = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        const nm = String(u.get('name') || u.get('email') || '')
        const chave = nm
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .split(' ')[0]
        if (chave !== '' && !vendedores[chave]) vendedores[chave] = u.id
      }
    } catch (e0) {}

    // ---------- mapa dos leads existentes por chave canônica ----------
    // Uma consulta só: 2 mil leads. Evita N buscas e resolve os formatos.
    const mapa = {}
    try {
      const todos = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        20000,
        0,
      )
      for (const l of todos) {
        const k = chaveTel(l.get('telefone'))
        if (k !== '' && !mapa[k]) mapa[k] = l
      }
      out.leads_no_mapa = Object.keys(mapa).length
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'ler leads: ' + String(e1).slice(0, 120) })
    }

    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    // ---------- processa ----------
    for (var i = 1; i < linhas.length; i++) {
      const cels = String(linhas[i]).split(',')
      function cel(k) {
        const p = idx[k]
        return p >= 0 && p < cels.length ? String(cels[p]).trim() : ''
      }
      const nome = cel('cliente')
      const telBruto = cel('telefone')
      const dataV = cel('data')
      const vend = cel('vendedor')
      const valorTxt = cel('valor')

      const k = chaveTel(telBruto)
      // ---------- não deu telefone utilizável → IGNORA ----------
      if (k === '') {
        out.ignoradas++
        out.motivos.push('linha ' + i + ': sem telefone valido (' + (nome || '?') + ')')
        continue
      }

      // BUG CORRIGIDO (12/11): a 1a versao removia TODO ponto (tratando como
      // separador de milhar) e depois trocava a virgula. Com "2000.00" isso
      // virava 200000 — as vendas do teste entraram 100x maiores.
      // Agora decide o separador decimal pelo formato:
      //   "2000.00" ou "1.234,56"  -> decimal virgula ou ponto no fim
      //   "2.000"                  -> milhar
      function paraNumero(txt) {
        var t = String(txt || '').replace(/[^0-9,.-]/g, '')
        if (t === '') return NaN
        const temVirgula = t.indexOf(',') >= 0
        const temPonto = t.indexOf('.') >= 0
        if (temVirgula && temPonto) {
          // formato brasileiro 1.234,56
          t = t.replace(/\./g, '').replace(',', '.')
        } else if (temVirgula) {
          // 1234,56
          t = t.replace(',', '.')
        } else if (temPonto) {
          // so ponto: e decimal se houver 1-2 digitos depois do ULTIMO ponto
          const partes = t.split('.')
          const ultima = partes[partes.length - 1]
          if (ultima.length <= 2) {
            // decimal: mantem o ponto, remove os anteriores (milhar)
            const dec = partes.pop()
            t = partes.join('') + '.' + dec
          } else {
            // milhar: 2.000 -> 2000
            t = partes.join('')
          }
        }
        return Number(t)
      }
      const valor = paraNumero(valorTxt)
      if (!Number.isFinite(valor) || valor <= 0) {
        out.ignoradas++
        out.motivos.push('linha ' + i + ': valor invalido (' + (nome || '?') + ')')
        continue
      }

      // quem vendeu
      var donoId = ''
      const chaveVend = vend
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(' ')[0]
      if (chaveVend !== '' && vendedores[chaveVend]) donoId = vendedores[chaveVend]

      const lead = mapa[k] || null

      // ---------- ATUALIZA ----------
      if (lead) {
        // já é venda com este valor? reimportação: não muda nada
        if (
          String(lead.get('status') || '') === 'venda_realizada' &&
          Number(lead.get('valor') || 0) === valor
        ) {
          continue
        }
        out.atualizadas++
        if (confirmar) {
          try {
            lead.set('status', 'venda_realizada')
            lead.set('valor', valor)
            if (dataV !== '') {
              try {
                lead.set('venda_em', dataV)
              } catch (eV) {}
            }
            if (donoId !== '' && String(lead.get('owner_id') || '') === '') {
              lead.set('owner_id', donoId)
            }
            app.save(lead)
            try {
              const ev = new Record(colEv)
              ev.set('lead_id', lead.id)
              ev.set('tipo', 'conversao')
              ev.set(
                'texto',
                'venda importada da planilha em ' + new Date().toISOString().slice(0, 10),
              )
              ev.set('user_id', e.auth.id)
              ev.set('fixture', false)
              app.save(ev)
            } catch (eEv) {}
          } catch (eU) {
            out.atualizadas--
            out.motivos.push('linha ' + i + ': falhou atualizar -> ' + String(eU).slice(0, 60))
          }
        }
        continue
      }

      // ---------- CRIA ----------
      out.criadas++
      if (confirmar) {
        try {
          const novo = new Record(colL)
          const dNum = String(telBruto).replace(/[^0-9]/g, '')
          novo.set('nome', nome !== '' ? nome.slice(0, 200) : 'Cliente final ' + dNum.slice(-4))
          novo.set('telefone', dNum)
          novo.set('status', 'venda_realizada')
          novo.set('valor', valor)
          novo.set('origem', 'importacao')
          if (donoId !== '') novo.set('owner_id', donoId)
          if (dataV !== '') {
            try {
              novo.set('venda_em', dataV)
            } catch (eV2) {}
          }
          novo.set('fixture', false)
          app.save(novo)
          // entra no mapa para a mesma planilha não criar duas vezes
          mapa[k] = novo
          try {
            const ev = new Record(colEv)
            ev.set('lead_id', novo.id)
            ev.set('tipo', 'conversao')
            ev.set('texto', 'venda importada da planilha (lead criado)')
            ev.set('user_id', e.auth.id)
            ev.set('fixture', false)
            app.save(ev)
          } catch (eEv2) {}
        } catch (eC) {
          out.criadas--
          out.motivos.push('linha ' + i + ': falhou criar -> ' + String(eC).slice(0, 60))
        }
      }
    }

    out.total_linhas = linhas.length - 1
    // NADA vai para a fila de conversões — decisão do CA-3-76
    out.conversoes_enviadas = 0
    out.aviso = confirmar ? 'aplicado' : 'simulação — envie confirmar:true para gravar'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
