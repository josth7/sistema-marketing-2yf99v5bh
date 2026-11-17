import type { ReactNode } from 'react'

/**
 * Componentes de composição do Visual 2 — SPEC-3-018 / RN-205.
 *
 * REGRA DA SPEC: este é o ÚNICO lugar das sobrescritas de aparência. As telas
 * usam estes componentes e não escrevem cor nem tamanho solto. Nada aqui lê
 * dado, chama rota ou muda regra: é só a cara nova.
 *
 * Tokens usados (todos de `src/main.css`, RN-200):
 *   --card, --border, --muted, --muted-foreground, --primary (PRETO),
 *   --destaque (verde-sálvia), --accent, --radius
 */

/* ---------------- CARTÃO (RN-203 item 4) ---------------- */
export function Cartao({
  children,
  className = '',
  titulo,
  acao,
}: {
  children: ReactNode
  className?: string
  titulo?: string
  acao?: ReactNode
}) {
  return (
    <section className={'rounded-cartao border border-border bg-card p-4 md:p-6 ' + className}>
      {(titulo || acao) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          {titulo && <h3 className="text-base font-semibold tracking-tight">{titulo}</h3>}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}

/* ---------------- CABEÇALHO DA TELA (RN-203 item 1) ---------------- */
export function CabecalhoTela({
  titulo,
  subtitulo,
  acoes,
}: {
  titulo: string
  subtitulo?: string
  acoes?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 pb-5 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-titulo-celular font-semibold tracking-tight md:text-titulo">
          {titulo}
        </h1>
        {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

/* ---------------- CARTÃO DE DESTAQUE (RN-203 item 3) ---------------- */
export function CartaoDestaque({
  rotulo,
  valor,
  apoio,
  itens = [],
}: {
  rotulo: string
  valor: string
  apoio?: string
  itens?: { rotulo: string; valor: string }[]
}) {
  return (
    <div className="cartao-destaque p-4 md:p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-white/70">{rotulo}</p>
      <p className="numero-destaque mt-1 tabular text-white">{valor}</p>
      {apoio && <p className="mt-1 text-xs text-white/70">{apoio}</p>}

      {itens.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 md:grid-cols-4">
          {itens.slice(0, 4).map((i) => (
            <div key={i.rotulo} className="min-w-0">
              <p className="truncate text-[11px] text-white/70">{i.rotulo}</p>
              <p className="tabular text-lg font-semibold text-white">{i.valor}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- SELO DE ESTADO (RN-203 item 9) ---------------- */
const CORES_SELO: Record<string, string> = {
  ok: 'hsl(var(--destaque-escuro))',
  warn: 'hsl(var(--warn, 38 92% 50%))',
  erro: 'hsl(var(--destructive, 0 84% 60%))',
  neutro: 'hsl(var(--muted-foreground))',
}

export function SeloEstado({
  texto,
  tom = 'neutro',
}: {
  texto: string
  tom?: 'ok' | 'warn' | 'erro' | 'neutro'
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: CORES_SELO[tom] }}
        aria-hidden="true"
      />
      {texto}
    </span>
  )
}

/* ---------------- PILULAS DE FILTRO (RN-203 item 2) ---------------- */
export function PilulasFiltro({
  opcoes,
  valor,
  aoTrocar,
  rotulo,
}: {
  opcoes: { valor: string; rotulo: string }[]
  valor: string
  aoTrocar: (v: string) => void
  rotulo?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={rotulo || 'Filtros'}
      className="inline-flex flex-wrap gap-1 rounded-full bg-muted p-1"
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => aoTrocar(o.valor)}
            className={
              'rounded-full px-3 py-1.5 text-sm transition-colors ' +
              (ativo
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- DISTRIBUIÇÃO (RN-203 item 6) ---------------- */
export function Distribuicao({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  const maior = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{i.rotulo}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: Math.round((i.valor / maior) * 100) + '%' }}
            />
          </span>
          <span className="tabular w-10 shrink-0 text-right text-xs font-medium">{i.valor}</span>
        </li>
      ))}
    </ul>
  )
}
