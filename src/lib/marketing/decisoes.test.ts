/**
 * Provas TDD do cadastro de decisões (SPEC-2-003, card edd618c7 — CA-2-08).
 * Roda localmente com tsx (mesma estratégia dos cards anteriores).
 */
import {
  validarCriacao,
  validarEdicao,
  podeFechar,
  novoHistorico,
  diffCampos,
  dataLocalISO,
  amanhaLocalISO,
  rotuloEstado,
} from './decisoes'

let falhas = 0
function prova(nome: string, cond: boolean) {
  if (cond) {
    console.log(`  OK ${nome}`)
  } else {
    falhas += 1
    console.error(`  FALHOU ${nome}`)
  }
}

const HOJE = '2026-10-09'
const AMANHA = '2026-10-10'
const COMPLETO = {
  title: 'Pausar campanha de YouTube',
  justification: 'CPR acima do aceitável há 2 semanas',
  plannedAction: 'Pausar e revisar criativos',
  responsibleUser: 'anezia',
  reviewDate: AMANHA,
}

// ---------- datas locais ----------
console.log(' datas America/Sao_Paulo:')
prova(
  'dataLocalISO formata UTC → local',
  dataLocalISO(new Date('2026-10-09T02:30:00Z')) === '2026-10-08',
)
prova(
  'amanhaLocalISO parte de hoje local',
  amanhaLocalISO(new Date('2026-10-09T12:00:00Z')) === AMANHA,
)

// ---------- validarCriacao (CA-2-08) ----------
console.log(' validarCriacao — obrigatórios e data futura:')
prova('decisão completa é válida', validarCriacao(COMPLETO, HOJE).valido)
prova(
  'sem review_date é 422 (não persiste)',
  !validarCriacao({ ...COMPLETO, reviewDate: undefined }, HOJE).valido,
)
prova(
  'sem responsável é 422',
  !validarCriacao({ ...COMPLETO, responsibleUser: undefined }, HOJE).valido,
)
prova(
  'data de ontem é 422',
  !validarCriacao({ ...COMPLETO, reviewDate: '2026-10-08' }, HOJE).valido,
)
prova(
  'data de hoje é 422 (mínimo é amanhã)',
  !validarCriacao({ ...COMPLETO, reviewDate: HOJE }, HOJE).valido,
)
prova('título vazio é 422', !validarCriacao({ ...COMPLETO, title: '   ' }, HOJE).valido)
prova('justificativa vazia é 422', !validarCriacao({ ...COMPLETO, justification: '' }, HOJE).valido)
prova(
  'sem ação planejada é 422',
  !validarCriacao({ ...COMPLETO, plannedAction: undefined }, HOJE).valido,
)
prova(
  'formato de data inválido é 422',
  !validarCriacao({ ...COMPLETO, reviewDate: '10/10/2026' }, HOJE).valido,
)
prova(
  'erro nomeia o campo (reviewDate)',
  validarCriacao({ ...COMPLETO, reviewDate: '2026-10-08' }, HOJE).erros.reviewDate !== undefined,
)
prova(
  'erro nomeia o campo (responsibleUser)',
  validarCriacao({ responsibleUser: undefined } as never, HOJE).erros.responsibleUser !== undefined,
)

// ---------- validarEdicao (pendente mantém vencida; novo agendamento não) ----------
console.log(' validarEdicao — pendente:')
prova(
  'editar sem tocar a data mantém data vencida (válido)',
  validarEdicao({ title: 'Novo título' }, '2026-09-01', HOJE).valido,
)
prova(
  'novo review_date no passado é 422',
  !validarEdicao({ reviewDate: '2026-10-01' }, '2026-09-01', HOJE).valido,
)
prova(
  'novo review_date futuro é válido',
  validarEdicao({ reviewDate: '2026-11-01' }, '2026-09-01', HOJE).valido,
)
prova(
  'remover responsável é 422',
  !validarEdicao({ responsibleUser: '' }, '2026-09-01', HOJE).valido,
)

// ---------- podeFechar ----------
console.log(' podeFechar — encerramento:')
prova('fechar sem resultado é 422', !podeFechar(null).ok && !podeFechar('').ok)
prova('fechar com resultado é válido', podeFechar('CPR voltou ao aceitável').ok)

// ---------- histórico append-only + diff ----------
console.log(' histórico append-only:')
const h1: never[] = []
const h2 = novoHistorico(h1, { at: 't1', ator: 'u1', acao: 'criou' })
prova('entrada nova entra no histórico', h2.length === 1)
h2.push({ at: 'x', ator: 'y', acao: 'z' })
prova('array original NÃO é mutado (append-only)', h1.length === 0)
const diff = diffCampos(
  { review_date: '2026-10-10', state: 'open' },
  { review_date: '2026-11-01', state: 'open' },
)
prova('diff pega mudança de review_date', diff.review_date !== undefined)
prova('diff ignora campo igual', diff.state === undefined)

// ---------- rótulos ----------
console.log(' rótulos:')
prova('rotuloEstado open', rotuloEstado('open') === 'Aberta')
prova('rotuloEstado in_review', rotuloEstado('in_review') === 'Em revisão')
prova('rotuloEstado closed', rotuloEstado('closed') === 'Encerrada')

if (falhas > 0) {
  console.error(`\nFALHOU: ${falhas} prova(s) não passaram`)
  process.exit(1)
} else {
  console.log('\nTODAS AS PROVAS PASSARAM')
}
