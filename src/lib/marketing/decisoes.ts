/**
 * Regras de decisão com revisão agendada (SPEC-2-003, card edd618c7).
 * CA-2-08: criação exige título/justificativa/ação não vazios, responsável e
 * review_date >= amanhã (America/Sao_Paulo); edição de pendente pode manter
 * data já vencida, mas não cria novo agendamento passado; fechar exige
 * resultado da revisão; histórico append-only com ator/data/before-after.
 * Sem lembrete/inbox nesta task (CA-2-09 é do card a434ca96).
 */

export const ESTADOS_DECISAO = ['open', 'in_review', 'closed'] as const

export interface DecisaoCampos {
  title?: string | null
  justification?: string | null
  plannedAction?: string | null
  responsibleUser?: string | null
  reviewDate?: string | null
  scope?: string | null
  sourceAlertId?: string | null
}

export type ErrosCampos = Record<string, string>

/** Data local (America/Sao_Paulo) em YYYY-MM-DD a partir de um Date UTC. */
export function dataLocalISO(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d)
}

/** Amanhã local (America/Sao_Paulo) em YYYY-MM-DD. */
export function amanhaLocalISO(agora = new Date()): string {
  return dataLocalISO(new Date(agora.getTime() + 24 * 60 * 60 * 1000))
}

function textoValido(v: unknown, max: number): boolean {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max
}

/** Valida a CRIAÇÃO de uma decisão (CA-2-08) — todos os campos obrigatórios. */
export function validarCriacao(
  b: DecisaoCampos,
  hojeISO: string,
): { valido: boolean; erros: ErrosCampos } {
  const erros: ErrosCampos = {}
  if (!textoValido(b.title, 200)) erros.title = 'título é obrigatório (até 200 caracteres)'
  if (!textoValido(b.justification, 4000))
    erros.justification = 'justificativa é obrigatória (até 4000 caracteres)'
  if (!textoValido(b.plannedAction, 4000))
    erros.plannedAction = 'ação planejada é obrigatória (até 4000 caracteres)'
  if (!textoValido(b.responsibleUser, 30))
    erros.responsibleUser = 'responsável é obrigatório — escolha um usuário ativo'
  if (!textoValido(b.reviewDate, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(b.reviewDate ?? '')) {
    erros.reviewDate = 'data de revisão é obrigatória (formato AAAA-MM-DD)'
  } else if (b.reviewDate! < amanhaLocalISO(new Date(hojeISO + 'T12:00:00Z'))) {
    erros.reviewDate = 'data de revisão deve ser de amanhã em diante (não pode ser passada)'
  }
  if (b.scope !== undefined && b.scope !== null && String(b.scope).length > 60)
    erros.scope = 'escopo tem até 60 caracteres'
  return { valido: Object.keys(erros).length === 0, erros }
}

/**
 * Valida a EDIÇÃO de decisão pendente (não fechada): campos presentes são
 * validados; novo review_date passado é recusado, mas data já vencida gravada
 * pode ser mantida quando o campo não vem no corpo.
 */
export function validarEdicao(
  b: Partial<DecisaoCampos>,
  reviewDateAtual: string | null,
  hojeISO: string,
): { valido: boolean; erros: ErrosCampos } {
  const erros: ErrosCampos = {}
  if (b.title !== undefined && !textoValido(b.title, 200))
    erros.title = 'título inválido (1 a 200 caracteres)'
  if (b.justification !== undefined && !textoValido(b.justification, 4000))
    erros.justification = 'justificativa inválida (1 a 4000 caracteres)'
  if (b.plannedAction !== undefined && !textoValido(b.plannedAction, 4000))
    erros.plannedAction = 'ação planejada inválida (1 a 4000 caracteres)'
  if (b.responsibleUser !== undefined && !textoValido(b.responsibleUser, 30))
    erros.responsibleUser = 'responsável inválido — escolha um usuário ativo'
  if (b.reviewDate !== undefined && b.reviewDate !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.reviewDate)) {
      erros.reviewDate = 'data de revisão inválida (formato AAAA-MM-DD)'
    } else if (b.reviewDate < amanhaLocalISO(new Date(hojeISO + 'T12:00:00Z'))) {
      erros.reviewDate = 'novo agendamento não pode ficar no passado'
    }
  }
  if (b.scope !== undefined && b.scope !== null && String(b.scope).length > 60)
    erros.scope = 'escopo tem até 60 caracteres'
  void reviewDateAtual
  return { valido: Object.keys(erros).length === 0, erros }
}

/** Fechamento exige resultado da revisão não vazio (CA-2-08). */
export function podeFechar(reviewOutcome: unknown): { ok: boolean; motivo: string | null } {
  if (typeof reviewOutcome !== 'string' || reviewOutcome.trim().length === 0) {
    return { ok: false, motivo: 'resultado da revisão é obrigatório para encerrar' }
  }
  return { ok: true, motivo: null }
}

export interface EntradaHistorico {
  at: string
  ator: string
  acao: string
  antes?: Record<string, unknown>
  depois?: Record<string, unknown>
}

/** Histórico append-only: devolve novo array com a entrada (nunca muta o antigo). */
export function novoHistorico(
  atual: EntradaHistorico[] | null,
  entrada: EntradaHistorico,
): EntradaHistorico[] {
  const base = Array.isArray(atual) ? atual.slice() : []
  base.push(entrada)
  return base
}

/** Campos que entram no before/after do histórico (SPEC: campos permitidos). */
export const CAMPOS_HISTORICO = [
  'title',
  'justification',
  'planned_action',
  'responsible_user',
  'review_date',
  'state',
  'review_outcome',
] as const

export function diffCampos(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): Record<string, { antes: unknown; depois: unknown }> {
  const diff: Record<string, { antes: unknown; depois: unknown }> = {}
  for (const campo of CAMPOS_HISTORICO) {
    const a = antes[campo]
    const d = depois[campo]
    if (String(a ?? '') !== String(d ?? '')) diff[campo] = { antes: a ?? null, depois: d ?? null }
  }
  return diff
}

/** Rótulo legível do estado (tela). */
export function rotuloEstado(estado: string | null): string {
  if (estado === 'in_review') return 'Em revisão'
  if (estado === 'closed') return 'Encerrada'
  return 'Aberta'
}
