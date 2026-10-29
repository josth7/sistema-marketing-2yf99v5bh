import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Tela Números — WhatsApp (SPEC-3-005, CA-3-11 e CA-3-17).
 *
 * Mostra, por número: se está "recebendo" ou há quanto tempo não recebe, o
 * último status da conexão, o `session_id` mascarado, o nome do segredo da
 * chave e se ele está configurado (nunca o valor).
 *
 * Só a gestão entra: a rota devolve 403 para quem não tem `manage_whatsapp`.
 * O botão "Conferir chave" não existe mais aqui: ele exigia chamar a D-API, e
 * a instrução 4 da SPEC proíbe o sistema de mexer na configuração das conexões.
 * O que dá para conferir sem tocar na D-API é o que a tela mostra.
 */

type Conexao = {
  id: string
  papel: string
  numero: string
  nome_exibicao: string
  vendedor_user: string
  vendedor_nome: string
  vendedor_nome_publico: string
  session_id_mascarado: string
  tem_session: boolean
  ativo: boolean
  nome_segredo_chave: string
  segredo_configurado: boolean
  ultimo_evento_em: string
  ultimo_status_conexao: string
  ultimo_status_em: string
  recusas_token: number
}

/** Minutos desde uma data (UTC no banco). */
function minutosDesde(iso: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const ms = Date.now() - d.getTime()
  if (ms < 0) return 0
  return Math.floor(ms / 60000)
}

/** "recebendo · última mensagem às HH:MM" ou "sem mensagens há N min". */
function estadoRecebimento(iso: string): { texto: string; ok: boolean } {
  const min = minutosDesde(iso)
  if (min === null) return { texto: 'sem mensagens recebidas', ok: false }
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  if (min <= 15) return { texto: 'recebendo · última mensagem às ' + hh + ':' + mm, ok: true }
  if (min < 60) return { texto: 'sem mensagens há ' + min + ' min', ok: false }
  const horas = Math.floor(min / 60)
  if (horas < 24) return { texto: 'sem mensagens há ' + horas + ' h', ok: false }
  return { texto: 'sem mensagens há ' + Math.floor(horas / 24) + ' dias', ok: false }
}

/** Telefone mascarado: nunca mostrar o número inteiro na tela. */
function mascararNumero(tel: string): string {
  const t = String(tel || '')
  if (t.length < 8) return t
  return t.slice(0, 4) + '*' + t.slice(-4)
}

export default function Numeros() {
  const [itens, setItens] = useState<Conexao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = (await pb.send('/backend/v1/whatsapp/conexoes', { method: 'GET' })) as {
        itens: Conexao[]
      }
      setItens(r.itens || [])
      setErro(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErro(
        msg.indexOf('403') >= 0 || msg.indexOf('permiss') >= 0
          ? 'Você não tem permissão para ver os números (manage_whatsapp).'
          : msg,
      )
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // quando chega mensagem, o "recebendo" muda sozinho
  useRealtime('whatsapp_sinais', () => {
    void carregar()
  })

  if (carregando) return <EstadoCarregando />
  if (erro) return <EstadoErro mensagem={erro} />

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Números do WhatsApp"
        descricao="Números conectados pela D-API. Nenhum valor de segredo aparece aqui."
        acoes={
          <Button size="sm" variant="outline" onClick={() => void carregar()}>
            Atualizar
          </Button>
        }
      />

      {itens.length === 0 && (
        <EstadoVazio
          titulo="Nenhum número cadastrado"
          descricao="A central e os vendedores aparecem aqui depois de cadastrados."
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {itens.map((c) => {
          const rec = estadoRecebimento(c.ultimo_evento_em)
          return (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{c.nome_exibicao || 'Sem nome'}</CardTitle>
                  <Badge variant={c.papel === 'central' ? 'default' : 'outline'}>
                    {c.papel === 'central' ? 'central' : 'vendedor'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Número</span>
                  <span className="font-mono">{mascararNumero(c.numero)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recebimento</span>
                  <span
                    className={
                      rec.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                    }
                  >
                    {rec.texto}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Último status</span>
                  <span>{c.ultimo_status_conexao || '—'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sessão (D-API)</span>
                  <span className="font-mono text-xs">
                    {c.session_id_mascarado || 'não informada'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Segredo da chave</span>
                  <span className="text-xs">
                    <span className="font-mono">{c.nome_segredo_chave || '—'}</span>{' '}
                    {c.segredo_configurado ? (
                      <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                        configurado
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="ml-1 px-1 py-0 text-[10px]">
                        ausente
                      </Badge>
                    )}
                  </span>
                </div>

                {c.vendedor_nome && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Vendedor</span>
                    <span>{c.vendedor_nome}</span>
                  </div>
                )}

                {!c.ativo && (
                  <p className="text-xs text-destructive">Conexão desativada — o webhook ignora.</p>
                )}
                {c.recusas_token > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {c.recusas_token} tentativa(s) recusada(s) por token inválido.
                  </p>
                )}
                {!c.tem_session && (
                  <p className="text-xs text-amber-700 dark:text-amber-500">
                    Falta o session_id — a D-API precisa estar conectada para este número receber.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
