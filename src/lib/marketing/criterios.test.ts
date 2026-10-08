/**
 * Provas TDD do cadastro de critérios de alerta (SPEC-2-002, card fc6d0f5a).
 * CA-2-05: critério sem aprovação ou campos obrigatórios não gera alerta;
 * aprovação registra ator/data/versão e preserva histórico.
 * Roda localmente com tsx (mesma estratégia das tasks anteriores).
 */
import {
  validarCampos,
  exigirCompletos,
  podeAprovar,
  proximaVersao,
  resumoCriterio,
} from './criterios'

let falhas = 0
function prova(nome: string, cond: boolean) {
  if (cond) {
    console.log(`  OK ${nome}`)
  } else {
    falhas += 1
    console.error(`  FALHOU ${nome}`)
  }
}

const COMPLETO = {
  metric: 'gasto',
  canal: 'meta_ads',
  objetivo: 'leads',
  resultType: 'conversoes',
  natureza: 'pago',
  direcao: 'decrease',
  thresholdPct: 20,
  minBase: 10,
  periodKind: 'monthly',
}

// ---------- validarCampos: rascunho aceita incompleto, rejeita valor inválido ----------
console.log(' validarCampos — rascunho:')
prova('rascunho vazio é aceito (incompleto permitido)', validarCampos({}).valido)
prova('campo único válido é aceito', validarCampos({ metric: 'gasto' }).valido)
prova('metric desconhecida é rejeitada', !validarCampos({ metric: 'vendas_totais' }).valido)
prova('canal desconhecido é rejeitado', !validarCampos({ canal: 'tiktok' }).valido)
prova('natureza válida é aceita', validarCampos({ natureza: 'pago' }).valido)
prova('periodKind inválido é rejeitado', !validarCampos({ periodKind: 'semanal' }).valido)
prova('resultType inválido é rejeitado', !validarCampos({ resultType: 'compras' }).valido)
prova('direção inválida é rejeitada', !validarCampos({ direcao: 'up' }).valido)
prova('threshold 0 é rejeitado (deve ser > 0)', !validarCampos({ thresholdPct: 0 }).valido)
prova('threshold negativo é rejeitado', !validarCampos({ thresholdPct: -5 }).valido)
prova('threshold como texto é rejeitado', !validarCampos({ thresholdPct: '20' }).valido)
prova('minBase 0 é rejeitado', !validarCampos({ minBase: 0 }).valido)
prova(
  'erros nomeiam o campo (thresholdPct)',
  validarCampos({ thresholdPct: 0 }).erros.thresholdPct !== undefined,
)

// ---------- exigirCompletos: aprovação exige os 9 campos obrigatórios ----------
console.log(' exigirCompletos — aprovação:')
prova('fixture completa é aprovável', exigirCompletos(COMPLETO).valido)
prova(
  'sem thresholdPct é rejeitado',
  !exigirCompletos({ ...COMPLETO, thresholdPct: undefined }).valido,
)
prova(
  'sem periodKind é rejeitado (aprovação sem period_kind = 422)',
  !exigirCompletos({ ...COMPLETO, periodKind: undefined }).valido,
)
prova('sem minBase é rejeitado', !exigirCompletos({ ...COMPLETO, minBase: undefined }).valido)
prova('sem metric é rejeitado', !exigirCompletos({ ...COMPLETO, metric: undefined }).valido)
prova('threshold 0 presente não aprova', !exigirCompletos({ ...COMPLETO, thresholdPct: 0 }).valido)
prova('vazio lista vários campos faltando', Object.keys(exigirCompletos({}).erros).length >= 9)

// ---------- podeAprovar: estado + completude ----------
console.log(' podeAprovar — portão de estado:')
prova('draft completo → aprovável', podeAprovar({ estado: 'draft', ...COMPLETO }).ok)
prova(
  'draft incompleto → motivo cita campos',
  !podeAprovar({ estado: 'draft', metric: 'gasto' }).ok,
)
prova('approved → não reaprova (motivo)', !podeAprovar({ estado: 'approved', ...COMPLETO }).ok)
prova('archived → não aprova (motivo)', !podeAprovar({ estado: 'archived', ...COMPLETO }).ok)

// ---------- proximaVersao: versionamento imutável ----------
console.log(' proximaVersao — versionamento:')
prova(
  'sem histórico → criar versão 1',
  proximaVersao([]).acao === 'criar' && proximaVersao([]).versao === 1,
)
prova(
  'draft v1 existente → editar a MESMA versão',
  (() => {
    const r = proximaVersao([{ estado: 'draft', versao: 1 }])
    return r.acao === 'editar' && r.versao === 1
  })(),
)
prova(
  'aprovado v2 → nova draft v3 (prova antiga intacta)',
  (() => {
    const r = proximaVersao([
      { estado: 'archived', versao: 1 },
      { estado: 'approved', versao: 2 },
    ])
    return r.acao === 'criar' && r.versao === 3
  })(),
)
prova(
  'archivado v1 sem draft → criar v2',
  (() => {
    const r = proximaVersao([{ estado: 'archived', versao: 1 }])
    return r.acao === 'criar' && r.versao === 2
  })(),
)
prova(
  'draft + aprovado → editar o draft (um rascunho aberto)',
  (() => {
    const r = proximaVersao([
      { estado: 'approved', versao: 1 },
      { estado: 'draft', versao: 2 },
    ])
    return r.acao === 'editar' && r.versao === 2
  })(),
)

// ---------- resumoCriterio: linha legível ----------
console.log(' resumoCriterio:')
const resumo = resumoCriterio(COMPLETO)
prova('resumo menciona a métrica', resumo.includes('gasto'))
prova('resumo menciona a direção', resumo.includes('queda'))
prova('resumo menciona o limiar', resumo.includes('20'))
prova('resumo menciona o calendário', resumo.includes('mensal'))

if (falhas > 0) {
  console.error(`\nFALHOU: ${falhas} prova(s) não passaram`)
  process.exit(1)
} else {
  console.log('\nTODAS AS PROVAS PASSARAM')
}
