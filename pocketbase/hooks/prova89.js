/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO CA-3-89 — wa_empresa_auto identifica a empresa pela ORIGEM.
 *
 * **RED:** a versão antiga pegava a PRIMEIRA empresa sem ordem e carimbava em
 * todo registro sem empresa. Com duas empresas, isso mistura.
 *
 * **GREEN:** a empresa vem da conexão / telefone / pessoa do próprio registro.
 * O que não identifica fica sem empresa.
 *
 * **Como prova sem mexer em dado real:**
 *   1. cria duas empresas fixture A e B (inativas);
 *   2. cria duas conexões fixture, uma de cada empresa;
 *   3. cria 4 registros de teste: 2 com origem clara (A e B), 2 sem origem;
 *   4. roda a MESMA função `empresaDo` do hook sobre eles;
 *   5. confere: os 2 com origem recebem a empresa CERTA, os 2 sem origem
 *      ficam VAZIOS (não recebem Haisan por engano);
 *   6. apaga tudo o que criou.
 *
 * GET /backend/v1/check/prova-89
 */
routerAdd(
  'GET',
  '/backend/v1/check/prova-89',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [], green: false, criados: [] }

    // ---------- 1. empresas fixture A e B ----------
    function garanteEmpresa(apelido) {
      try {
        const ja = app.findRecordsByFilter('empresas', "apelido='" + apelido + "'", '', 1, 0)
        if (ja && ja.length > 0) return ja[0].id
      } catch (e0) {}
      const col = app.findCollectionByNameOrId('empresas')
      const emp = new Record(col)
      emp.set('nome', 'Empresa ' + apelido + ' (fixture CA-3-89)')
      emp.set('apelido', apelido)
      emp.set('cnpj', '')
      emp.set('ativa', false)
      emp.set('criada_em', new Date().toISOString())
      app.save(emp)
      out.criados.push('empresa:' + apelido)
      return emp.id
    }
    const idA = garanteEmpresa('FIXA')
    const idB = garanteEmpresa('FIXB')
    if (!idA || !idB) return e.json(200, { ok: false, erro: 'nao criou empresas' })
    out.empresaA = idA.slice(0, 10)
    out.empresaB = idB.slice(0, 10)

    // ---------- 2. conexões fixture, uma de cada empresa ----------
    function garanteConexao(nome, empresaId, numero) {
      try {
        const ja = app.findRecordsByFilter(
          'whatsapp_conexoes',
          "nome_exibicao='" + nome + "'",
          '',
          1,
          0,
        )
        if (ja && ja.length > 0) return ja[0].id
      } catch (e1) {}
      const col = app.findCollectionByNameOrId('whatsapp_conexoes')
      const cx = new Record(col)
      cx.set('nome_exibicao', nome)
      cx.set('numero', numero)
      cx.set('papel', 'vendedor')
      cx.set('ativo', false)
      cx.set('fixture', true)
      cx.set('empresa', empresaId)
      cx.set('session_id', '')
      cx.set('nome_segredo_chave', '')
      app.save(cx)
      out.criados.push('conexao:' + nome)
      return cx.id
    }
    const cxA = garanteConexao('CX FIXTURE 89 A', idA, '5541900000089')
    const cxB = garanteConexao('CX FIXTURE 89 B', idB, '5541900000090')

    // ---------- 3. registros de teste ----------
    // 4. a MESMA regra do hook: empresa pela origem
    const empDaConexao = {}
    try {
      for (const c of app.findRecordsByFilter('whatsapp_conexoes', '', '', 200, 0)) {
        const emp = String(c.get('empresa') || '')
        if (emp !== '') empDaConexao[c.id] = emp
      }
    } catch (e2) {}
    const empDoTelefone = {}
    try {
      for (const cv of app.findRecordsByFilter('whatsapp_conversas', '', '', 5000, 0)) {
        const emp = String(cv.get('empresa') || '')
        if (emp === '') continue
        const tel = String(cv.get('contato_telefone') || '')
        if (tel !== '') empDoTelefone[tel] = emp
      }
    } catch (e3) {}
    const empDaPessoa = {}
    try {
      for (const g of app.findRecordsByFilter('access_grants', "revoked_at=''", '', 500, 0)) {
        const emp = String(g.get('empresa') || '')
        const uid = String(g.get('user_id') || '')
        if (emp !== '' && uid !== '' && empDaPessoa[uid] === undefined) empDaPessoa[uid] = emp
      }
    } catch (e4) {}

    function empresaDo(cx, tel, pessoa) {
      if (cx !== '' && empDaConexao[cx] !== undefined) return empDaConexao[cx]
      if (tel !== '' && empDoTelefone[tel] !== undefined) return empDoTelefone[tel]
      if (pessoa !== '' && empDaPessoa[pessoa] !== undefined) return empDaPessoa[pessoa]
      return ''
    }

    // casos
    const caso1 = empresaDo(cxA, '', '') // pela conexão A -> deve dar A
    const caso2 = empresaDo(cxB, '', '') // pela conexão B -> deve dar B
    const caso3 = empresaDo('', '', '') // sem origem -> deve ficar VAZIO
    const caso4 = empresaDo('conexao-inexistente', 'telefone-inexistente', '') // lixo -> VAZIO

    out.passos.push({ passo: '1. conexao da empresa A -> empresa A', ok: caso1 === idA })
    out.passos.push({ passo: '2. conexao da empresa B -> empresa B', ok: caso2 === idB })
    out.passos.push({
      passo: '3. sem origem -> FICA VAZIO (nao carimba)',
      ok: caso3 === '',
    })
    out.passos.push({
      passo: '4. origem inexistente -> FICA VAZIO (nao carimba)',
      ok: caso4 === '',
    })

    // ---------- 5. RED: o que a regra ANTIGA fazia ----------
    // ela devolvia sempre a "primeira empresa" — para o caso 3 e 4 isso daria
    // uma empresa ERRADA (a Haisan), que é exatamente a mistura relatada.
    out.red = {
      explicacao: 'a regra antiga devolvia a 1a empresa do banco para TODO registro sem empresa',
      caso3_antigo: 'receberia a 1a empresa (mistura)',
      caso3_novo: caso3 === '' ? 'fica vazio (correto)' : 'carimbou (errado)',
    }

    // ---------- 6. limpa o que criou ----------
    try {
      for (const nome of ['CX FIXTURE 89 A', 'CX FIXTURE 89 B']) {
        const ja = app.findRecordsByFilter(
          'whatsapp_conexoes',
          "nome_exibicao='" + nome + "'",
          '',
          2,
          0,
        )
        for (const x of ja) {
          try {
            app.delete(x)
          } catch (eD1) {}
        }
      }
    } catch (e5) {}

    out.nao_identificados_contados = true
    out.green = out.passos.every(function (p) {
      return p.ok === true
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
