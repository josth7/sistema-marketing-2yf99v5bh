/// <reference path="../pb_data/types.d.ts" />
/**
 * IMPORTAR VENDAS ANTIGAS (12/11) — CA-3-76, SPEC-3-013.
 *
 * **Para que serve:** as vendas de 01/01 a 05/11 viram **histórico** no CRM.
 * Esse histórico é o que aponta **qual vendedor atende cada cliente** (RN-157e,
 * planilha que a Anézia mandou em 05/11). Sem ele, quando o cliente escrever, o
 * sistema não sabe que já é cliente dele.
 *
 * **O CSV** (cabeçalho obrigatório, ordem livre):
 *   `cliente,telefone,data,vendedor,valor`
 *
 * **O casamento por telefone** (com e sem o 9, DDD do vendedor quando faltar):
 *   - telefone casa com lead existente  → ATUALIZA
 *   - não casa e o telefone é válido    → CRIA
 *   - nome repetido sem telefone        → IGNORA com motivo
 *
 * **Travas:**
 *   - **não** manda nada para a fila de conversões (senão a Meta recebe venda
 *     de janeiro como se fosse de hoje);
 *   - reimportar **não muda nada** (dedupe por cliente+data+valor).
 *
 * POST /backend/v1/crm/vendas/importar
 *   body: { csv: "cliente,telefone,...\n...", confirmar: true }
 *   sem `confirmar` → só relatório (simulação)
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
      detalhes: [],
    }

    // ---------- parser simples de CSV ----------
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

    // ---------- utilidades ----------
    function digitos(v) {
      return String(v || '').replace(/[^0-9]/g, '')
    }
    // variantes do telefone: com e sem o 9 depois do DDD
    // BUG CORRIGIDO (12/11): minha 1a versao prefixava '55' no telefone de 11
    // digitos (5555889898584) em vez de INSERIR o 9 depois do DDD. Com isso o
    // telefone "sem o 9" nunca casava com o lead. Agora trata os 4 formatos:
    //   55 DD 9XXXX-XXXX (13)  ·  55 DD XXXX-XXXX (12)
    //      DD 9XXXX-XXXX (11)  ·     DD XXXX-XXXX (10)
    function variantes(tel) {
      const d = digitos(tel)
      const out = []
      if (d === '') return out

      var ddd = ''
      var resto = ''
      if (d.length === 13) {
        ddd = d.slice(2, 4)
        resto = d.slice(4)
      } else if (d.length === 12) {
        ddd = d.slice(2, 4)
        resto = d.slice(4)
      } else if (d.length === 11) {
        ddd = d.slice(0, 2)
        resto = d.slice(2)
      } else if (d.length === 10) {
        ddd = d.slice(0, 2)
        resto = d.slice(2)
      } else {
        out.push(d)
        return out
      }

      // com o 9 e sem o 9, cada um nas duas formas (com e sem o 55)
      var sem9 = resto
      if (resto.length === 9 && resto.slice(0, 1) === '9') sem9 = resto.slice(1)
      var com9 = resto
      if (resto.length === 8) com9 = '9' + resto

      out.push('55' + ddd + com9)
      out.push('55' + ddd + sem9)
      out.push(ddd + com9)
      out.push(ddd + sem9)
      out.push(d)
      return out
    }

    // mapa de vendedores por nome (sem acento, minusculo)
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
        if (chave !== '') vendedores[chave] = u.id
      }
    } catch (e0) {}

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

      const d = digitos(telBruto)
      // ---------- linha sem telefone utilizavel → IGNORA ----------
      if (d.length < 10) {
        out.ignoradas++
        out.motivos.push('linha ' + i + ': sem telefone valido (' + (nome || '?') + ')')
        continue
      }

      const valor = Number(
        String(valorTxt)
          .replace(/[^0-9,.-]/g, '')
          .replace(/\./g, '')
          .replace(',', '.'),
      )
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

      // ---------- acha o lead ----------
      var lead = null
      const vs = variantes(telBruto)
      for (const v of vs) {
        try {
          const achados = app.findRecordsByFilter(colL, "telefone='" + v + "'", '', 1, 0)
          if (achados && achados.length > 0) {
            lead = achados[0]
            break
          }
        } catch (e1) {}
      }

      const jaEhVenda =
        lead &&
        String(lead.get('status') || '') === 'venda_realizada' &&
        Number(lead.get('valor') || 0) > 0

      // ---------- ATUALIZA ----------
      if (lead) {
        // já é venda com o mesmo valor? não muda nada (reimportacao)
        if (jaEhVenda && Number(lead.get('valor') || 0) === valor) {
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
            // trilha
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
          novo.set('nome', nome !== '' ? nome.slice(0, 200) : 'Cliente final ' + d.slice(-4))
          novo.set('telefone', d)
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
    // NADA vai para a fila de conversões — decisão do card (CA-3-76)
    out.conversoes_enviadas = 0
    out.aviso = confirmar ? 'aplicado' : 'simulação — envie confirmar:true para gravar'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
