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
import { CabecalhoTela } from '@/components/base/visual'

/**
 * Conversões — o que foi enviado para a Meta e para o Google (CA-3-65).
 *
 * **Por que esta tela existe:** a venda fecha, a conversão entra na fila e
 * ninguém sabe se chegou. Quando falha, o anúncio segue otimizando com dado
 * errado e o dinheiro continua sendo gasto.
 *
 * **O que ela mostra, por venda:** cliente, valor, estado na Meta e no Google,
 * o **erro em português** quando houver, e o botão **Reenviar**.
 *
 * **A regra do reenvio:** volta a MESMA conversão para a fila, com o MESMO
 * `event_id`. Assim a Meta deduplica — nunca conta a venda duas vezes.
 */

interface Conversao {
  id: string
  cliente: string
  telefone: string
  valor: number
  estado_meta: string
  estado_google: string
  erro: string
  erro_legivel: string
  event_id: string
  tentativas: number
  enviado_em: string
  criado: string
}

const ROTULO: Record<string, string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  erro: 'Erro',
  nao_configurado: 'Não configurado',
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

export default function Conversoes() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [itens, setItens] = useState<Conversao[]>([])
  const [contagem, setContagem] = useState({ pendente: 0, enviado: 0, erro: 0 })

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/crm/conversoes', { method: 'GET' })) as {
        ok: boolean
        itens: Conversao[]
        contagem: { pendente: number; enviado: number; erro: number }
        erro?: string
      }
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar as conversões.')
      } else {
        setItens(r.itens || [])
        setContagem(r.contagem || { pendente: 0, enviado: 0, erro: 0 })
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

  const reenviar = async (c: Conversao) => {
    setAviso('')
    try {
      await pb.send('/backend/v1/crm/conversoes/reenviar', {
        method: 'POST',
        body: JSON.stringify({ id: c.id }),
        headers: { 'Content-Type': 'application/json' },
      })
      setAviso('Voltou para a fila. O envio acontece nos próximos 5 minutos.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoTela
        titulo="Conversões"
        subtitulo="Cada venda que foi (ou tentou ir) para a Meta e para o Google, com o estado e o motivo da falha."
      />

      <div className="flex flex-wrap gap-2">
        <div className="rounded-cartao border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Pendentes: </span>
          <strong>{contagem.pendente}</strong>
        </div>
        <div className="rounded-cartao border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Enviadas: </span>
          <strong className="text-emerald-700">{contagem.enviado}</strong>
        </div>
        <div className="rounded-cartao border px-3 py-2 text-sm">
          <DicaNumero texto="A Meta recusou o evento — o anúncio não recebeu esta venda">
            <span className="text-muted-foreground">Com erro: </span>
          </DicaNumero>
          <strong className={contagem.erro > 0 ? 'text-red-600' : ''}>{contagem.erro}</strong>
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
          titulo="Nenhuma venda registrada ainda"
          descricao="Quando uma venda for registrada no CRM, ela aparece aqui com o estado do envio para a Meta."
        />
      )}

      {!carregando &&
        itens.map((c) => (
          <div key={c.id} className="rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {c.cliente} · <span className="text-emerald-700">{reais(c.valor)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.criado}
                  {c.enviado_em ? ' · enviada em ' + c.enviado_em : ''}
                  {c.tentativas > 0 ? ' · ' + c.tentativas + ' tentativa(s)' : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Dica texto="Estado do envio para a Meta (API de Conversões)">
                  <Badge
                    variant={
                      c.estado_meta === 'enviado'
                        ? 'default'
                        : c.estado_meta === 'erro'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    Meta: {ROTULO[c.estado_meta] || c.estado_meta}
                  </Badge>
                </Dica>
                <Dica texto="Estado do envio para o Google (pelo Maestro)">
                  <Badge variant="outline">
                    Google: {ROTULO[c.estado_google] || c.estado_google || 'não configurado'}
                  </Badge>
                </Dica>
                {c.estado_meta === 'erro' && (
                  <Button size="sm" variant="outline" onClick={() => void reenviar(c)}>
                    Reenviar
                  </Button>
                )}
              </div>
            </div>
            {c.erro_legivel !== '' && c.estado_meta === 'erro' && (
              <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800 dark:bg-red-950/30 dark:text-red-300">
                {c.erro_legivel}
              </p>
            )}
          </div>
        ))}
    </div>
  )
}
