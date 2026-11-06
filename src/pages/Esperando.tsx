import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { Dica, DicaNumero } from '@/components/base/dica'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Conversas esperando resposta (06/11).
 *
 * **O problema que resolve:** a última mensagem é do cliente e ninguém
 * respondeu. Hoje são 210. Sem esta tela o número só existe na conversa com o
 * assistente — na tela da gestão não há onde ver.
 *
 * **O que ela mostra:** quantas esperam, **de quem são** (por vendedor e por
 * número) e **há quanto tempo**. 165 delas passam de 2 dias; a mais antiga
 * passou de 9 dias.
 *
 * Ordenada da mais antiga para a mais nova: quem esperou mais tempo aparece
 * primeiro, porque é quem está mais perto de desistir.
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
  por_vendedor: Record<string, number>
  por_numero: Record<string, number>
  mais_antiga_horas: number
  faixas: { ate_1h: number; ate_24h: number; ate_7d: number; mais_7d: number }
  itens: Item[]
}

function tempo(h: number): string {
  if (h < 0) return '—'
  if (h < 1) return 'agora'
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  return d + 'd'
}

export default function Esperando() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [filtroVend, setFiltroVend] = useState('todos')

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

  const itens = (dados?.itens || []).filter(
    (i) => filtroVend === 'todos' || i.vendedor === filtroVend,
  )
  const vendedores = Object.keys(dados?.por_vendedor || {}).sort(
    (a, b) => (dados?.por_vendedor[b] || 0) - (dados?.por_vendedor[a] || 0),
  )

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Conversas esperando"
        descricao="A última mensagem é do cliente e ninguém respondeu. Ordenado de quem espera há mais tempo."
      />

      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && dados && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Esperando</p>
              <p className="text-2xl font-semibold">{dados.total}</p>
            </div>
            <div className="rounded-lg border p-3">
              <DicaNumero texto="Cliente escreveu e ainda não passou uma hora">
                <p className="text-xs text-muted-foreground">Até 1h</p>
              </DicaNumero>
              <p className="text-2xl font-semibold">{dados.faixas.ate_1h}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Até 24h</p>
              <p className="text-2xl font-semibold text-amber-600">{dados.faixas.ate_24h}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Até 7 dias</p>
              <p className="text-2xl font-semibold text-red-600">{dados.faixas.ate_7d}</p>
            </div>
            <div className="rounded-lg border p-3">
              <DicaNumero texto="Passou de uma semana — o cliente provavelmente já buscou outra empresa">
                <p className="text-xs text-muted-foreground">Mais de 7 dias</p>
              </DicaNumero>
              <p className="text-2xl font-semibold text-red-700">{dados.faixas.mais_7d}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtrar por vendedor:</span>
            <Button
              size="sm"
              variant={filtroVend === 'todos' ? 'default' : 'outline'}
              onClick={() => setFiltroVend('todos')}
            >
              Todos ({dados.total})
            </Button>
            {vendedores.map((v) => (
              <Button
                key={v}
                size="sm"
                variant={filtroVend === v ? 'default' : 'outline'}
                onClick={() => setFiltroVend(v)}
              >
                {v} ({dados.por_vendedor[v]})
              </Button>
            ))}
          </div>

          <Button size="sm" variant="ghost" onClick={() => void carregar()}>
            Atualizar
          </Button>

          {itens.length === 0 && (
            <EstadoVazio
              titulo="Ninguém esperando"
              descricao="Todas as conversas têm resposta nossa como última mensagem."
            />
          )}

          <div className="space-y-1">
            {itens.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {i.nome || i.telefone}
                    {i.horas >= 168 && (
                      <Badge variant="destructive" className="ml-2 text-[10px]">
                        +7 dias
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.vendedor} · {i.numero}
                    {i.previa ? ' · ' + i.previa : ''}
                  </p>
                </div>
                <div className="shrink-0">
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
        </>
      )}
    </div>
  )
}
