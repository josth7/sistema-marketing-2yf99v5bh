/// <reference path="../pb_data/types.d.ts" />
/**
 * Troca de senha pelo próprio usuário (30/10).
 *
 * PROBLEMA QUE RESOLVE: os 5 acessos do piloto (4 vendedores + Anezia) estão
 * com a senha provisória `Haisan@2026`, que eu defini por migração e que é
 * conhecida por mais de uma pessoa. Quem quiser trocar, hoje não tem onde.
 *
 * POST /backend/v1/minha-senha
 *   { senha_atual, senha_nova, senha_nova2 }
 *
 * Regras:
 *   - exige autenticação
 *   - confere a senha atual (sem isso qualquer sessão aberta trocaria a senha)
 *   - mínimo 8 caracteres, e não pode ser igual à provisória
 *   - nunca devolve a senha em resposta nem grava em log
 */

const SENHA_PROVISORIA = 'Haisan@2026'

routerAdd(
  'POST',
  '/backend/v1/minha-senha',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    var dados = {}
    try {
      dados = e.requestInfo().body || {}
    } catch (eB) {
      return e.json(400, { ok: false, erro: 'corpo inválido' })
    }

    const atual = String(dados.senha_atual || '')
    const nova = String(dados.senha_nova || '')
    const nova2 = String(dados.senha_nova2 || '')

    if (atual === '') return e.json(400, { ok: false, erro: 'informe a senha atual' })
    if (nova.length < 8)
      return e.json(400, { ok: false, erro: 'a senha nova precisa de pelo menos 8 caracteres' })
    if (nova !== nova2) return e.json(400, { ok: false, erro: 'as senhas novas não conferem' })
    if (nova === SENHA_PROVISORIA)
      return e.json(400, { ok: false, erro: 'escolha uma senha diferente da provisória' })
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
      return e.json(500, { ok: false, erro: 'não consegui gravar a senha' })
    }

    // registro do evento, sem guardar senha
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

    return e.json(200, { ok: true, mensagem: 'Senha alterada. Use a nova no próximo acesso.' })
  },
  $apis.requireAuth(),
)

/**
 * GET /backend/v1/minha-senha/status
 * Diz se o usuário logado ainda está com a senha provisória, para a tela
 * poder insistir na troca. Confere testando a senha provisória contra o
 * próprio registro — não expõe nada além disso.
 */
routerAdd(
  'GET',
  '/backend/v1/minha-senha/status',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const eu = $app.findRecordById('users', e.auth.id)
    var provisoria = false
    try {
      provisoria = eu.validatePassword(SENHA_PROVISORIA)
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
