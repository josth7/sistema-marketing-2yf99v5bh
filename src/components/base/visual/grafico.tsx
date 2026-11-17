import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * GraficoBarras — SPEC-3-018 / RN-203 item 5.
 *
 * REGRAS DA SPEC:
 *  - barras cinza (`--chart-2`) com o topo arredondado em 6 px;
 *  - o período ATUAL (ou o último da série) em `--destaque` (verde-sálvia),
 *    identificado TAMBÉM por texto — nunca só pela cor;
 *  - grade tracejada e clara, eixos em 12 px cinza;
 *  - sem legenda quando houver uma série só;
 *  - os valores continuam acessíveis em texto (dica ao passar o mouse ou tocar).
 *
 * Nada aqui busca dado: recebe o que a tela já tem.
 */

export type PontoGrafico = {
  rotulo: string
  valor: number
  /** true no período atual / último da série (barra verde) */
  atual?: boolean
}

const CINZA = 'hsl(var(--chart-2))'
const DESTAQUE = 'hsl(var(--destaque))'

export function GraficoBarras({
  dados,
  altura = 220,
  titulo,
  formatoValor,
  rotuloEixoY,
}: {
  dados: PontoGrafico[]
  altura?: number
  titulo?: string
  formatoValor?: (v: number) => string
  rotuloEixoY?: string
}) {
  const fmt = formatoValor || ((v: number) => v.toLocaleString('pt-BR'))

  if (dados.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-cartao bg-muted text-sm text-muted-foreground"
        style={{ height: altura }}
      >
        Sem dados no período
      </div>
    )
  }

  return (
    <figure className="w-full">
      {titulo && (
        <figcaption className="mb-2 text-xs font-medium text-muted-foreground">{titulo}</figcaption>
      )}
      <div style={{ height: altura }} role="img" aria-label={titulo || 'Gráfico de barras'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            {/* grade tracejada e clara (RN-203 item 5) */}
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmt}
              label={
                rotuloEixoY
                  ? {
                      value: rotuloEixoY,
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
                    }
                  : undefined
              }
            />
            {/* dica: o valor sempre em TEXTO, nunca só a cor */}
            <Tooltip
              formatter={(v: number) => [fmt(v), rotuloEixoY || 'Valor']}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 12,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
              }}
            />
            <Bar dataKey="valor" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {dados.map((d, i) => (
                <Cell key={i} fill={d.atual ? DESTAQUE : CINZA} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
