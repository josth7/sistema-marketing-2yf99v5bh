/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0137 — campanhas de promoção (CA-3-53, SPEC-3-012, 05/11).
 *
 * **O que esta migração cria:**
 *   - `campanhas`: a campanha em si (número, filtros, modelo, imagem, início,
 *     ritmo, estado, aprovação).
 *   - `campanha_destinos`: um registro por destinatário, com o estado do envio.
 *   - `opt_out`: telefones que pediram para sair. **Nunca** entram em campanha.
 *
 * **Decisões do dono (05/11) que já entram no desenho:**
 *   - **só a gestão** cria campanha (trava na rota, não no dado);
 *   - **teto de 200 mensagens por dia** por número (`teto_dia` padrão 200);
 *   - o ritmo por hora começa em **20**, como a SPEC pede.
 *
 * **Por que opt-out é coleção separada:** sair de uma campanha é uma vontade
 * do cliente que vale para TODAS as próximas. Guardar por campanha faria ele
 * receber de novo na seguinte — e isso queima o número.
 */
migrate(
  (app) => {
    // ---------- campanhas ----------
    var existe = null
    try {
      existe = app.findCollectionByNameOrId('campanhas')
    } catch (e0) {}
    if (!existe) {
      const col = new Collection({
        name: 'campanhas',
        type: 'base',
        fields: [
          { name: 'nome', type: 'text' },
          { name: 'conexao', type: 'text' },
          { name: 'modelo_nome', type: 'text' },
          { name: 'imagem_url', type: 'text' },
          { name: 'filtros', type: 'text' },
          { name: 'inicio_em', type: 'date' },
          { name: 'ritmo_hora', type: 'number' },
          { name: 'teto_dia', type: 'number' },
          { name: 'estado', type: 'text' },
          { name: 'aprovada_em', type: 'date' },
          { name: 'aprovada_por', type: 'text' },
          { name: 'pausada_em', type: 'date' },
          { name: 'pausada_motivo', type: 'text' },
          { name: 'criada_por', type: 'text' },
          { name: 'fixture', type: 'bool' },
        ],
      })
      app.save(col)
      console.log('0137: campanhas criada')
    }

    // ---------- destinos ----------
    var exD = null
    try {
      exD = app.findCollectionByNameOrId('campanha_destinos')
    } catch (e1) {}
    if (!exD) {
      const colD = new Collection({
        name: 'campanha_destinos',
        type: 'base',
        fields: [
          { name: 'campanha', type: 'text' },
          { name: 'telefone', type: 'text' },
          { name: 'nome', type: 'text' },
          { name: 'estado', type: 'text' },
          { name: 'enviado_em', type: 'date' },
          { name: 'erro', type: 'text' },
          { name: 'fixture', type: 'bool' },
          { name: 'dedupe_key', type: 'text' },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_camp_dest_dedupe ON campanha_destinos (dedupe_key)'],
      })
      app.save(colD)
      console.log('0137: campanha_destinos criada')
    }

    // ---------- opt-out ----------
    var exO = null
    try {
      exO = app.findCollectionByNameOrId('opt_out')
    } catch (e2) {}
    if (!exO) {
      const colO = new Collection({
        name: 'opt_out',
        type: 'base',
        fields: [
          { name: 'telefone', type: 'text' },
          { name: 'motivo', type: 'text' },
          { name: 'origem', type: 'text' },
          { name: 'criado_em', type: 'date' },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_optout_tel ON opt_out (telefone)'],
      })
      app.save(colO)
      console.log('0137: opt_out criada')
    }

    console.log('0137: pronto')
  },
  (app) => {
    for (const n of ['campanha_destinos', 'opt_out', 'campanhas']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (e) {}
    }
  },
)
