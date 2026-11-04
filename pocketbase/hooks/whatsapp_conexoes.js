/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp — tela de números (SPEC-3-005, CA-3-11).
 *
 * Rotas (autenticadas, ação `manage_whatsapp`):
 *   GET  /backend/v1/whatsapp/conexoes         → lista os números com saúde
 *   POST /backend/v1/whatsapp/conexoes         → cadastra número (central ou vendedor)
 *   PATCH /backend/v1/whatsapp/conexoes/{id}   → ativa/desativa, ajusta dados
 *   GET  /backend/v1/whatsapp/saude            → segredos configurados (só nomes) + recusas
 *
 * Regras (CA-3-11):
 *   - número inválido (não 12/13 dígitos com 55) → 422
 *   - vendedor sem usuário → 422
 *   - segunda central ativa → 422
 *   - session_id repetido → 409 (UNIQUE do banco)
 *   - usuário sem manage_whatsapp → 403
 *
 * A chave da D-API NUNCA passa por aqui: a conexão guarda só o NOME do segredo.
 * JSVM: lógica INLINE nos callbacks.
 */

routerAdd(
  'GET',
  '/backend/v1/whatsapp/conexoes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var tem = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('manage_whatsapp') >= 0) tem = true
    }
    if (!tem) {
      return e.json(403, { ok: false, erro: 'sem permissão para gerir números (manage_whatsapp)' })
    }
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const col = $app.findCollectionByNameOrId('whatsapp_conexoes')
    const registros = $app.findRecordsByFilter(
      col,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      100,
      0,
    )
    // quais segredos existem (só nomes, nunca valores)
    const segredos = []
    try {
      const usados = [
        'DAPI_API_KEY',
        'DAPI_KEY_CENTRAL',
        'DAPI_KEY_FABIO',
        'DAPI_KEY_DOUGLAS',
        'DAPI_KEY_ADRIANA',
        'DAPI_KEY_ELISANGELA',
        'DAPI_USER_KEY',
      ]
      for (const nome of usados) {
        if ($secrets.get(nome) !== '') segredos.push(nome)
      }
    } catch (eS) {}
    const itens = []
    for (const c of registros) {
      let vendedorNome = ''
      const vu = String(c.get('vendedor_user') || '')
      if (vu !== '') {
        try {
          const u = $app.findRecordById('users', vu)
          vendedorNome = String(u.get('name') || u.get('email') || '')
        } catch (eU) {}
      }
      const sid = String(c.get('session_id') || '')
      itens.push({
        id: c.id,
        papel: c.get('papel'),
        numero: c.get('numero'),
        nome_exibicao: c.get('nome_exibicao'),
        vendedor_user: vu,
        vendedor_nome: vendedorNome,
        vendedor_nome_publico: c.get('vendedor_nome_publico'),
        session_id_mascarado: sid === '' ? '' : '••••' + sid.slice(-6),
        tem_session: sid !== '',
        ativo: String(c.get('ativo')) === 'true',
        nome_segredo_chave: c.get('nome_segredo_chave'),
        // o envio usa a chave do número e, se ela faltar, a chave geral da conta
        // D-API (DAPI_USER_KEY), como em whatsapp_envios_fila.js. Antes a tela
        // dizia "ausente" mesmo com a chave geral configurada (04/11).
        segredo_configurado:
          segredos.indexOf(String(c.get('nome_segredo_chave') || '')) >= 0 ||
          segredos.indexOf('DAPI_USER_KEY') >= 0,
        usa_chave_geral:
          segredos.indexOf(String(c.get('nome_segredo_chave') || '')) < 0 &&
          segredos.indexOf('DAPI_USER_KEY') >= 0,
        ultimo_evento_em: String(c.get('ultimo_evento_em') || ''),
        ultimo_status_conexao: c.get('ultimo_status_conexao'),
        ultimo_status_em: String(c.get('ultimo_status_em') || ''),
        recusas_token: Number(c.get('recusas_token') || 0),
      })
    }
    return e.json(200, {
      ok: true,
      total: itens.length,
      itens: itens,
      segredos_configurados: segredos,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/whatsapp/conexoes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var tem = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('manage_whatsapp') >= 0) tem = true
    }
    if (!tem) {
      return e.json(403, { ok: false, erro: 'sem permissão para gerir números (manage_whatsapp)' })
    }
    const body = e.requestInfo().body || {}
    const papel = String(body.papel || '')
    if (papel !== 'central' && papel !== 'vendedor') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { papel: 'informe "central" ou "vendedor"' },
      })
    }
    // número: só dígitos, com 55, 12 ou 13 dígitos
    const numero = String(body.numero || '').replace(/[^0-9]/g, '')
    if ((numero.length !== 12 && numero.length !== 13) || numero.indexOf('55') !== 0) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { numero: 'informe o número com 55 + DDD + número (12 ou 13 dígitos)' },
      })
    }
    const nomeExibicao = String(body.nome_exibicao || '')
      .trim()
      .slice(0, 120)
    if (nomeExibicao === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { nome_exibicao: 'informe um nome (ex.: "Atendimento Haisan")' },
      })
    }
    const vendedorUser = String(body.vendedor_user || '').trim()
    if (papel === 'vendedor' && vendedorUser === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { vendedor_user: 'número de vendedor precisa do usuário do vendedor' },
      })
    }
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const col = $app.findCollectionByNameOrId('whatsapp_conexoes')
    const filtroFix = 'fixture=' + (ehFixture ? 'true' : 'false')
    // só uma central ativa
    if (papel === 'central') {
      const centrais = $app.findRecordsByFilter(
        col,
        filtroFix + " && papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (centrais && centrais.length > 0) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { papel: 'já existe uma central ativa — desative a atual antes' },
        })
      }
    }
    // vendedor único entre conexões ativas
    if (papel === 'vendedor') {
      const jaTem = $app.findRecordsByFilter(
        col,
        filtroFix +
          " && papel='vendedor' && ativo=true && vendedor_user='" +
          vendedorUser.replace(/'/g, '') +
          "'",
        '',
        1,
        0,
      )
      if (jaTem && jaTem.length > 0) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { vendedor_user: 'este vendedor já tem um número ativo' },
        })
      }
      // o usuário precisa existir
      try {
        $app.findRecordById('users', vendedorUser)
      } catch (eV) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { vendedor_user: 'usuário do vendedor não encontrado' },
        })
      }
    }
    const sessionId = String(body.session_id || '')
      .trim()
      .slice(0, 80)
    const nomeSegredo = String(body.nome_segredo_chave || 'DAPI_API_KEY')
      .trim()
      .slice(0, 60)
    try {
      const novo = new Record(col)
      novo.set('papel', papel)
      novo.set('numero', numero)
      novo.set('nome_exibicao', nomeExibicao)
      novo.set('vendedor_user', papel === 'vendedor' ? vendedorUser : '')
      novo.set(
        'vendedor_nome_publico',
        String(body.vendedor_nome_publico || '')
          .trim()
          .slice(0, 120),
      )
      novo.set('session_id', sessionId)
      novo.set('ativo', body.ativo === false ? false : true)
      novo.set('nome_segredo_chave', nomeSegredo)
      novo.set('guardar_historico', true)
      novo.set('recusas_token', 0)
      novo.set('fixture', ehFixture)
      $app.save(novo)
      return e.json(201, { ok: true, id: novo.id, papel: papel, numero: numero })
    } catch (eSave) {
      // UNIQUE de session_id ou numero
      const msg = String(eSave)
      if (msg.indexOf('idx_wa_conexoes_session') >= 0 || msg.indexOf('session_id') >= 0) {
        return e.json(409, {
          ok: false,
          erro: 'session_id já cadastrado em outro número',
          campos: { session_id: 'este código já está em uso' },
        })
      }
      return e.json(409, {
        ok: false,
        erro: 'número já cadastrado',
        campos: { numero: 'este número já existe no sistema' },
      })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'PATCH',
  '/backend/v1/whatsapp/conexoes/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var tem = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('manage_whatsapp') >= 0) tem = true
    }
    if (!tem) {
      return e.json(403, { ok: false, erro: 'sem permissão para gerir números (manage_whatsapp)' })
    }
    let conexao
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'número não encontrado' })
    }
    const body = e.requestInfo().body || {}
    if (body.ativo !== undefined) conexao.set('ativo', body.ativo === true)
    if (body.session_id !== undefined)
      conexao.set(
        'session_id',
        String(body.session_id || '')
          .trim()
          .slice(0, 80),
      )
    if (body.nome_exibicao !== undefined)
      conexao.set(
        'nome_exibicao',
        String(body.nome_exibicao || '')
          .trim()
          .slice(0, 120),
      )
    if (body.vendedor_nome_publico !== undefined)
      conexao.set(
        'vendedor_nome_publico',
        String(body.vendedor_nome_publico || '')
          .trim()
          .slice(0, 120),
      )
    if (body.nome_segredo_chave !== undefined)
      conexao.set(
        'nome_segredo_chave',
        String(body.nome_segredo_chave || 'DAPI_API_KEY')
          .trim()
          .slice(0, 60),
      )
    if (body.modelo_aviso_vendedor !== undefined)
      conexao.set(
        'modelo_aviso_vendedor',
        String(body.modelo_aviso_vendedor || '')
          .trim()
          .slice(0, 120),
      )
    if (body.modelo_transferencia_cliente !== undefined)
      conexao.set(
        'modelo_transferencia_cliente',
        String(body.modelo_transferencia_cliente || '')
          .trim()
          .slice(0, 120),
      )
    try {
      $app.save(conexao)
      return e.json(200, {
        ok: true,
        id: conexao.id,
        ativo: String(conexao.get('ativo')) === 'true',
      })
    } catch (eS) {
      return e.json(409, { ok: false, erro: 'não foi possível salvar (session_id repetido?)' })
    }
  },
  $apis.requireAuth(),
)
