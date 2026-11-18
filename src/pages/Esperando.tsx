import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import { linkChamarWhatsapp } from '@/lib/marketing/crm'
import { Dica, DicaNumero } from '@/components/base/dica'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/base/estados'
import { CabecalhoTela, PilulasFiltro } from '@/components/base/visual'

/**
 * Conversas esperando resposta (06/11; filtros e aviso aos vendedores 17/11).
 *
 * A última mensagem é do cliente e ninguém respondeu, somando todos os números
 * da Haisan. Quem espera há mais tempo aparece primeiro.
 *
 * 17/11 (call com a Anézia): busca e filtros (vendedor, número, tempo) e o
 * botão "Avisar vendedores": a central manda a cada vendedor os clientes dele
 * que estão esperando, com o contexto e o link. Antes de enviar mostra quantos
 * saem agora e quantos ficam guardados até o "bom dia" do vendedor (janela de
 * 24h da Meta).
 */

interface Item {
  id: string
  nome: string
  telefone: string
  vendedor: string
  numero: string
  horas: number
  previa: string
}

interface Resposta {
  total: number
  escopo?: string
  por_vendedor: Record<string, number>
  por_numero: Record<string, number>
  mais_antiga_horas: number
  faixas: { ate_1h: number; ate_24h: number; ate_7d: number; mais_7d: number }
  itens: Item[]
}

interface ResultadoAviso {
  ok: boolean
  erro?: string
  simulacao: boolean
  total: number
  sem_dono: number
  por_vendedor: Record<
    string,
    { total: number; agora: number; aguardando_bom_dia: number; ja_avisado_hoje: number }
  >
}

function tempo(h: number): string {
  if (h < 0) return '—'
  if (h < 1) return 'agora'
  if (h < 24) return h + 'h'
  return Math.floor(h / 24) + 'd'
}

