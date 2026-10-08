/**
 * Validação e versionamento de critérios de alerta (SPEC-2-002, card fc6d0f5a).
 * CA-2-05: rascunho pode nascer incompleto; aprovação exige os campos
 * obrigatórios da SPEC e registra ator/data/versão — prova antiga intacta.
 * Nenhum limiar padrão: valores vêm do formulário; aprovação real dos limiares
 * é da Anézia no workshop (CL-003) — aqui só a mecânica de cadastro.
 */

export const METRICAS = [
  'gasto',
  'cliques',
  'impressoes',
  'alcance',
  'resultados',
  'cpc',
  'cpm',
  'ctr',
  'custo_por_resultado',
] as const
export const CANAIS = ['meta_ads', 'google_ads', 'meta_organico'] as const
export const OBJETIVOS = [
  'alcance',
  'trafico',
  'engajamento',
  'leads',
  'vendas',
  'video',
  'nao_informado',
] as const
export const NATUREZAS = ['pago', 'organico'] as const
export const DIRECOES = ['increase', 'decrease'] as const
export const PERIODOS = ['monthly', 'calendar_half'] as const
export const TIPOS_RESULTADO = [
  'conversoes',
  'leads',
  'impressoes',
  'cliques',
  'alcance',
  'engajamento',
  'vendas',
  'video',
] as const
export const ESTADOS = ['draft', 'approved', 'archived'] as const

export interface CriterioCampos {
  metric?: string | null
  canal?: string | null
  objetivo?: string | null
  resultType?: string | null
  natureza?: string | null
  direcao?: string | null
  thresholdPct?: number | null
  minBase?: number | null
  periodKind?: string | null
}

export type ErrosCampos = Record<string, string>

const CAMPOS_OBRIGATORIOS: Array<{ campo: keyof CriterioCampos; rotulo: string }> = [
  { campo: 'metric', rotulo: 'métrica' },
  { campo: 'canal', rotulo: 'canal' },
  { campo: 'objetivo', rotulo: 'objetivo' },
  { campo: 'resultType', rotulo: 'tipo do resultado' },
  { campo: 'natureza', rotulo: 'natureza' },
  { campo: 'direcao', rotulo: 'direção' },
  { campo: 'thresholdPct', rotulo: 'limiar (%)' },
  { campo: 'minBase', rotulo: 'base mínima' },
  { campo: 'periodKind', rotulo: 'calendário do período' },
]

function presente(v: unknown): boolean {
  return v !== undefined && v !== null && v !== ''
}

/** Valida SOMENTE os campos presentes (rascunho pode nascer incompleto). */
export function validarCampos(b: CriterioCampos): { valido: boolean; erros: ErrosCampos } {
  const erros: ErrosCampos = {}
  if (presente(b.metric) && !(METRICAS as readonly string[]).includes(b.metric as string))
    erros.metric = `métrica inválida: use ${METRICAS.join(', ')}`
  if (presente(b.canal) && !(CANAIS as readonly string[]).includes(b.canal as string))
    erros.canal = `canal inválido: use ${CANAIS.join(', ')}`
  if (presente(b.objetivo) && !(OBJETIVOS as readonly string[]).includes(b.objetivo as string))
    erros.objetivo = `objetivo inválido: use ${OBJETIVOS.join(', ')}`
  if (
    presente(b.resultType) &&
    !(TIPOS_RESULTADO as readonly string[]).includes(b.resultType as string)
  )
    erros.resultType = `tipo do resultado inválido: use ${TIPOS_RESULTADO.join(', ')}`
  if (presente(b.natureza) && !(NATUREZAS as readonly string[]).includes(b.natureza as string))
    erros.natureza = `natureza inválida: use ${NATUREZAS.join(', ')}`
  if (presente(b.direcao) && !(DIRECOES as readonly string[]).includes(b.direcao as string))
    erros.direcao = `direção inválida: use ${DIRECOES.join(', ')}`
  if (presente(b.periodKind) && !(PERIODOS as readonly string[]).includes(b.periodKind as string))
    erros.periodKind = `calendário inválido: use ${PERIODOS.join(', ')}`
  if (b.thresholdPct !== undefined && b.thresholdPct !== null) {
    if (
      typeof b.thresholdPct !== 'number' ||
      !Number.isFinite(b.thresholdPct) ||
      b.thresholdPct <= 0
    )
      erros.thresholdPct = 'limiar deve ser um número maior que 0'
  }
  if (b.minBase !== undefined && b.minBase !== null) {
    if (typeof b.minBase !== 'number' || !Number.isFinite(b.minBase) || b.minBase <= 0)
      erros.minBase = 'base mínima deve ser um número maior que 0'
  }
  return { valido: Object.keys(erros).length === 0, erros }
}

/** Aprovação exige TODOS os campos obrigatórios presentes e válidos (SPEC-2-002). */
export function exigirCompletos(b: CriterioCampos): { valido: boolean; erros: ErrosCampos } {
  const erros: ErrosCampos = {}
  for (const { campo, rotulo } of CAMPOS_OBRIGATORIOS) {
    if (!presente(b[campo])) erros[campo] = `${rotulo} é obrigatório para aprovar`
  }
  const v = validarCampos(b)
  return { valido: Object.keys(erros).length === 0 && v.valido, erros: { ...erros, ...v.erros } }
}

/** Portão de estado: só rascunho completo é aprovável. */
export function podeAprovar(c: CriterioCampos & { estado?: string | null }): {
  ok: boolean
  motivo: string | null
} {
  if (c.estado !== 'draft')
    return { ok: false, motivo: `estado ${c.estado ?? 'indefinido'} não é aprovável — só rascunho` }
  const ex = exigirCompletos(c)
  if (!ex.valido)
    return {
      ok: false,
      motivo: `campos obrigatórios ausentes: ${Object.keys(ex.erros).join(', ')}`,
    }
  return { ok: true, motivo: null }
}

export interface VersaoHistorica {
  estado: string | null
  versao: number | null
}

/**
 * Versionamento imutável: um rascunho aberto é EDITADO na mesma versão;
 * concluído (aprovado/arquivado) → nova versão draft. Prova antiga intacta.
 */
export function proximaVersao(historico: VersaoHistorica[]): {
  acao: 'criar' | 'editar'
  versao: number
} {
  const versoes = historico.map((h) => h.versao ?? 0)
  const max = versoes.length > 0 ? Math.max(...versoes) : 0
  const draft = historico.find((h) => h.estado === 'draft')
  if (draft) return { acao: 'editar', versao: draft.versao ?? max }
  return { acao: 'criar', versao: max + 1 }
}

/** Linha legível do critério (fila/tela) — nunca um default de aprovação. */
export function resumoCriterio(b: CriterioCampos): string {
  const metrica = b.metric ?? 'métrica ?'
  const direcao =
    b.direcao === 'decrease' ? 'queda' : b.direcao === 'increase' ? 'alta' : 'direção ?'
  const limiar =
    b.thresholdPct !== undefined && b.thresholdPct !== null ? `${b.thresholdPct}%` : '?'
  const calendario =
    b.periodKind === 'monthly'
      ? 'mensal'
      : b.periodKind === 'calendar_half'
        ? 'quinzenal (1–15 / 16–fim)'
        : 'calendário ?'
  const base = b.minBase !== undefined && b.minBase !== null ? `base ≥ ${b.minBase}` : 'base ?'
  return `${metrica}: ${direcao} ≥ ${limiar} (${calendario}, ${base})`
}
