/**
 * Painel consolidado (SPEC-2-001 + SPEC-2-007, CA-2-17).
 *
 * Reorganização SÓ DE INTERFACE: mesmos números e regras da SPEC-2-001 para os
 * mesmos filtros (objetivos separados RN-01, pago×orgânico RN-03, comparação
 * suprimida com motivo CA-2-03, — ≠ zero RN-06, demo isolada RN-05).
 * - Dados reais é o modo inicial; Demonstração vira seletor discreto + faixa âmbar.
 * - Fontes numa faixa única de chips com estado e "atualizado às".
 * - Filtros rotulados + Limpar filtros (1 linha ≥1024px, empilhados no celular).
 * - Cartões com seta, cor pelo sentido da métrica e "vs. <anterior>" (ou motivo).
 * - Gráfico de evolução diária (recharts, já no projeto) com lacuna em dia sem dado.
 * - Percentuais pt-BR (vírgula) — formatarPercentual/formatarVariacao (types.ts).
 * - Tabela: números à direita (tabular-nums), primeira coluna fixa, rolagem só
 *   dentro da tabela, explicação de CPR/CTR no título da coluna.
 */
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
} from 'recharts'
import { estadosIniciais, datasetDemonstrativo } from '@/lib/marketing/fontes'
import { construirVisao, periodosDisponiveis } from '@/lib/marketing/agregacao'
import {
  carregarEstadoFontes,
  carregarMetricasReais,
  paraRegistroMetricas,
} from '@/lib/marketing/ingestao'
import { carregarMetricasComEscopo } from '@/lib/marketing/acessos'
import type { FonteEstadoRecord } from '@/lib/marketing/ingestao'
import {
  formatarInteiro,
  formatarMoeda,
  formatarPercentual,
  formatarVariacao,
} from '@/lib/marketing/types'
import type {
  Canal,
  ComparativoPeriodo,
  FiltrosPainel,
  Natureza,
  ObjetivoCampanha,
  RegistroMetricas,
} from '@/lib/marketing/types'
import {
  CabecalhoPagina,
  SeloDemonstracao,
  EstadoVazio,
  EstadoErro,
} from '@/components/base/estados'

const LABEL_CANAL: Record<Canal, string> = {
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
  meta_organico: 'Meta orgânico',
}

const LABEL_OBJETIVO: Record<ObjetivoCampanha, string> = {
  alcance: 'Alcance',
  trafico: 'Tráfego',
  engajamento: 'Engajamento',
  leads: 'Leads',
  vendas: 'Vendas',
  video: 'Vídeo',
  nao_informado: 'Não informado',
}

const TODOS_CANAIS: Canal[] = ['google_ads', 'meta_ads', 'meta_organico']
const TODOS_OBJETIVOS = Object.keys(LABEL_OBJETIVO) as ObjetivoCampanha[]

/** Cor fixa por fonte (SPEC-2-007 decisão 3) — sempre as mesmas. */
const COR_FONTE: Record<Canal, string> = {
  meta_ads: 'hsl(var(--chart-1))',
  google_ads: 'hsl(var(--chart-4))',
  meta_organico: 'hsl(var(--chart-3))',
}

type Sentido = 'sobe_bom' | 'sobe_ruim' | 'neutro'

