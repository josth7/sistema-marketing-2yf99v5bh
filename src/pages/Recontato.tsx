import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dica } from '@/components/base/dica'
import pb from '@/lib/pocketbase/client'
import { linkChamarWhatsapp } from '@/lib/marketing/crm'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'
import { CabecalhoTela } from '@/components/base/visual'

/**
 * Clientes para recontatar (CA-3-47, RN-139, 05/11).
 *
 * **Por que existe:** lead que entrou e nunca recebeu um "oi" fica parado para
 * sempre. Em 05/11 uma vendedora disse que perdeu leads desde 02/11 — e não
 * tinha onde ver quem estava esperando.
 *
 * **A regra (não é "o cliente não respondeu"):** é "nunca houve contato nosso
 * pelo WhatsApp do vendedor". Se o cliente já recebeu um oi, sai da lista
 * mesmo que não tenha respondido. A conta é feita no servidor.
 *
 * Cada vendedora vê só os dela. A gestão vê os de todo mundo (mas continua
 * precisando de dono — lead sem dono não é "de ninguém").
 */

interface ClienteRecontato {
  id: string
  nome: string
  telefone: string
  status: string
  origem: string
  data_lead: string
  criado: string
  dias_esperando: number
  vendedor_nome: string
  /** CA-3-109: o cliente não recebeu o aviso automático de apresentação. */
  apresentacao_nao_chegou?: boolean
  marca?: string
}

const ROTULO_STATUS: Record<string, string> = {
  entrada_lead: 'Entrou, sem contato',
  pre_atendimento_ia: 'Falou com o robô',
  mql: 'Respondeu, sem vendedor',
}

export default function Recontato() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [itens, setItens] = useState<ClienteRecontato[]>([])
  const [marcando, setMarcando] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/crm/recontato', { method: 'GET' })) as {
        ok: boolean
        total: number
        itens: ClienteRecontato[]
        erro?: string
      }
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar a lista.')
        setItens([])
      } else {
        setItens(r.itens || [])
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

  const marcarContatado = async (c: ClienteRecontato) => {
    setMarcando(c.id)
    try {
      await pb.send('/backend/v1/crm/recontato/contatado', {
        method: 'POST',
        body: JSON.stringify({ id: c.id }),
        headers: { 'Content-Type': 'application/json' },
      })
      // sai da lista na hora: a vendedora vê o progresso, não espera recarregar
      setItens((lista) => lista.filter((x) => x.id !== c.id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setMarcando('')
    }
  }

  // agrupa por responsável quando é a gestão olhando
  const porDono: Record<string, ClienteRecontato[]> = {}
  for (const i of itens) {
    const k = i.vendedor_nome || '(nao identificado)'
    if (!porDono[k]) porDono[k] = []
    porDono[k].push(i)
  }
  const donos = Object.keys(porDono).sort((a, b) => porDono[b].length - porDono[a].length)

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <CabecalhoTela
        titulo="Falta o primeiro contato"
        subtitulo="Clientes da sua carteira que ainda não receberam nenhuma mensagem sua no WhatsApp. Para cada um: 1) clique em Chamar no WhatsApp e mande o oi; 2) clique em Já chamei. Quem já recebeu o seu oi sai da lista."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-cartao border bg-muted/40 px-4 py-2 text-sm">
          <strong>{itens.length}</strong> cliente(s) esperando o primeiro contato
        </div>
        <Button size="sm" variant="ghost" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Ninguém esperando"
          descricao="Todo lead desde 31/10 já recebeu contato, ou a lista está vazia. Novos leads aparecem aqui sozinhos."
        />
      )}

      {!carregando &&
        donos.map((dono) => (
          <div key={dono} className="space-y-2">
            {donos.length > 1 && (
              <p className="flex items-center gap-2 text-sm font-semibold">
                {dono}
                <Badge variant="secondary">{porDono[dono].length}</Badge>
              </p>
            )}
            {porDono[dono].map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.nome || '(sem nome)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.telefone} · {ROTULO_STATUS[c.status] || c.status}
                    {c.dias_esperando >= 0 && ' · esperando ' + c.dias_esperando + ' dia(s)'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.apresentacao_nao_chegou && (
                    <Dica texto="O aviso automático não chegou ao cliente — ele não sabe que a Haisan vai atender. Chame pessoalmente.">
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        apresentação não chegou
                      </span>
                    </Dica>
                  )}
                  {linkChamarWhatsapp(c.telefone) && (
                    <a
                      href={linkChamarWhatsapp(c.telefone) as string}
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
                    disabled={marcando === c.id}
                    onClick={() => void marcarContatado(c)}
                  >
                    {marcando === c.id ? 'Salvando…' : 'Já chamei'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
