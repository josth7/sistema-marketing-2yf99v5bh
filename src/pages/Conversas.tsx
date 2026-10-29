import { useCallback, useEffect, useMemo, useState } from 'react'
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
import pb from '@/lib/pocketbase/client'
import { useRealtime } from '@/hooks/use-realtime'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Tela Conversas — WhatsApp em tempo real (SPEC-3-005, CA-3-24).
 *
 * Lista as conversas por número, com contato, prévia da última mensagem, hora
 * e quem mandou. Sem caixa de resposta (só leitura).
 *
 * Acesso por número (RN-87) é decidido NO SERVIDOR: a rota devolve só o que o
 * usuário pode ler. O vendedor vê o número dele e não tem como escolher outro;
 * a gestão vê todos e filtra.
 *
 * Tempo real (RN-89): assina `whatsapp_sinais`, que é a única coleção com
 * regra de leitura (`leitores`). O evento não traz conteúdo — só avisa que
 * mudou, e a tela então chama as rotas. Se a regra não fosse respeitada, a
 * alternativa registrada é consultar a cada 30 s; como o sinal respeita
 * `leitores`, a assinatura é segura.
 */

type Conversa = {
  id: string
  conexao: string
  numero_nome: string
  contato_nome: string
  contato_telefone: string
  lead: string
  ultima_previa: string
  ultima_mensagem_em: string
  ultimo_autor: string
  total_mensagens: number
  estado: string
  canal: string
}

type Mensagem = {
  id: string
  autor: string
  direcao: string
  tipo: string
  texto: string
  media_url: string
  media_mimetype: string
  media_duracao_s: number
  status: string
  enviada_em: string
  editada_em: string
  apagada: boolean
}

const ROTULO_AUTOR: Record<string, string> = {
  cliente: 'Cliente',
  ia: 'IA',
  vendedor: 'Vendedor',
  equipe_central: 'Equipe da central',
  sistema: 'Sistema',
  api_externa: 'API externa',
}

/** Hora curta em America/Sao_Paulo (UTC-3 fixo: o runtime não tem Intl). */
function horaCurta(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  const hh = String(brt.getUTCHours()).padStart(2, '0')
  const mm = String(brt.getUTCMinutes()).padStart(2, '0')
  return hh + ':' + mm
}

