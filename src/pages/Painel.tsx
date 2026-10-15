import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Filter,
  Plug,
  RefreshCw,
  Users,
} from 'lucide-react'
import { CabecalhoPagina, SeloDemonstracao } from '@/components/base/estados'
import { estadosIniciais, datasetDemonstrativo, datasetReal } from '@/lib/marketing/fontes'
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
  FiltrosPainel,
  Natureza,
  ObjetivoCampanha,
  OrigemDados,
} from '@/lib/marketing/types'

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

function AvisoOrigem({ origem }: { origem: OrigemDados }) {
  if (origem === 'demonstracao') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Dados demonstrativos — não representam resultados reais.</strong> Dataset fictício
          para avaliar organização, filtros e comparativo (RN-05). Nada aqui é gravado como
          resultado real.
        </span>
      </div>
    )
  }
  if (origem === 'csv') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Database className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Importação manual (CSV)</strong> — dados carregados manualmente, com carimbo de
          origem e data/hora.
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>Dados reais via API</strong> — leitura automática das contas conectadas.
      </span>
    </div>
  )
}

function AvisosCanal({ estadosPb }: { estadosPb: Record<string, FonteEstadoRecord> }) {
  const estados = useMemo(() => estadosIniciais(), [])
  return (
    <div className="grid gap-2">
      {TODOS_CANAIS.map((canal) => {
        // Estado real gravado pela ingestão tem prioridade sobre o default local.
        const pb = estadosPb[canal]
        const e = pb
          ? {
              canal,
              natureza: 'pago' as const,
              estado: pb.estado as
                | 'conectado'
                | 'nao_conectado'
                | 'erro_autenticacao'
                | 'sem_dados',
              aviso: pb.aviso,
              ultimaIngestao: pb.ultima_ingestao,
            }
          : estados[canal]
        if (e.estado === 'conectado') {
          const quando = e.ultimaIngestao ? new Date(e.ultimaIngestao).toLocaleString('pt-BR') : ''
          return (
            <div
              key={canal}
              className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {canal === 'google_ads'
                  ? 'Google Ads'
                  : canal === 'meta_ads'
                    ? 'Meta Ads'
                    : 'Meta orgânico'}
                : conectado{quando ? ` · última ingestão ${quando}` : ''}
              </span>
            </div>
          )
        }
        return (
          <div
            key={canal}
            className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
          >
            <Plug className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{e.aviso}</span>
          </div>
        )
      })}
    </div>
  )
}

function Kpi({
  titulo,
  valor,
  variacaoTxt,
  semBase,
}: {
  titulo: string
  valor: string
  variacaoTxt: string
  semBase: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-gray-900">{valor}</div>
        <div className={`mt-1 text-xs ${semBase ? 'text-gray-400' : 'text-gray-600'}`}>
          {variacaoTxt}
        </div>
      </CardContent>
    </Card>
  )
}

