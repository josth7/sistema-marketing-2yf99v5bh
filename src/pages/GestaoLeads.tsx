import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import { Dica, DicaNumero } from '@/components/base/dica'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Gestão de leads — números do dia e carga por vendedor (CA-3-51, CA-3-71).
 *
 * **O que a gestão responde aqui:** "como está o dia?" sem abrir planilha.
 *
 *   - quantos leads entraram, quantos têm dono, quantos estão sem dono;
 *   - quantos têm dono e **nunca receberam mensagem** da vendedora;
 *   - quantas conversas estão esperando resposta;
 *   - a carga de cada vendedor, com vendas e valor.
 *
 * **O número que mais importa é "sem contato da vendedora".** Lead com dono e
 * sem contato parece resolvido no CRM, mas o cliente nunca foi falado — é o
 * retrato de carteira parada.
 *
 * Só a gestão entra (a rota devolve 404 para vendedor).
 */

interface Resumo {
  numeros: {
    recebidos: number
    distribuidos: number
    sem_dono: number
    sem_contato_vendedora: number
    conversas_sem_resposta: number
    recusados: number
    duplicados: number
  }
  por_vendedor: {
    vendedor: string
    total: number
    abertos: number
    vendas: number
    valor: number
    descartados: number
  }[]
  total_vendedores: number
}

function reais(v: number): string {
  const s = (v || 0).toFixed(2)
  const p = s.split('.')
  let inteiro = p[0]
  let saida = ''
  let c = 0
  for (let i = inteiro.length - 1; i >= 0; i--) {
    saida = inteiro.charAt(i) + saida
    c++
    if (c % 3 === 0 && i > 0) saida = '.' + saida
  }
  return 'R$ ' + saida + ',' + p[1]
}

export default function GestaoLeads() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<Resumo | null>(null)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const qs = new URLSearchParams()
      if (de !== '') qs.set('de', de)
      if (ate !== '') qs.set('ate', ate)
      const q = qs.toString()
      const r = (await pb.send('/backend/v1/gestao/resumo' + (q ? '?' + q : ''), {
        method: 'GET',
      })) as { ok: boolean; erro?: string } & Resumo
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar os números.')
        setDados(null)
      } else {
        setDados(r)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [de, ate])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const n = dados?.numeros

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Gestão de leads"
        descricao="Quantos leads entraram, quantos estão sem dono, quantos ninguém falou ainda e como está a carteira de cada vendedora."
      />

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9" />
        </div>
        <Button size="sm" variant="outline" onClick={() => void carregar()}>
          Atualizar
        </Button>
        {(de !== '' || ate !== '') && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDe('')
              setAte('')
            }}
          >
            Limpar período
          </Button>
        )}
      </div>

      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && n && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Recebidos</p>
              <p className="text-2xl font-semibold">{n.recebidos}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Com dono</p>
              <p className="text-2xl font-semibold">{n.distribuidos}</p>
            </div>
            <div className="rounded-lg border p-3">
              <DicaNumero texto="Leads que ninguém pegou ainda — não aparecem para vendedor">
                <p className="text-xs text-muted-foreground">Sem dono</p>
              </DicaNumero>
              <p className={'text-2xl font-semibold ' + (n.sem_dono > 0 ? 'text-amber-600' : '')}>
                {n.sem_dono}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <DicaNumero texto="Tem dono, mas a vendedora nunca mandou mensagem — o cliente não sabe que existe">
                <p className="text-xs text-muted-foreground">Sem contato da vendedora</p>
              </DicaNumero>
              <p
                className={
                  'text-2xl font-semibold ' + (n.sem_contato_vendedora > 0 ? 'text-red-600' : '')
                }
              >
                {n.sem_contato_vendedora}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <DicaNumero texto="A última mensagem da conversa é do cliente e ninguém respondeu">
                <p className="text-xs text-muted-foreground">Conversas sem resposta</p>
              </DicaNumero>
              <p
                className={
                  'text-2xl font-semibold ' + (n.conversas_sem_resposta > 0 ? 'text-red-600' : '')
                }
              >
                {n.conversas_sem_resposta}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Recusados</p>
              <p className="text-2xl font-semibold">{n.recusados}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Duplicados</p>
              <p className="text-2xl font-semibold">{n.duplicados}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Carga por vendedor</p>
            {dados.por_vendedor.length === 0 && (
              <EstadoVazio
                titulo="Nenhum vendedor com carteira"
                descricao="Quando houver leads distribuídos, a carga aparece aqui."
              />
            )}
            {dados.por_vendedor.map((v) => (
              <div key={v.vendedor} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{v.vendedor}</p>
                  <p className="text-xs text-muted-foreground">
                    carteira <strong>{v.total}</strong>
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>em aberto: {v.abertos}</span>
                  <span className={v.vendas > 0 ? 'text-emerald-700' : ''}>
                    vendas: <strong>{v.vendas}</strong>
                  </span>
                  {v.valor > 0 && <span className="text-emerald-700">{reais(v.valor)}</span>}
                  {v.descartados > 0 && <span>descartados: {v.descartados}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
