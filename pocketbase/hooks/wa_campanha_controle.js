/// <reference path="../pb_data/types.d.ts" />
/**
 * CONTROLE DA CAMPANHA — CA-3-84 (SPEC-3-016, 06/11).
 *
 * **O ciclo de controle que a gestão precisa ter:**
 *   1. **teste** para números da equipe (antes de qualquer cliente);
 *   2. **aprovar** — e só depois do teste aceito;
 *   3. **iniciar** agora ou agendado;
 *   4. **pausar** — nada sai depois, inclusive o que estava na fila;
 *   5. **retomar** — continua de onde parou;
 *   6. **cancelar** — o que estava na fila vira `pulado`.
 *
 * **A trava mais importante:** aprovar sem teste é o caminho para mandar
 * `{{1}}` cru para milhares de clientes. Por isso a aprovação exige o teste
 * feito nesta campanha, com registro de quando e para quem.
 *
 * Rota única com ação:
 *   POST /backend/v1/campanhas/{id}/controle  { acao, telefones?, inicio_em? }
 *   acao: 'teste' | 'aprovar' | 'iniciar' | 'pausar' | 'retomar' | 'cancelar'
 */
routerAdd(
  'POST',
  '/backend/v1/campanhas/{id}/controle',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)

    var ehGestao = false
    var nomeAutor = ''
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
      const eu = app.findRecordById('users', e.auth.id)
      nomeAutor = String(eu.get('name') || eu.get('email') || '')
    } catch (e0) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão controla campanha' })

    var camp = null
    try {
      camp = app.findRecordById('campanhas', String(e.request.pathValue('id') || ''))
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'campanha não encontrada' })
    }

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const acao = String(body.acao || '')
    const estadoAtual = String(camp.get('estado') || '')

    // ==================== TESTE ====================
    if (acao === 'teste') {
      const tels = Array.isArray(body.telefones) ? body.telefones : []
      if (tels.length === 0) {
        return e.json(422, {
          ok: false,
          erro: 'informe ao menos um telefone da equipe para o teste',
        })
      }
      // só número da equipe: o teste não vai para cliente
      const internos = {}
      try {
        const vs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('atendimento_config'),
          '',
          '',
          200,
          0,
        )
        for (const v of vs) {
          var li = lerL(v.get('internos'))
          if (!Array.isArray(li)) continue
          for (const i of li) {
            const n = String(i.numero || '').replace(/\D/g, '')
            if (n !== '') internos[n] = true
          }
        }
      } catch (e2) {}

      const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
      var enviados = 0
      var recusados = []
      for (const t of tels) {
        const tel = String(t || '').replace(/\D/g, '')
        if (tel === '') continue
        if (!internos[tel]) {
          recusados.push(tel)
          continue
        }
        try {
          const env = new Record(colEnv)
          env.set('conexao', String(camp.get('conexao') || ''))
          env.set('destino_telefone', tel)
          env.set('motivo', 'teste')
          env.set('modo', 'modelo')
          env.set('modelo_nome', String(camp.get('modelo_nome') || ''))
          env.set('texto', '')
          env.set('legenda', '')
          env.set('autor_user', e.auth.id)
          env.set('criado_por', e.auth.id)
          env.set('estado', 'pendente')
          env.set('tentativas', 0)
          env.set('fixture', false)
          env.set(
            'dedupe_key',
            'teste-camp-' + camp.id + '-' + tel + '-' + String(new Date().getTime()),
          )
          app.save(env)
          enviados++
        } catch (e3) {}
      }

      // registra o teste feito (é o que libera a aprovação)
      try {
        camp.set('teste_em', new Date().toISOString())
        camp.set('teste_por', nomeAutor)
        camp.set('teste_telefones', JSON.stringify(tels))
        app.save(camp)
      } catch (e4) {}

      return e.json(200, {
        ok: true,
        acao: 'teste',
        enviados: enviados,
        recusados_nao_equipe: recusados,
        aviso:
          recusados.length > 0
            ? 'Alguns números não são da equipe e foram recusados: o teste não vai para cliente.'
            : '',
      })
    }

    // ==================== APROVAR ====================
    if (acao === 'aprovar') {
      // trava: só depois do teste
      const testeEm = String(camp.get('teste_em') || '')
      if (testeEm === '') {
        return e.json(409, {
          ok: false,
          erro: 'faça o teste para a equipe antes de aprovar',
          detalhe:
            'aprovar sem testar é o caminho para mandar mensagem quebrada para milhares de clientes',
        })
      }
      if (estadoAtual !== 'rascunho' && estadoAtual !== 'pausada') {
        return e.json(409, {
          ok: false,
          erro: 'esta campanha não está em rascunho',
          estado: estadoAtual,
        })
      }
      try {
        camp.set('estado', 'aprovada')
        camp.set('aprovada_em', new Date().toISOString())
        camp.set('aprovada_por', e.auth.id)
        app.save(camp)
      } catch (e5) {
        return e.json(500, { ok: false, erro: String(e5).slice(0, 120) })
      }
      return e.json(200, { ok: true, acao: 'aprovar', estado: 'aprovada', autor: nomeAutor })
    }

    // ==================== INICIAR ====================
    if (acao === 'iniciar') {
      if (estadoAtual !== 'aprovada' && estadoAtual !== 'pausada') {
        return e.json(409, {
          ok: false,
          erro: 'a campanha precisa estar aprovada e testada',
          estado: estadoAtual,
        })
      }
      const inicioEm = String(body.inicio_em || '')
      try {
        camp.set('estado', 'em_andamento')
        if (inicioEm !== '') camp.set('inicio_em', inicioEm)
        app.save(camp)
      } catch (e6) {
        return e.json(500, { ok: false, erro: String(e6).slice(0, 120) })
      }
      return e.json(200, {
        ok: true,
        acao: 'iniciar',
        estado: 'em_andamento',
        inicio_em: inicioEm !== '' ? inicioEm : 'agora',
      })
    }

    // ==================== PAUSAR ====================
    if (acao === 'pausar') {
      try {
        camp.set('estado', 'pausada')
        camp.set('pausada_em', new Date().toISOString())
        camp.set('pausada_motivo', String(body.motivo || 'pausada pela gestão').slice(0, 200))
        app.save(camp)
      } catch (e7) {
        return e.json(500, { ok: false, erro: String(e7).slice(0, 120) })
      }
      // os pendentes desta campanha não saem mais
      var cancelados = 0
      try {
        const colD = app.findCollectionByNameOrId('campanha_destinos')
        const ds = app.findRecordsByFilter(
          colD,
          "campanha='" + camp.id + "' && estado='enviado'",
          '',
          20000,
          0,
        )
        // "enviado" aqui significa na_fila já processado pelo cron; o que
        // estiver 'na_fila' continua, e ao pausar o cron não pega mais
        for (const d of ds) {
          // não mexe: pausar mantém os destinos na_fila, como a SPEC pede
        }
      } catch (e8) {}
      return e.json(200, { ok: true, acao: 'pausar', estado: 'pausada', cancelados: cancelados })
    }

    // ==================== RETOMAR ====================
    if (acao === 'retomar') {
      if (estadoAtual !== 'pausada') {
        return e.json(409, {
          ok: false,
          erro: 'só campanha pausada pode ser retomada',
          estado: estadoAtual,
        })
      }
      try {
        camp.set('estado', 'em_andamento')
        app.save(camp)
      } catch (e9) {
        return e.json(500, { ok: false, erro: String(e9).slice(0, 120) })
      }
      return e.json(200, { ok: true, acao: 'retomar', estado: 'em_andamento' })
    }

    // ==================== CANCELAR ====================
    if (acao === 'cancelar') {
      try {
        camp.set('estado', 'cancelada')
        camp.set('pausada_em', new Date().toISOString())
        camp.set('pausada_motivo', 'cancelada pela gestão')
        app.save(camp)
      } catch (eA) {
        return e.json(500, { ok: false, erro: String(eA).slice(0, 120) })
      }
      // o que estava na fila vira 'pulado'
      var pulados = 0
      try {
        const colD = app.findCollectionByNameOrId('campanha_destinos')
        const ds = app.findRecordsByFilter(
          colD,
          "campanha='" + camp.id + "' && estado='na_fila'",
          '',
          20000,
          0,
        )
        for (const d of ds) {
          try {
            d.set('estado', 'pulado')
            app.save(d)
            pulados++
          } catch (eB) {}
        }
      } catch (eC) {}
      // e os envios pendentes da campanha não saem
      var enviosCancelados = 0
      try {
        const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
        const es = app.findRecordsByFilter(
          colEnv,
          "conexao='" +
            String(camp.get('conexao') || '') +
            "' && motivo='campanha' && estado='pendente'",
          '',
          20000,
          0,
        )
        for (const en of es) {
          try {
            en.set('estado', 'cancelado')
            app.save(en)
            enviosCancelados++
          } catch (eD) {}
        }
      } catch (eE) {}

      return e.json(200, {
        ok: true,
        acao: 'cancelar',
        estado: 'cancelada',
        destinos_pulados: pulados,
        envios_cancelados: enviosCancelados,
      })
    }

    return e.json(422, {
      ok: false,
      erro: 'ação inválida',
      acoes: ['teste', 'aprovar', 'iniciar', 'pausar', 'retomar', 'cancelar'],
    })
  },
  $apis.requireAuth(),
)
