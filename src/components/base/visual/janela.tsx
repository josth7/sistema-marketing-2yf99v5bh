import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Janela — SPEC-3-018 / RN-203 item 12.
 *
 * REGRAS DA SPEC:
 *  - cantos `rounded-janela` (24 px);
 *  - sombra `shadow-janela` (só janelas e menus suspensos têm sombra);
 *  - título de 18 px (`text-janela`);
 *  - ações no rodapé em pílulas, com a principal PRETA à direita.
 *
 * É um wrapper de composição: quem já usa `Dialog` do shadcn continua usando —
 * este componente só padroniza o miolo, para as telas não repetirem classe.
 */

export function Janela({
  titulo,
  children,
  acoes,
  aoFechar,
  largura = 'max-w-lg',
}: {
  titulo: string
  children: ReactNode
  acoes?: ReactNode
  aoFechar?: () => void
  largura?: string
}) {
  return (
    <div className={'w-full ' + largura}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-janela font-semibold tracking-tight">{titulo}</h2>
        {aoFechar && (
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-4">{children}</div>

      {acoes && <div className="mt-6 flex flex-wrap justify-end gap-2">{acoes}</div>}
    </div>
  )
}
