import type { ReactNode } from 'react'

/**
 * Tabela — SPEC-3-018 / RN-203 item 8.
 *
 * REGRAS DA SPEC:
 *  - sem bordas verticais;
 *  - cabeçalho de 12 px cinza (`--muted-foreground`);
 *  - linhas de 56 px, fundo `--muted` ao passar o mouse;
 *  - no celular, a tabela rola DENTRO do cartão (nunca a página).
 *
 * Nada aqui busca dado nem muda regra: recebe as colunas e as linhas da tela.
 */

export type ColunaTabela<T> = {
  chave: string
  rotulo: string
  /** alinhamento à direita para número */
  direita?: boolean
  /** como mostrar o valor; sem isto usa String(valor) */
  render?: (linha: T) => ReactNode
}

export function Tabela<T extends Record<string, unknown>>({
  colunas,
  linhas,
  chaveLinha,
  vazio = 'Nada para mostrar',
  aoClicarLinha,
}: {
  colunas: ColunaTabela<T>[]
  linhas: T[]
  chaveLinha: (l: T) => string
  vazio?: string
  aoClicarLinha?: (l: T) => void
}) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-cartao bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
        {vazio}
      </div>
    )
  }

  return (
    // o overflow fica no CONTÊINER, então no celular rola dentro do cartão
    <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Tabela">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                className={
                  'whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground ' +
                  (c.direita ? 'text-right' : 'text-left')
                }
              >
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr
              key={chaveLinha(l)}
              onClick={aoClicarLinha ? () => aoClicarLinha(l) : undefined}
              className={
                'h-14 border-b border-border/60 transition-colors last:border-0 hover:bg-muted ' +
                (aoClicarLinha ? 'cursor-pointer' : '')
              }
            >
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={
                    'px-3 align-middle ' + (c.direita ? 'text-right tabular' : 'text-left')
                  }
                >
                  {c.render ? c.render(l) : String(l[c.chave] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