const semAcento = (t: string) =>
  (t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export default function Esperando() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [filtroVend, setFiltroVend] = useState('todos')
  const [filtroNumero, setFiltroNumero] = useState('todos')
  const [faixa, setFaixa] = useState('todas')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState('')
  const [previaAviso, setPreviaAviso] = useState<ResultadoAviso | null>(null)
  const [avisando, setAvisando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/gestao/esperando', { method: 'GET' })) as {
        ok: boolean
        erro?: string
      } & Resposta
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar.')
        setDados(null)
      } else {
        setDados(r)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const itens = useMemo(() => {
    let out = dados?.itens || []
    if (filtroVend !== 'todos') out = out.filter((i) => i.vendedor === filtroVend)
    if (filtroNumero !== 'todos') out = out.filter((i) => i.numero === filtroNumero)
    if (faixa === 'ate_24h') out = out.filter((i) => i.horas <= 24)
    else if (faixa === 'ate_7d') out = out.filter((i) => i.horas > 24 && i.horas <= 168)
    else if (faixa === 'mais_7d') out = out.filter((i) => i.horas > 168)
    const q = semAcento(busca.trim())
    const qDig = busca.replace(/\D/g, '')
    if (q !== '') {
      out = out.filter(
        (i) =>
          semAcento(i.nome).includes(q) ||
          semAcento(i.previa).includes(q) ||
          (qDig !== '' && (i.telefone || '').replace(/\D/g, '').includes(qDig)),
      )
    }
    return out
  }, [dados, filtroVend, filtroNumero, faixa, busca])

  const vendedores = Object.keys(dados?.por_vendedor || {}).sort(
    (a, b) => (dados?.por_vendedor[b] || 0) - (dados?.por_vendedor[a] || 0),
  )
  const numeros = Object.keys(dados?.por_numero || {}).sort(
    (a, b) => (dados?.por_numero[b] || 0) - (dados?.por_numero[a] || 0),
  )
  const temFiltro =
    filtroVend !== 'todos' || filtroNumero !== 'todos' || faixa !== 'todas' || busca !== ''

  const avisar = async (simular: boolean) => {
    setAvisando(true)
    setMsg('')
    try {
      const r = (await pb.send('/backend/v1/gestao/esperando/avisar', {
        method: 'POST',
        body: { simular },
      })) as ResultadoAviso
      if (!r.ok) {
        setMsg(r.erro || 'Não consegui preparar os avisos.')
        return
      }
      if (simular) {
        setPreviaAviso(r)
      } else {
        setPreviaAviso(null)
        let agora = 0
        let guardados = 0
        for (const k of Object.keys(r.por_vendedor || {})) {
          agora += r.por_vendedor[k].agora
          guardados += r.por_vendedor[k].aguardando_bom_dia
        }
        setMsg(
          'Avisos criados: ' +
            agora +
            ' saem agora' +
            (guardados > 0
              ? ' e ' + guardados + ' saem quando cada vendedor mandar o "bom dia" para a central.'
              : '.'),
        )
      }
    } catch (e) {
      const d = (e as { response?: { erro?: string } })?.response
      setMsg((d && d.erro) || (e instanceof Error ? e.message : String(e)))
    } finally {
      setAvisando(false)
    }
  }

  const cartaoFaixa = (valor: string, rotulo: string, numero: number, cor: string) => (
    <button
      type="button"
      onClick={() => setFaixa(valor)}
      className={
        'rounded-cartao border p-3 text-left transition hover:bg-muted/60 ' +
        (faixa === valor ? 'ring-2 ring-primary' : '')
      }
    >
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={'text-2xl font-semibold ' + cor}>{numero}</p>
    </button>
  )

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <CabecalhoTela
        titulo="Conversas esperando"
        subtitulo="A última mensagem é do cliente e ninguém respondeu. Quem espera há mais tempo aparece primeiro."
      />

      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && dados && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cartaoFaixa('todas', 'Esperando', dados.total, '')}
            {cartaoFaixa(
              'ate_24h',
              'Até 24h',
              dados.faixas.ate_1h + dados.faixas.ate_24h,
              'text-amber-600',
            )}
            {cartaoFaixa('ate_7d', 'De 1 a 7 dias', dados.faixas.ate_7d, 'text-red-600')}
            {cartaoFaixa('mais_7d', 'Mais de 7 dias', dados.faixas.mais_7d, 'text-red-700')}
          </div>

          {dados.escopo === 'gestao' && (
            <div className="rounded-cartao border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Avisar os vendedores no WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    A central manda para cada vendedor os clientes dele que estão esperando, com o
                    que o cliente falou e o link para responder na hora.
                  </p>
                </div>
                {!previaAviso && (
                  <Button size="sm" onClick={() => void avisar(true)} disabled={avisando}>
                    {avisando ? 'Calculando…' : 'Avisar vendedores'}
                  </Button>
                )}
              </div>
              {previaAviso && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm">
                    <strong>{previaAviso.total}</strong> cliente(s) com dono serão avisados
                    {previaAviso.sem_dono > 0
                      ? ' (' + previaAviso.sem_dono + ' sem dono ficam de fora)'
                      : ''}
                    :
                  </p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {Object.keys(previaAviso.por_vendedor).map((v) => {
                      const p = previaAviso.por_vendedor[v]
                      return (
                        <p key={v} className="rounded-md border bg-background px-2 py-1 text-xs">
                          <strong>{v}</strong>: {p.agora} agora
                          {p.aguardando_bom_dia > 0
                            ? ' · ' + p.aguardando_bom_dia + ' após o bom dia'
                            : ''}
                          {p.ja_avisado_hoje > 0
                            ? ' · ' + p.ja_avisado_hoje + ' já avisados hoje'
                            : ''}
                        </p>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    "Após o bom dia": a Meta só deixa a central mandar para quem falou com ela nas
                    últimas 24h. Esses avisos ficam guardados e saem sozinhos quando o vendedor
                    mandar o "bom dia" para o número do Atendimento.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void avisar(false)} disabled={avisando}>
                      {avisando ? 'Enviando…' : 'Confirmar e enviar'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreviaAviso(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {msg && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
              {msg}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2 rounded-cartao bg-muted p-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-xs">Buscar</Label>
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, telefone ou mensagem"
                className="h-9 bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendedor</Label>
              <Select value={filtroVend} onValueChange={setFiltroVend}>
                <SelectTrigger className="h-9 w-[200px] bg-background">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos ({dados.total})</SelectItem>
                  {vendedores.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v} ({dados.por_vendedor[v]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Onde o cliente escreveu</Label>
              <Select value={filtroNumero} onValueChange={setFiltroNumero}>
                <SelectTrigger className="h-9 w-[220px] bg-background">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os números</SelectItem>
                  {numeros.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n} ({dados.por_numero[n]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PilulasFiltro
              rotulo="Tempo"
              valor={faixa}
              aoTrocar={(v) => setFaixa(v)}
              opcoes={[
                { valor: 'todas', rotulo: 'Todos' },
                { valor: 'ate_24h', rotulo: 'Até 24h' },
                { valor: 'ate_7d', rotulo: '1 a 7 dias' },
                { valor: 'mais_7d', rotulo: '+7 dias' },
              ]}
            />
            {temFiltro && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setFiltroVend('todos')
                  setFiltroNumero('todos')
                  setFaixa('todas')
                  setBusca('')
                }}
              >
                Limpar filtros
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-9" onClick={() => void carregar()}>
              Atualizar
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Mostrando {itens.length} de {dados.total}
            </p>
          </div>

          {itens.length === 0 && (
            <EstadoVazio
              titulo={temFiltro ? 'Nenhum cliente com esse filtro' : 'Ninguém esperando'}
              descricao={
                temFiltro
                  ? 'Mude ou limpe os filtros para ver os outros.'
                  : 'Todas as conversas têm resposta nossa como última mensagem.'
              }
            />
          )}

          <div className="space-y-1">
            {itens.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {i.nome || i.telefone}
                    {i.horas >= 168 && (
                      <Badge variant="destructive" className="ml-2 text-[10px]">
                        +7 dias
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <strong className="font-medium">{i.vendedor}</strong> · escreveu em {i.numero}
                    {i.previa ? ' · "' + i.previa + '"' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {linkChamarWhatsapp(i.telefone) && (
                    <a
                      href={linkChamarWhatsapp(i.telefone) as string}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Chamar no WhatsApp
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await pb.send('/backend/v1/gestao/esperando/resolver', {
                          method: 'POST',
                          body: JSON.stringify({ conversa: i.id }),
                          headers: { 'Content-Type': 'application/json' },
                        })
                        await carregar()
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : String(e))
                      }
                    }}
                  >
                    Resolvida
                  </Button>
                  <Dica texto="Há quanto tempo o cliente espera resposta">
                    <Badge
                      variant={
                        i.horas >= 168 ? 'destructive' : i.horas >= 24 ? 'secondary' : 'outline'
                      }
                    >
                      {tempo(i.horas)}
                    </Badge>
                  </Dica>
                </div>
              </div>
            ))}
          </div>
          <DicaNumero texto="Resolvida tira o cliente da lista até ele mandar uma mensagem nova">
            <p className="text-xs text-muted-foreground">O que é "Resolvida"?</p>
          </DicaNumero>
        </>
      )}
    </div>
  )
}
