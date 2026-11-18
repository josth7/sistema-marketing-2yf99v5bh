/**
 * Componentes base da interface (SPEC-2-007, CA-2-16).
 *
 * Única origem de aparência: toda cor vem dos tokens do tema (src/main.css —
 * shadcn: bg-primary, text-muted-foreground, border-border…; marca: --marca-1/2;
 * semânticos: --ok/--warn). Nenhuma regra, dado, rota ou permissão muda aqui.
 * Estados padronizados: a adoção completa em todas as telas é o card CA-2-18 —
 * aqui os componentes EXISTEM e já são usados onde a tela é tocada neste card.
 */
import type { ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

/** Cabeçalho de página: título + uma linha de descrição + ações à direita. */
export function CabecalhoPagina(props: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{props.titulo}</h1>
        {props.descricao && (
          <p className="max-w-2xl text-sm text-muted-foreground">{props.descricao}</p>
        )}
      </div>
      {props.acoes && <div className="flex flex-wrap items-center gap-2">{props.acoes}</div>}
    </div>
  )
}

/** Selo DEMONSTRAÇÃO — visível em toda tela enquanto o modo estiver ativo. */
export function SeloDemonstracao() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900"
      role="status"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      DEMONSTRAÇÃO
    </span>
  )
}

/** Estado: carregando — esqueleto, nunca tela vazia sem explicação. */
export function EstadoCarregando(props: { texto?: string; linhas?: number }) {
  const linhas = props.linhas ?? 3
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <span className="sr-only">{props.texto ?? 'Carregando…'}</span>
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  )
}

/** Estado: vazio — o que significa e o próximo passo, em linguagem simples. */
export function EstadoVazio(props: { titulo: string; descricao?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Inbox className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="font-medium text-foreground">{props.titulo}</p>
      {props.descricao && (
        <p className="max-w-md text-sm text-muted-foreground">{props.descricao}</p>
      )}
    </div>
  )
}

/** Estado: erro — mensagem simples + "Tentar de novo", sem detalhe técnico. */
export function EstadoErro(props: {
  mensagem: string
  aoTentar?: () => void
  onTentarNovamente?: () => void
}) {
  const tentar = props.aoTentar || props.onTentarNovamente
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">Algo deu errado</p>
        <p>{props.mensagem}</p>
        {tentar && (
          <Button variant="link" size="sm" className="h-auto p-0 underline" onClick={tentar}>
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  )
}

/** Indisponível: "—" com legenda (diferente de zero). */
export function ValorIndisponivel(props: { legenda?: string }) {
  return (
    <span className="text-muted-foreground" title={props.legenda ?? 'Indisponível'}>
      —{props.legenda && <span className="sr-only"> ({props.legenda})</span>}
    </span>
  )
}
