import * as React from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Dica ao passar o mouse (MICRO-3-001 / CA-m1, 06/11).
 *
 * **Por que existe:** o sistema tem botão de ícone ("Descartar", "Devolver à
 * IA", "Atualizar"), número em tabela e abreviação que não se explicam sozinhos.
 * Quem está começando não sabe o que vai acontecer ao clicar.
 *
 * **Regras de uso (para não virar poluição):**
 *   1. Dica **explica**, não repete: se o texto do botão já diz tudo, não use.
 *   2. Botão de ícone **sempre** tem dica — é a única forma de saber o que faz.
 *   3. Número em tabela ganha dica quando o critério não é óbvio.
 *   4. Frase curta, de negócio: "Tira o lead da lista ativa", não "soft delete".
 *   5. Nunca esconder informação essencial só na dica: o celular não tem hover.
 *
 * `Dica` é um invólucro: recebe o que mostrar e a explicação.
 */
export function Dica({
  children,
  texto,
  lado = 'top',
}: {
  children: React.ReactNode
  texto: string
  lado?: 'top' | 'right' | 'bottom' | 'left'
}) {
  if (!texto || texto.trim() === '') return <>{children}</>
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={lado} className="max-w-[240px] text-xs leading-snug">
          {texto}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Dica em um número/rótulo que precisa de explicação.
 * Não envolve botão — é texto com sublinhado pontilhado, para o usuário notar
 * que há explicação ali.
 */
export function DicaNumero({ children, texto }: { children: React.ReactNode; texto: string }) {
  if (!texto || texto.trim() === '') return <>{children}</>
  return (
    <Dica texto={texto}>
      <span className="cursor-help border-b border-dotted border-muted-foreground/50">
        {children}
      </span>
    </Dica>
  )
}
