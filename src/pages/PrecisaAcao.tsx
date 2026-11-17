import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import pb from '@/lib/pocketbase/client'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'
import { CabecalhoTela } from '@/components/base/visual'

/**
 * Precisa de ação (CA-3-69, RN-134, 05/11).
 *
 * **Por que existe:** quando alguém sai da empresa, os leads dele NÃO vão para
 * o rodízio — decisão de 05/11. Cliente do vendedor X fica com X, e se X saiu,
 * a **gestão decide** para quem passar. Sem esta tela, os leads ficavam
 * travados: ninguém conseguia passá-los para frente.
 *
 * **O que esta tela faz:** mostra a fila agrupada por quem saiu, e permite
 * passar a carteira daquela pessoa para outra num só passo. Cada lead ganha
 * um evento na trilha — o novo dono sabe de onde veio.
 */

interface ItemFila {
  id: string
  lead: string
  nome: string
  telefone: string
  status: string
  dono_anterior: string
  dono_anterior_nome: string
  motivo: string
  criado: string
}

interface Pessoa {
  id: string
  nome: string
  email: string
}

const ROTULO_MOTIVO: Record<string, string> = {
  vendedor_suspenso: 'Vendedor saiu da empresa',
}

export default function PrecisaAcao() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [itens, setItens] = useState<ItemFila[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [de, setDe] = useState<{ id: string; nome: string; quantos: number } | null>(null)
  const [para, setPara] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/gestao/precisa-acao', { method: 'GET' })) as {
        ok: boolean
        total: number
        itens: ItemFila[]
        erro?: string
      }
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar a fila.')
        setItens([])
      } else {
        setItens(r.itens || [])
      }
      // pessoas para escolher o destino
      const e = (await pb.send('/backend/v1/acessos/equipe', { method: 'GET' })) as {
        itens: { id: string; nome: string; email: string; ativa?: boolean }[]
      }
      setPessoas(
        (e.itens || [])
          .filter((p) => p.ativa !== false)
          .map((p) => ({ id: p.id, nome: p.nome || p.email, email: p.email })),
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const passarCarteira = async () => {
    if (!de || para === '') return
    setEnviando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/gestao/passar-carteira', {
        method: 'POST',
        body: JSON.stringify({ de: de.id, para: para }),
        headers: { 'Content-Type': 'application/json' },
      })) as { ok: boolean; leads_movidos: number; eventos: number; para_nome: string }
      setAviso(
        r.leads_movidos +
          ' lead(s) passaram para ' +
          r.para_nome +
          ', com ' +
          r.eventos +
          ' registro(s) na trilha.',
      )
      setDe(null)
      setPara('')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  // agrupa por quem saiu: é assim que a gestão decide
  const porDono: Record<string, { nome: string; itens: ItemFila[] }> = {}
  for (const i of itens) {
    const k = i.dono_anterior || '(sem dono)'
    if (!porDono[k]) porDono[k] = { nome: i.dono_anterior_nome || k, itens: [] }
    porDono[k].itens.push(i)
  }
  const donos = Object.keys(porDono).sort(
    (a, b) => porDono[b].itens.length - porDono[a].itens.length,
  )

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Precisa de ação"
        subtitulo="Clientes esperando uma decisão da gestão — hoje, a carteira de quem saiu da empresa. O cliente não troca de mãos sozinho: você escolhe para quem vai."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-cartao border bg-muted/40 px-4 py-2 text-sm">
          <strong>{itens.length}</strong> cliente(s) esperando decisão
        </div>
        <Button size="sm" variant="ghost" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {aviso && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {aviso}
        </div>
      )}
      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Nada esperando decisão"
          descricao="Quando alguém da equipe for suspenso, os clientes dele aparecem aqui para você escolher o novo responsável."
        />
      )}

      {!carregando &&
        donos.map((k) => {
          const grupo = porDono[k]
          return (
            <div key={k} className="space-y-2 rounded-cartao border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {grupo.nome}
                  <Badge variant="secondary">{grupo.itens.length}</Badge>
                  <span className="text-xs font-normal text-muted-foreground">
                    {ROTULO_MOTIVO[grupo.itens[0].motivo] || grupo.itens[0].motivo}
                  </span>
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setDe({ id: k, nome: grupo.nome, quantos: grupo.itens.length })
                    setPara('')
                    setAviso('')
                  }}
                >
                  Passar carteira
                </Button>
              </div>
              <div className="space-y-1">
                {grupo.itens.slice(0, 8).map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm"
                  >
                    <span className="truncate">{i.nome || '(sem nome)'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{i.telefone}</span>
                  </div>
                ))}
                {grupo.itens.length > 8 && (
                  <p className="text-xs text-muted-foreground">
                    e mais {grupo.itens.length - 8} cliente(s)
                  </p>
                )}
              </div>
            </div>
          )
        })}

      <Dialog open={de !== null} onOpenChange={(o) => !o && setDe(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Passar a carteira de {de?.nome}</DialogTitle>
            <DialogDescription>
              Os {de?.quantos} cliente(s) vão para a pessoa escolhida. Cada um ganha um registro na
              trilha dizendo de onde veio — assim o novo responsável sabe o histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Passar para</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={para}
              onChange={(e) => setPara(e.target.value)}
            >
              <option value="">Escolha a pessoa…</option>
              {pessoas
                .filter((p) => p.id !== de?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.email}
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              A pessoa precisa ter acesso de vendedora para atender os clientes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDe(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void passarCarteira()} disabled={para === '' || enviando}>
              {enviando ? 'Passando…' : 'Passar ' + (de?.quantos || 0) + ' cliente(s)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