/** Faixa única de chips por fonte — estado por cor E texto (nunca só cor). */
function FaixaFontes({ estadosPb }: { estadosPb: Record<string, FonteEstadoRecord> }) {
  const estados = useMemo(() => estadosIniciais(), [])
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {TODOS_CANAIS.map((canal) => {
          const pb = estadosPb[canal]
          const e = pb
            ? {
                estado: pb.estado as
                  | 'conectado'
                  | 'nao_conectado'
                  | 'erro_autenticacao'
                  | 'sem_dados',
                aviso: pb.aviso,
                ultimaIngestao: pb.ultima_ingestao,
              }
            : {
                estado: estados[canal].estado,
                aviso: estados[canal].aviso,
                ultimaIngestao: estados[canal].ultimaIngestao,
              }
          const quando = e.ultimaIngestao
            ? new Date(e.ultimaIngestao).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : null
          const conectado = e.estado === 'conectado'
          const erro = e.estado === 'erro_autenticacao'
          return (
            <span
              key={canal}
              title={e.aviso ?? LABEL_CANAL[canal]}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ' +
                (conectado
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : erro
                    ? 'border-destructive/30 bg-destructive/5 text-destructive'
                    : 'border-border bg-muted text-muted-foreground')
              }
            >
              {conectado ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              ) : erro ? (
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Database className="h-3 w-3" aria-hidden="true" />
              )}
              {LABEL_CANAL[canal]}
              <span className="font-normal opacity-80">
                {conectado
                  ? quando
                    ? `· atualizado às ${quando}`
                    : '· conectado'
                  : erro
                    ? '· erro de acesso'
                    : '· sem conexão'}
              </span>
            </span>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Meta orgânico: sem conexão própria — a visão fica vazia até haver dados (não inferimos a
        partir de anúncios).
      </p>
    </div>
  )
}

/** Cartão de indicador: seta + cor pelo sentido + "vs. <anterior>" ou o motivo. */
function Kpi(props: {
  titulo: string
  valor: string
  variacao: ComparativoPeriodo | null
  sentido: Sentido
  referencia: string
  motivo?: string | null
}) {
  const v = props.variacao
  const suprimido = props.motivo || (v?.semBaseDeComparacao ?? false)
  const pct = v && !v.semBaseDeComparacao ? v.variacaoPercentual : null
  const sobe = pct !== null && pct >= 0
  const Icone = pct === null ? Minus : sobe ? TrendingUp : TrendingDown
  // Cor pelo SENTIDO da métrica (SPEC-2-007): sobe é bom (verde) ou ruim (vermelho);
  // neutro (Gasto) fica cinza. Texto e seta sempre junto — nunca só cor.
  const corClasse =
    pct === null || props.sentido === 'neutro'
      ? 'text-muted-foreground'
      : (sobe && props.sentido === 'sobe_bom') || (!sobe && props.sentido === 'sobe_ruim')
        ? 'text-[hsl(var(--ok))]'
        : 'text-destructive'
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums text-foreground">{props.valor}</div>
        <div className={`mt-1 flex items-center gap-1 text-xs ${corClasse}`}>
          <Icone className="h-3.5 w-3.5" aria-hidden="true" />
          {suprimido ? (
            <span className="text-muted-foreground">
              {props.motivo ?? 'Sem base de comparação'}
            </span>
          ) : (
            <span>
              {formatarVariacao(v!)}{' '}
              <span className="text-muted-foreground">vs. {props.referencia}</span>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Série diária do período filtrado — dia sem dado = lacuna (null), nunca zero. */
function serieDiaria(dataset: RegistroMetricas[], inicio: string, fim: string) {
  const dias: string[] = []
  const d = new Date(inicio + 'T00:00:00Z')
  const fimT = new Date(fim + 'T00:00:00Z')
  while (d <= fimT) {
    dias.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  const porDia = new Map<
    string,
    { gasto: Record<Natureza, number | null>; resultados: Record<Natureza, number | null> }
  >()
  for (const dia of dias) {
    porDia.set(dia, {
      gasto: { pago: null, organico: null },
      resultados: { pago: null, organico: null },
    })
  }
  for (const r of dataset) {
    // registros do dataset cobrem o período inteiro do registro; para a série,
    // distribui o valor do registro nos dias que ele cobre (soma direta de gasto;
    // resultados só quando objetivo+tipo compatíveis — regra da agregação já aplicada)
    const ini = r.periodoInicio < inicio ? inicio : r.periodoInicio
    const fimR = r.periodoFim > fim ? fim : r.periodoFim
    if (ini > fimR) continue
    const d0 = new Date(ini + 'T00:00:00Z')
    const d1 = new Date(fimR + 'T00:00:00Z')
    const diasDoRegistro: string[] = []
    const cur = new Date(d0)
    while (cur <= d1) {
      diasDoRegistro.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    if (diasDoRegistro.length === 0) continue
    for (const dia of diasDoRegistro) {
      const cel = porDia.get(dia)
      if (!cel) continue
      if (r.metricas.gasto !== null) {
        const parte = r.metricas.gasto / diasDoRegistro.length
        cel.gasto[r.natureza] = (cel.gasto[r.natureza] ?? 0) + parte
      }
      if (r.metricas.resultados !== null) {
        const parte = r.metricas.resultados / diasDoRegistro.length
        cel.resultados[r.natureza] = (cel.resultados[r.natureza] ?? 0) + parte
      }
    }
  }
  return dias.map((dia) => {
    const cel = porDia.get(dia)!
    return {
      dia: dia.slice(8, 10) + '/' + dia.slice(5, 7),
      gastoPago: cel.gasto.pago,
      gastoOrganico: cel.gasto.organico,
      resultadosPago: cel.resultados.pago,
      resultadosOrganico: cel.resultados.organico,
    }
  })
}

/** Gráfico de evolução diária — lacuna em dia sem dado (connectNulls=false). */
function GraficoEvolucao(props: { dataset: RegistroMetricas[]; inicio: string; fim: string }) {
  const serie = useMemo(
    () => serieDiaria(props.dataset, props.inicio, props.fim),
    [props.dataset, props.inicio, props.fim],
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evolução diária do período</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          Gasto (R$) e resultados por dia — pago e orgânico em séries separadas. Dia sem dado
          aparece como lacuna (não é zero).
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={54} />
              <ChartTooltip
                formatter={(valor: number | string) =>
                  valor === null || valor === undefined ? '—' : String(valor)
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="gastoPago"
                name="Gasto pago (R$)"
                stroke={COR_FONTE.meta_ads}
                connectNulls={false}
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="gastoOrganico"
                name="Gasto orgânico (R$)"
                stroke={COR_FONTE.meta_organico}
                connectNulls={false}
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="resultadosPago"
                name="Resultados pago"
                stroke={COR_FONTE.google_ads}
                connectNulls={false}
                dot={false}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="resultadosOrganico"
                name="Resultados orgânico"
                stroke="hsl(var(--chart-2))"
                connectNulls={false}
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

/** Tabela por objetivo — números à direita (tabular-nums), 1ª coluna fixa. */
function TabelaNatureza({ visao }: { visao: ReturnType<typeof construirVisao> }) {
  if (visao.porObjetivo.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem registros nesta natureza.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="sticky left-0 bg-card py-2 pr-4">Objetivo</th>
            <th className="py-2 pr-4 text-right">Gasto</th>
            <th className="py-2 pr-4 text-right">Resultados</th>
            <th
              className="py-2 pr-4 text-right"
              title="Custo por resultado: gasto ÷ resultados, calculado só dentro do mesmo objetivo (objetivos distintos nunca são somados)"
            >
              Custo/Resultado ⓘ
            </th>
            <th className="py-2 pr-4 text-right">Cliques</th>
            <th className="py-2 pr-4 text-right">Impressões</th>
            <th className="py-2 pr-4 text-right" title="CTR: cliques ÷ impressões × 100">
              CTR ⓘ
            </th>
          </tr>
        </thead>
        <tbody>
          {visao.porObjetivo.map((linha) => (
            <tr key={linha.objetivo} className="border-b last:border-0">
              <td className="sticky left-0 bg-card py-2 pr-4 font-medium">
                <Badge variant="outline">{LABEL_OBJETIVO[linha.objetivo]}</Badge>
                {linha.motivoCprIndisponivel && (
                  <p className="mt-1 max-w-[200px] text-xs text-muted-foreground">
                    {linha.motivoCprIndisponivel}
                  </p>
                )}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatarMoeda(linha.metricas.gasto)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatarInteiro(linha.metricas.resultados)}
              </td>
              <td className="py-2 pr-4 text-right font-medium tabular-nums">
                {formatarMoeda(linha.metricas.custoPorResultado)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatarInteiro(linha.metricas.cliques)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatarInteiro(linha.metricas.impressoes)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatarPercentual(linha.metricas.ctr)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PainelPage() {
  // CA-2-17: Dados reais é o modo inicial; Demonstração vira seletor discreto.
  const [usarDemo, setUsarDemo] = useState(false)
  const [canalSelecionado, setCanalSelecionado] = useState<Canal | 'todos'>('todos')
  const [natureza, setNatureza] = useState<Natureza | 'ambos'>('ambos')
  const [objetivo, setObjetivo] = useState<ObjetivoCampanha | 'todos'>('todos')
  const [periodoIdx, setPeriodoIdx] = useState(0)
  const [reais, setReais] = useState<ReturnType<typeof datasetReal>>([])
  const [estadosFontes, setEstadosFontes] = useState<Record<string, FonteEstadoRecord>>({})
  const [carregando, setCarregando] = useState(false)
  const [erroReais, setErroReais] = useState<string | null>(null)
  // CA-2-13 (5b1de184): leitura real passa pela rota /backend/v1/metricas —
  // escopo do ator aplicado NO SERVIDOR (read_metrics); sem grant → 403 explicado.
  const [escopoAviso, setEscopoAviso] = useState<string | null>(null)

  const pbUrl = import.meta.env.VITE_POCKETBASE_URL ?? ''

  // Carrega o dataset real (metricas_diarias) e o estado das fontes — task ea514702.
  async function carregarReais() {
    setCarregando(true)
    setErroReais(null)
    setEscopoAviso(null)
    const res = await carregarMetricasComEscopo()
    if (res.ok) {
      setReais(res.itens.map(paraRegistroMetricas))
      setEscopoAviso(
        res.escopo.contas[0] === '*'
          ? null
          : `Escopo aplicado: contas ${res.escopo.contas.join(', ')} · canais ${res.escopo.canais.join(', ')}`,
      )
    } else {
      setReais([])
      setErroReais(res.erro)
    }
    setEstadosFontes(await carregarEstadoFontes(pbUrl))
    setCarregando(false)
  }

  useEffect(() => {
    if (!usarDemo) void carregarReais()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarDemo])

  const dataset = usarDemo ? datasetDemonstrativo() : reais
  const periodos = useMemo(() => periodosDisponiveis(dataset), [dataset])
  const periodo = periodos[Math.min(periodoIdx, Math.max(0, periodos.length - 1))]

  const filtros: FiltrosPainel = {
    periodoInicio: periodo?.inicio ?? null,
    periodoFim: periodo?.fim ?? null,
    canais: canalSelecionado === 'todos' ? [] : [canalSelecionado],
    objetivos: objetivo === 'todos' ? [] : [objetivo],
    natureza,
  }

  const visao = useMemo(() => construirVisao(dataset, filtros), [dataset, filtros])

  // CA-2-03: motivo da supressão do comparativo exibido nos KPIs
  const motivoComparativo = visao.cobertura.valida ? null : visao.cobertura.motivo

  // CA-2-02: pago e orgânico em blocos separados — quando "Pago + orgânico"
  // está selecionado, cada bloco agrega só a sua natureza (fórmulas nunca cruzam).
  const visaoPago = useMemo(
    () => construirVisao(dataset, { ...filtros, natureza: 'pago' }),
    [dataset, filtros],
  )
  const visaoOrganico = useMemo(
    () => construirVisao(dataset, { ...filtros, natureza: 'organico' }),
    [dataset, filtros],
  )
  const mostrarBlocosSeparados = natureza === 'ambos'

  const semDados =
    visao.total.gasto === null && visao.total.impressoes === null && visao.total.alcance === null

  // CPR na linha principal só quando um único objetivo está selecionado (RN-01).
  const objetivoUnico = objetivo !== 'todos'
  const cprUnico = objetivoUnico
    ? visao.porObjetivo.length === 1
      ? visao.porObjetivo[0].metricas.custoPorResultado
      : null
    : null

  // "Atualizado às": última ingestão válida entre as fontes conectadas.
  const atualizadoAs = useMemo(() => {
    let maisRecente: string | null = null
    for (const canal of TODOS_CANAIS) {
      const pb = estadosFontes[canal]
      const quando = pb?.ultima_ingestao ?? null
      if (quando && (!maisRecente || quando > maisRecente)) maisRecente = quando
    }
    if (!maisRecente) return null
    return new Date(maisRecente).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }, [estadosFontes])

  const referencia = periodo ? 'período anterior' : 'período anterior'

  const limparFiltros = () => {
    setCanalSelecionado('todos')
    setNatureza('ambos')
    setObjetivo('todos')
    setPeriodoIdx(0)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <CabecalhoPagina
        titulo="Painel consolidado"
        descricao="Visão única por período, canal e objetivo — orgânico e pago sempre separados."
        acoes={
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5">
            <Button
              variant={!usarDemo ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setUsarDemo(false)}
            >
              <Database className="mr-1 h-4 w-4" /> Dados reais
            </Button>
            <Button
              variant={usarDemo ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setUsarDemo(true)}
            >
              <Eye className="mr-1 h-4 w-4" /> Demonstração
            </Button>
          </div>
        }
      />

      {usarDemo && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2">
          <SeloDemonstracao />
          <span className="text-sm text-amber-900">
            Dados fictícios para avaliar organização e filtros — não representam resultados reais.
            Nada aqui é gravado como resultado real.
          </span>
        </div>
      )}

      <FaixaFontes estadosPb={estadosFontes} />

      {!usarDemo && escopoAviso && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          {escopoAviso}
        </div>
      )}
      {!usarDemo && erroReais && (
        <EstadoErro mensagem={erroReais} aoTentar={() => void carregarReais()} />
      )}
      {!usarDemo && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
          <span>
            {carregando
              ? 'Carregando dados reais…'
              : atualizadoAs
                ? `Atualizado às ${atualizadoAs}`
                : 'Ainda sem atualização registrada'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregarReais()}
            disabled={carregando}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            Recarregar
          </Button>
        </div>
      )}

      {/* Filtros rotulados — 1 linha ≥1024px, 2 colunas no tablet, empilhados no celular */}
      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="f-periodo">Período</Label>
            <Select
              value={periodo ? String(periodos.indexOf(periodo)) : 'none'}
              onValueChange={(v) => setPeriodoIdx(Number(v))}
            >
              <SelectTrigger id="f-periodo" className="w-full">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {periodos.length === 0 && (
                  <SelectItem value="none" disabled>
                    Sem período
                  </SelectItem>
                )}
                {periodos.map((p, i) => (
                  <SelectItem key={p.inicio} value={String(i)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-canal">Canal</Label>
            <Select
              value={canalSelecionado}
              onValueChange={(v) => setCanalSelecionado(v as Canal | 'todos')}
            >
              <SelectTrigger id="f-canal" className="w-full">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os canais</SelectItem>
                {TODOS_CANAIS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {LABEL_CANAL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-natureza">Natureza</Label>
            <Select value={natureza} onValueChange={(v) => setNatureza(v as Natureza | 'ambos')}>
              <SelectTrigger id="f-natureza" className="w-full">
                <SelectValue placeholder="Natureza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">Pago + orgânico</SelectItem>
                <SelectItem value="pago">Só pago</SelectItem>
                <SelectItem value="organico">Só orgânico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-objetivo">Objetivo</Label>
            <Select
              value={objetivo}
              onValueChange={(v) => setObjetivo(v as ObjetivoCampanha | 'todos')}
            >
              <SelectTrigger id="f-objetivo" className="w-full">
                <SelectValue placeholder="Objetivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os objetivos</SelectItem>
                {TODOS_OBJETIVOS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {LABEL_OBJETIVO[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 lg:justify-end">
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {semDados ? (
        <Card>
          <CardContent>
            <EstadoVazio
              titulo="Nenhum dado nesta visão"
              descricao="Os dados reais chegam pela ingestão por API (Google Ads e Meta Ads). Enquanto uma fonte não está conectada, ela aparece como indisponível — nunca como zero."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Linha principal de cartões — seta, cor pelo sentido, "vs. anterior" ou motivo.
              CPR entra na linha principal quando um único objetivo está selecionado (RN-01). */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {objetivoUnico && (
              <Kpi
                titulo="Custo por resultado"
                valor={formatarMoeda(cprUnico)}
                variacao={null}
                sentido="sobe_ruim"
                referencia={referencia}
                motivo={
                  cprUnico === null
                    ? 'Indisponível para este objetivo'
                    : 'Calculado do objetivo selecionado'
                }
              />
            )}
            <Kpi
              titulo="Gasto"
              valor={formatarMoeda(visao.total.gasto)}
              variacao={visao.comparativo.gasto}
              sentido="neutro"
              referencia={referencia}
              motivo={motivoComparativo}
            />
            <Kpi
              titulo="Resultados"
              valor={formatarInteiro(visao.total.resultados)}
              variacao={visao.comparativo.resultados}
              sentido="sobe_bom"
              referencia={referencia}
              motivo={motivoComparativo}
            />
            <Kpi
              titulo="Cliques"
              valor={formatarInteiro(visao.total.cliques)}
              variacao={visao.comparativo.cliques}
              sentido="sobe_bom"
              referencia={referencia}
              motivo={motivoComparativo}
            />
          </div>

          {/* Linha secundária — só as métricas que a tela já recebe */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi
              titulo="Impressões"
              valor={formatarInteiro(visao.total.impressoes)}
              variacao={visao.comparativo.impressoes}
              sentido="sobe_bom"
              referencia={referencia}
              motivo={motivoComparativo}
            />
            <Kpi
              titulo="Alcance"
              valor={formatarInteiro(visao.total.alcance)}
              variacao={null}
              sentido="sobe_bom"
              referencia={referencia}
              motivo="Sem comparação de alcance entre períodos"
            />
            <Kpi
              titulo="CPC"
              valor={formatarMoeda(
                visao.total.cliques !== null &&
                  visao.total.gasto !== null &&
                  visao.total.cliques > 0
                  ? visao.total.gasto / visao.total.cliques
                  : null,
              )}
              variacao={null}
              sentido="sobe_ruim"
              referencia={referencia}
              motivo="Calculado do total do período"
            />
            <Kpi
              titulo="CPM"
              valor={formatarMoeda(
                visao.total.impressoes !== null &&
                  visao.total.gasto !== null &&
                  visao.total.impressoes > 0
                  ? (visao.total.gasto / visao.total.impressoes) * 1000
                  : null,
              )}
              variacao={null}
              sentido="sobe_ruim"
              referencia={referencia}
              motivo="Calculado do total do período"
            />
            <Kpi
              titulo="CTR"
              valor={formatarPercentual(
                visao.total.impressoes !== null &&
                  visao.total.cliques !== null &&
                  visao.total.impressoes > 0
                  ? (visao.total.cliques / visao.total.impressoes) * 100
                  : null,
              )}
              variacao={null}
              sentido="sobe_bom"
              referencia={referencia}
              motivo="Calculado do total do período"
            />
          </div>

          {/* Gráfico de evolução diária (só com período definido) */}
          {periodo && (
            <GraficoEvolucao dataset={dataset} inicio={periodo.inicio} fim={periodo.fim} />
          )}

          {/* Segmentação por objetivo (RN-01) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Por objetivo — custo por resultado nunca é somado entre objetivos distintos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky left-0 bg-card py-2 pr-4">Objetivo</th>
                      <th className="py-2 pr-4 text-right">Gasto</th>
                      <th className="py-2 pr-4 text-right">Resultados</th>
                      <th
                        className="py-2 pr-4 text-right"
                        title="Custo por resultado: gasto ÷ resultados, calculado só dentro do mesmo objetivo"
                      >
                        Custo/resultado ⓘ
                      </th>
                      <th className="py-2 pr-4 text-right">CPC</th>
                      <th className="py-2 pr-4 text-right">CPM</th>
                      <th className="py-2 pr-4 text-right">Cliques</th>
                      <th className="py-2 pr-4 text-right">Impressões</th>
                      <th className="py-2 pr-4 text-right" title="CTR: cliques ÷ impressões × 100">
                        CTR ⓘ
                      </th>
                      <th className="py-2 pr-4 text-right">Alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.porObjetivo.map((linha) => (
                      <tr key={linha.objetivo} className="border-b last:border-0">
                        <td className="sticky left-0 bg-card py-2 pr-4 font-medium">
                          <Badge variant="outline">{LABEL_OBJETIVO[linha.objetivo]}</Badge>
                          {linha.motivoCprIndisponivel && (
                            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                              {linha.motivoCprIndisponivel}
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarMoeda(linha.metricas.gasto)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarInteiro(linha.metricas.resultados)}
                        </td>
                        <td className="py-2 pr-4 text-right font-medium tabular-nums">
                          {formatarMoeda(linha.metricas.custoPorResultado)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarMoeda(linha.metricas.cpc)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarMoeda(linha.metricas.cpm)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarInteiro(linha.metricas.cliques)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarInteiro(linha.metricas.impressoes)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarPercentual(linha.metricas.ctr)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatarInteiro(linha.metricas.alcance)}
                        </td>
                      </tr>
                    ))}
                    {visao.porObjetivo.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-6 text-center text-muted-foreground">
                          Sem registros para os filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                "—" significa indisponível (a fonte não fornece a métrica) — diferente de zero.
              </p>
              {visao.cobertura.motivo && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {visao.cobertura.motivo}
                </p>
              )}
              {visao.cobertura.atual.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cobertura:{' '}
                  {visao.cobertura.atual
                    .map(
                      (c) =>
                        `${c.canal === 'meta_ads' ? 'Meta' : c.canal === 'google_ads' ? 'Google' : c.canal} ${c.dias} dia(s) (${c.inicio.slice(5)}–${c.fim.slice(5)})`,
                    )
                    .join(' · ')}
                </p>
              )}
            </CardContent>
          </Card>

          {mostrarBlocosSeparados && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pago (mídia)</CardTitle>
                </CardHeader>
                <CardContent>
                  <TabelaNatureza visao={visaoPago} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Orgânico</CardTitle>
                </CardHeader>
                <CardContent>
                  <TabelaNatureza visao={visaoOrganico} />
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