export default function Conversas() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroNumero, setFiltroNumero] = useState('todos')
  const [aberta, setAberta] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregandoMsg, setCarregandoMsg] = useState(false)
  const [erroMsg, setErroMsg] = useState('')

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com o seu usuário para ver as conversas.')
      return
    }
    try {
      const r = (await pb.send('/backend/v1/whatsapp/conversas', { method: 'GET' })) as {
        itens: Conversa[]
      }
      setConversas(r.itens || [])
      setErro(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErro(msg)
    } finally {
      setCarregando(false)
    }
  }, [])

  const carregarMensagens = useCallback(async (leadId: string) => {
    // Reaproveita a rota da ficha do lead: ela já aplica RN-71 (leitores).
    setCarregandoMsg(true)
    setErroMsg('')
    try {
      const r = (await pb.send('/backend/v1/whatsapp/leads/' + leadId + '/conversa', {
        method: 'GET',
      })) as { itens: Mensagem[] }
      setMensagens(r.itens || [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMensagens([])
      setErroMsg(msg.indexOf('permissão') >= 0 ? 'Você não tem acesso a esta conversa.' : msg)
    } finally {
      setCarregandoMsg(false)
    }
  }, [])

  // Sempre carrega: `carregar` já trata o caso de não estar logado e mostra
  // aviso. Antes o efeito só rodava com sessão válida, então a tela ficava
  // presa em "Carregando…" para quem não estava autenticado.
  useEffect(() => {
    void carregar()
  }, [carregar])

  // Tempo real (RN-89): o evento não traz conteúdo, só avisa que mudou.
  useRealtime('whatsapp_sinais', () => {
    void carregar()
    if (aberta) {
      const conv = conversas.find((c) => c.id === aberta)
      if (conv?.lead) void carregarMensagens(conv.lead)
    }
  })

  /** Números que aparecem no filtro (o servidor já limitou ao que posso ver). */
  const numeros = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of conversas) {
      if (c.conexao && !mapa.has(c.conexao)) {
        mapa.set(c.conexao, c.numero_nome || 'Número')
      }
    }
    return Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome }))
  }, [conversas])

  /** O vendedor de um só número não escolhe outro: o filtro fica fixo. */
  const soUmNumero = numeros.length === 1

  const filtradas = useMemo(() => {
    if (filtroNumero === 'todos') return conversas
    return conversas.filter((c) => c.conexao === filtroNumero)
  }, [conversas, filtroNumero])

  const abrir = (c: Conversa) => {
    setAberta(c.id)
    setMensagens([])
    if (c.lead) void carregarMensagens(c.lead)
    else setErroMsg('Esta conversa ainda não está ligada a um lead.')
  }

  const convAberta = conversas.find((c) => c.id === aberta) || null

  if (carregando) return <EstadoCarregando />
  if (erro) return <EstadoErro mensagem={erro} />

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Conversas"
        descricao="WhatsApp dos números da Haisan — atualiza sozinho quando chega mensagem. Só leitura."
      />

      <div className="flex flex-wrap items-center gap-3">
        {soUmNumero ? (
          <Badge variant="outline">{numeros[0]?.nome}</Badge>
        ) : (
          <div className="w-60">
            <Select value={filtroNumero} onValueChange={setFiltroNumero}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os números</SelectItem>
                {numeros.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <span className="text-xs text-muted-foreground">{filtradas.length} conversa(s)</span>
        <Button size="sm" variant="outline" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {filtradas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma conversa ainda"
          descricao="As conversas aparecem aqui quando chega a primeira mensagem no número."
        />
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conversas</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-1 overflow-y-auto pt-0">
            {filtradas.map((c) => (
              <button
                key={c.id}
                onClick={() => abrir(c)}
                className={
                  'w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 ' +
                  (aberta === c.id ? 'border-primary bg-primary/5' : 'border-border')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {c.contato_nome || c.contato_telefone}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {horaCurta(c.ultima_mensagem_em)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {c.ultima_previa || '(sem prévia)'}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {ROTULO_AUTOR[c.ultimo_autor] || c.ultimo_autor || ''}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{c.numero_nome}</span>
                  {c.estado && c.estado !== 'triagem' && (
                    <Badge variant="outline" className="px-1 py-0 text-[10px]">
                      {c.estado}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {convAberta ? convAberta.contato_nome || convAberta.contato_telefone : 'Conversa'}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto pt-0">
            {!convAberta && (
              <p className="text-xs text-muted-foreground">
                Escolha uma conversa à esquerda para ler as mensagens.
              </p>
            )}
            {convAberta && carregandoMsg && (
              <p className="text-xs text-muted-foreground">Carregando mensagens…</p>
            )}
            {convAberta && !carregandoMsg && erroMsg && (
              <p className="text-xs text-muted-foreground">{erroMsg}</p>
            )}
            {convAberta && !carregandoMsg && !erroMsg && mensagens.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
            )}
            {convAberta &&
              !carregandoMsg &&
              mensagens.map((m) => (
                <div
                  key={m.id}
                  className={
                    'rounded-md px-3 py-2 text-sm ' +
                    (m.direcao === 'entrada'
                      ? 'bg-muted/60'
                      : 'ml-6 bg-emerald-50 dark:bg-emerald-950/30')
                  }
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">{ROTULO_AUTOR[m.autor] || m.autor}</span>
                    <span>{horaCurta(m.enviada_em)}</span>
                    {m.status && <span>· {m.status}</span>}
                    {m.editada_em ? <span>· editada</span> : null}
                  </div>
                  {m.apagada ? (
                    <p className="italic text-muted-foreground">Mensagem apagada por quem enviou</p>
                  ) : (
                    <>
                      {/* texto como TEXTO: nunca HTML */}
                      {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                      {m.media_url && (
                        <a
                          href={m.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs underline"
                        >
                          {m.tipo === 'audio'
                            ? // A D-API nem sempre manda `duration`: mostrar "0:00"
                              // seria mentir sobre o áudio. Sem duração, só "Áudio".
                              Number(m.media_duracao_s || 0) > 0
                              ? 'Áudio ' +
                                Math.floor(Number(m.media_duracao_s) / 60) +
                                ':' +
                                String(Math.floor(Number(m.media_duracao_s) % 60)).padStart(2, '0')
                              : 'Abrir áudio'
                            : m.tipo === 'image'
                              ? 'Imagem'
                              : m.tipo === 'video'
                                ? 'Vídeo'
                                : 'Documento'}
                        </a>
                      )}
                      {!m.texto && !m.media_url && (
                        <p className="text-xs text-muted-foreground">({m.tipo})</p>
                      )}
                    </>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