/** Tabela compacta por objetivo de um bloco de natureza (CA-2-02). */
function TabelaNatureza({ visao }: { visao: ReturnType<typeof construirVisao> }) {
  if (visao.porObjetivo.length === 0) {
    return <p className="text-sm text-gray-500">Sem registros nesta natureza.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase text-gray-400">
          <th className="py-2 pr-4">Objetivo</th>
          <th className="py-2 pr-4">Gasto</th>
          <th className="py-2 pr-4">Resultados</th>
          <th className="py-2 pr-4">Custo/Resultado</th>
          <th className="py-2 pr-4">Cliques</th>
          <th className="py-2 pr-4">Impressões</th>
          <th className="py-2 pr-4">CTR</th>
        </tr>
      </thead>
      <tbody>
        {visao.porObjetivo.map((linha) => (
          <tr key={linha.objetivo} className="border-b last:border-0">
            <td className="py-2 pr-4 font-medium">
              <Badge variant="outline">{LABEL_OBJETIVO[linha.objetivo]}</Badge>
              {linha.motivoCprIndisponivel && (
                <p className="mt-1 max-w-[200px] text-xs text-gray-400">
                  {linha.motivoCprIndisponivel}
                </p>
              )}
            </td>
            <td className="py-2 pr-4">{formatarMoeda(linha.metricas.gasto)}</td>
            <td className="py-2 pr-4">{formatarInteiro(linha.metricas.resultados)}</td>
            <td className="py-2 pr-4 font-medium">
              {formatarMoeda(linha.metricas.custoPorResultado)}
            </td>
            <td className="py-2 pr-4">{formatarInteiro(linha.metricas.cliques)}</td>
            <td className="py-2 pr-4">{formatarInteiro(linha.metricas.impressoes)}</td>
            <td className="py-2 pr-4">{formatarPercentual(linha.metricas.ctr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function PainelPage() {
  const [usarDemo, setUsarDemo] = useState(true)
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
  const variacaoTxtComMotivo = (txt: string) => (motivoComparativo ? motivoComparativo : txt)

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

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <CabecalhoPagina
        titulo="Painel consolidado"
        descricao="Visão única por período, canal e objetivo — orgânico e pago sempre separados."
        acoes={
          <>
            <Button
              variant={usarDemo ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setUsarDemo(true)}
            >
              <Eye className="mr-1 h-4 w-4" /> Demonstração
            </Button>
            <Button
              variant={!usarDemo ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setUsarDemo(false)}
            >
              <Database className="mr-1 h-4 w-4" /> Dados reais
            </Button>
          </>
        }
      />
      {usarDemo && (
        <div className="flex items-center gap-2">
          <SeloDemonstracao />
          <span className="text-xs text-muted-foreground">
            Dados fictícios para avaliar organização e filtros — não representam resultados reais.
          </span>
        </div>
      )}

      <AvisoOrigem origem={usarDemo ? 'demonstracao' : 'api'} />
      <AvisosCanal estadosPb={estadosFontes} />
      {!usarDemo && escopoAviso && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          {escopoAviso}
        </div>
      )}
      {!usarDemo && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
          <span>
            {carregando
              ? 'Carregando dados reais…'
              : erroReais
                ? `Acesso negado ou falha: ${erroReais}`
                : `${reais.length} registros carregados (escopo do seu acesso aplicado no servidor)`}
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

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </div>
          <Select
            value={periodo ? String(periodos.indexOf(periodo)) : 'none'}
            onValueChange={(v) => setPeriodoIdx(Number(v))}
          >
            <SelectTrigger className="w-[140px]">
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
          <Select
            value={canalSelecionado}
            onValueChange={(v) => setCanalSelecionado(v as Canal | 'todos')}
          >
            <SelectTrigger className="w-[170px]">
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
          <Select value={natureza} onValueChange={(v) => setNatureza(v as Natureza | 'ambos')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Natureza" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">Pago + orgânico</SelectItem>
              <SelectItem value="pago">Só pago</SelectItem>
              <SelectItem value="organico">Só orgânico</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={objetivo}
            onValueChange={(v) => setObjetivo(v as ObjetivoCampanha | 'todos')}
          >
            <SelectTrigger className="w-[160px]">
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
        </CardContent>
      </Card>

      {semDados ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Database className="h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-700">Nenhum dado nesta visão</p>
            <p className="max-w-md text-sm text-gray-500">
              Os dados reais chegam pela ingestão por API (Google Ads e Meta Ads). Enquanto uma
              fonte não está conectada, ela aparece como indisponível — nunca como zero.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs com comparativo (RN-02) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              titulo="Gasto"
              valor={formatarMoeda(visao.total.gasto)}
              variacaoTxt={variacaoTxtComMotivo(formatarVariacao(visao.comparativo.gasto))}
              semBase={visao.comparativo.gasto.semBaseDeComparacao}
            />
            <Kpi
              titulo="Cliques"
              valor={formatarInteiro(visao.total.cliques)}
              variacaoTxt={variacaoTxtComMotivo(formatarVariacao(visao.comparativo.cliques))}
              semBase={visao.comparativo.cliques.semBaseDeComparacao}
            />
            <Kpi
              titulo="Impressões"
              valor={formatarInteiro(visao.total.impressoes)}
              variacaoTxt={variacaoTxtComMotivo(formatarVariacao(visao.comparativo.impressoes))}
              semBase={visao.comparativo.impressoes.semBaseDeComparacao}
            />
            <Kpi
              titulo="Resultados"
              valor={formatarInteiro(visao.total.resultados)}
              variacaoTxt={variacaoTxtComMotivo(formatarVariacao(visao.comparativo.resultados))}
              semBase={visao.comparativo.resultados.semBaseDeComparacao}
            />
          </div>

          {/* Segmentação por objetivo (RN-01) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-gray-400" />
                Por objetivo — custo por resultado nunca é somado entre objetivos distintos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-4">Objetivo</th>
                      <th className="py-2 pr-4">Gasto</th>
                      <th className="py-2 pr-4">Resultados</th>
                      <th className="py-2 pr-4">Custo/resultado</th>
                      <th className="py-2 pr-4">CPC</th>
                      <th className="py-2 pr-4">CPM</th>
                      <th className="py-2 pr-4">Cliques</th>
                      <th className="py-2 pr-4">Impressões</th>
                      <th className="py-2 pr-4">CTR</th>
                      <th className="py-2 pr-4">Alcance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visao.porObjetivo.map((linha) => (
                      <tr key={linha.objetivo} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">
                          <Badge variant="outline">{LABEL_OBJETIVO[linha.objetivo]}</Badge>
                          {linha.motivoCprIndisponivel && (
                            <p className="mt-1 max-w-[220px] text-xs text-gray-400">
                              {linha.motivoCprIndisponivel}
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-4">{formatarMoeda(linha.metricas.gasto)}</td>
                        <td className="py-2 pr-4">{formatarInteiro(linha.metricas.resultados)}</td>
                        <td className="py-2 pr-4 font-medium">
                          {formatarMoeda(linha.metricas.custoPorResultado)}
                        </td>
                        <td className="py-2 pr-4">{formatarMoeda(linha.metricas.cpc)}</td>
                        <td className="py-2 pr-4">{formatarMoeda(linha.metricas.cpm)}</td>
                        <td className="py-2 pr-4">{formatarInteiro(linha.metricas.cliques)}</td>
                        <td className="py-2 pr-4">{formatarInteiro(linha.metricas.impressoes)}</td>
                        <td className="py-2 pr-4">{formatarPercentual(linha.metricas.ctr)}</td>
                        <td className="py-2 pr-4">{formatarInteiro(linha.metricas.alcance)}</td>
                      </tr>
                    ))}
                    {visao.porObjetivo.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-6 text-center text-gray-500">
                          Sem registros para os filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                "—" significa indisponível (a fonte não fornece a métrica) — diferente de zero.
              </p>
              {visao.cobertura.motivo && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {visao.cobertura.motivo}
                </p>
              )}
              {visao.cobertura.atual.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
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
