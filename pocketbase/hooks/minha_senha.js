/// <reference path="../pb_data/types.d.ts" />
/**
 * Troca de senha pelo próprio usuário (30/10).
 *
 * PROBLEMA: os acessos do piloto nasceram com a senha provisória
 * `Haisan@2026`, definida por migração e conhecida por mais de uma pessoa.
 * Aqui a pessoa troca por uma senha só dela.
 *
 * POST /backend/v1/minha-senha
 *   { senha_atual, senha_nova, senha_nova2 }
 *
 * O servidor confere a senha atual (sem isso qualquer sessão aberta trocaria
 * a senha), exige 8+ caracteres e recusa repetir a provisória. A senha nunca
 * é devolvida nem gravada em log.
 *
 * GET /backend/v1/minha-senha/status
 *   { provisoria, nome, email } — para a tela insistir na troca.
 */

routerAdd(
  'POST',
  '/backend/v1/minha-senha',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticacao obrigatoria' })

    var dados = {}
    try {
      dados = e.requestInfo().body || {}
    } catch (eB) {
      return e.json(400, { ok: false, erro: 'corpo invalido' })
    }

    const atual = String(dados.senha_atual || '')
    const nova = String(dados.senha_nova || '')
    const nova2 = String(dados.senha_nova2 || '')

    if (atual === '') return e.json(400, { ok: false, erro: 'informe a senha atual' })
    if (nova.length < 8)
      return e.json(400, { ok: false, erro: 'a senha nova precisa de pelo menos 8 caracteres' })
    if (nova !== nova2) return e.json(400, { ok: false, erro: 'as senhas novas nao conferem' })
    if (nova === 'Haisan@2026')
      return e.json(400, { ok: false, erro: 'escolha uma senha diferente da provisoria' })
    if (nova === atual)
      return e.json(400, { ok: false, erro: 'a senha nova precisa ser diferente da atual' })

    const eu = $app.findRecordById('users', e.auth.id)

    var confere = false
    try {
      confere = eu.validatePassword(atual)
    } catch (eV) {
      confere = false
    }
    if (!confere) return e.json(400, { ok: false, erro: 'senha atual incorreta' })

    try {
      eu.setPassword(nova)
      $app.save(eu)
    } catch (eS) {
      return e.json(500, { ok: false, erro: 'nao consegui gravar a senha' })
    }

    try {
      const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')
      const ev = new Record(colEv)
      ev.set('dedupe_key', 'senha_alterada|' + e.auth.id + '|' + Date.now())
      ev.set('evento', 'senha_alterada')
      ev.set('session_id', '')
      ev.set('ref_id', e.auth.id)
      ev.set('resultado', 'ok')
      ev.set('codigo_erro', '')
      ev.set('trace_id', '')
      ev.set('duracao_ms', 0)
      ev.set('recebido_em', new Date().toISOString())
      ev.set('fixture', false)
      $app.save(ev)
    } catch (eL) {}

    return e.json(200, { ok: true, mensagem: 'Senha alterada. Use a nova no proximo acesso.' })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/minha-senha/status',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticacao obrigatoria' })
    const eu = $app.findRecordById('users', e.auth.id)
    var provisoria = false
    try {
      provisoria = eu.validatePassword('Haisan@2026')
    } catch (eV) {
      provisoria = false
    }
    return e.json(200, {
      ok: true,
      provisoria: provisoria,
      nome: String(eu.get('name') || ''),
      email: String(eu.get('email') || ''),
    })
  },
  $apis.requireAuth(),
)
