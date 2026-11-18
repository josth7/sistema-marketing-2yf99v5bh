import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
 * Vendas sem valor (04/11).
 *
 * Existe porque a rota de conversão gravava o valor só na fila do Meta/Google
 * e nunca no lead: toda venda registrada pelo sistema nascia com valor zero.
 * A correção já está no ar, mas o passado ficou — 18 vendas importadas da
 * planilha da agência em 28/10, todas em "venda realizada" sem número.
 *
 * Esta tela resolve em lote, que é o único jeito de alguém terminar:
 *   - lista só o que está faltando, agrupado por responsável
 *   - abre uma linha por vez para digitar o valor (Enter grava e vai para a
 *     próxima, sem tirar a mão do teclado)
 *   - mostra o total que falta preencher, para a pessoa sentir o progresso
 *
 * Regra que a tela respeita: valor só entra uma vez. Depois de preenchido, a
 * correção é pela ficha do lead — aqui não sobrescreve número bom.
 */

interface VendaSemValor {
  id: string
  nome: string
  telefone: string
  status: string
  origem: string
  data_lead: string
  importado_em: string
  owner_id: string
  dono: string
}

export default function VendasSemValor() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [itens, setItens] = useState<VendaSemValor[]>([])
  const [aberta, setAberta] = useState<VendaSemValor | null>(null)
  const [valor, setValor] = useState('')
  const [erroValor, setErroValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [preenchidas, setPreenchidas] = useState(0)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/crm/vendas-sem-valor', { method: 'GET' })) as {
        ok: boolean
        total: number
        itens: VendaSemValor[]
        erro?: string
      }
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar.')
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

  const abrir = (v: VendaSemValor) => {
    setAberta(v)
    setValor('')
    setErroValor('')
  }

  const gravar = async () => {
    if (!aberta) return
    // "1.500,50" → 1500.50 ; "1500.50" → 1500.50 (antes virava 150050)
    const bruto = valor.trim().replace(/\s/g, '')
    const v = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto)
    if (!Number.isFinite(v) || v <= 0) {
      setErroValor('Informe o valor da venda (maior que zero).')
      return
    }
    setSalvando(true)
    setErroValor('')
    try {
      await pb.send('/backend/v1/crm/vendas-sem-valor/preencher', {
        method: 'POST',
        body: JSON.stringify({ id: aberta.id, valor: v, confirmar: true }),
        headers: { 'Content-Type': 'application/json' },
      })
      setPreenchidas((n) => n + 1)
      setAberta(null)
      // já abre a próxima: preencher 18 vira um fluxo, não 18 tarefas
      const restantes = itens.filter((i) => i.id !== aberta.id)
      setItens(restantes)
      if (restantes.length > 0) abrir(restantes[0])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErroValor(
        msg.includes('já tem valor') ? 'Esta venda já foi preenchida por outra pessoa.' : msg,
      )
    } finally {
      setSalvando(false)
    }
  }

  // agrupa por responsável: é assim que a cobrança acontece na prática
  const porDono: Record<string, VendaSemValor[]> = {}
  for (const i of itens) {
    const k = i.dono || '(sem dono)'
    if (!porDono[k]) porDono[k] = []
    porDono[k].push(i)
  }
  const donos = Object.keys(porDono).sort((a, b) => porDono[b].length - porDono[a].length)

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8">
      <CabecalhoTela
        titulo="Vendas sem valor"
        subtitulo="Vendas que ficaram sem o valor registrado. Enquanto estiverem assim, o faturamento e a taxa de conversão ficam menores do que a realidade."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-cartao border bg-muted/40 px-4 py-2 text-sm">
          Faltam <strong>{itens.length}</strong> de {itens.length + preenchidas}
          {preenchidas > 0 && (
            <span className="ml-2 text-emerald-700">
              · {preenchidas} preenchida(s) nesta sessão
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma venda sem valor"
          descricao="Tudo preenchido. Toda venda registrada daqui para frente já entra com o valor."
        />
      )}

      {!carregando &&
        donos.map((dono) => (
          <Card key={dono}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {dono}
                <Badge variant="secondary">{porDono[dono].length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {porDono[dono].map((v) => (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.nome || '(sem nome)'}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.telefone} · {v.origem} · lead de {v.data_lead || '?'}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => abrir(v)}>
                    Informar valor
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

      <Dialog open={aberta !== null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Valor da venda — {aberta?.nome}</DialogTitle>
            <DialogDescription>
              {aberta?.telefone} · lead de {aberta?.data_lead || '?'} · responsável {aberta?.dono}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quanto foi vendido</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">R$</span>
              <input
                autoFocus
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void gravar()
                }}
                placeholder="0,00"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O valor entra uma vez só e fica registrado na trilha do lead com o seu nome.
            </p>
            {erroValor && <p className="text-sm text-destructive">{erroValor}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberta(null)}>
              Depois
            </Button>
            <Button onClick={() => void gravar()} disabled={salvando}>
              {salvando ? 'Gravando…' : 'Gravar e ir para a próxima'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
