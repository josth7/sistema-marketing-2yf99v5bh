import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { linkChamarWhatsapp } from '@/lib/marketing/crm'
import { Dica, DicaNumero } from '@/components/base/dica'
import { useRealtime } from '@/hooks/use-realtime'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Tela Conversas — WhatsApp com resposta e recado interno (SPEC-3-005).
 *
 * O que a tela faz:
 *   - lista as conversas com avatar, prévia, hora e por quem foi a última
 *   - abre a conversa em bolhas (cliente à esquerda, nosso à direita)
 *   - RESPONDE pelo sistema: texto, foto, vídeo, documento e áudio gravado
 *   - RECADO INTERNO: fica preso na conversa e só o vendedor daquele
 *     atendimento (e a gestão) lê. Nunca vai para o WhatsApp do cliente.
 *
 * Quem vê o quê é decidido NO SERVIDOR (RN-87): o vendedor só recebe a conversa
 * do número dele; a gestão recebe todas. Se o servidor negar, a tela mostra
 * "sem acesso" e não inventa conteúdo.
 *
 * Tempo real (RN-89): assina `whatsapp_sinais`; o evento não traz conteúdo,
 * só avisa que mudou, e aí a tela re-busca pelas rotas.
 */

/**
 * Envio pelo sistema BLOQUEADO (30/10/2026).
 *
 * A Meta está recusando todo envio pela Cloud API com erro 130497
 * ("Business account is restricted from messaging users in this country").
 * O POST devolve 200 + wamid e a falha vem depois no webhook — ou seja, a
 * mensagem morria em silêncio e o vendedor achava que tinha respondido.
 *
 * Enquanto a restrição existir, responda pelo celular: a coexistência
 * entrega e a mensagem aparece aqui do mesmo jeito.
 *
 * Para religar: trocar para `false` quando a Meta liberar.
 */
const ENVIO_BLOQUEADO = true

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
  interna?: boolean
  /** CA-3-70: última mensagem é do cliente — esperando gente */
  nao_lida?: boolean
  /** minutos de espera quando não lida (-1 quando não se aplica) */
  espera_min?: number
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

type Observacao = {
  id: string
  texto: string
  autor_nome: string
  autor_user: string
  created: string
}

const ROTULO_AUTOR: Record<string, string> = {
  cliente: 'Cliente',
  ia: 'IA',
  vendedor: 'Vendedor',
  equipe_central: 'Central',
  sistema: 'Sistema',
  api_externa: 'API externa',
}

/** Cor do avatar estável por nome: a mesma pessoa tem sempre a mesma. */
const CORES = [
  'bg-emerald-600',
  'bg-teal-600',
  'bg-sky-600',
  'bg-indigo-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-cyan-700',
]

function corDoNome(nome: string): string {
  let soma = 0
  for (let i = 0; i < nome.length; i++) soma += nome.charCodeAt(i)
  return CORES[soma % CORES.length]
}

function iniciais(nome: string, telefone: string): string {
  const base = (nome || '').trim()
  if (base === '') return (telefone || '').replace(/\D/g, '').slice(-2) || '?'
  const partes = base.split(/\s+/).filter(Boolean)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** Telefone legível: +55 (41) 9501-7280 */
function telefoneBonito(tel: string): string {
  const d = (tel || '').replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return '+55 (' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9)
  }
  if (d.length === 12 && d.startsWith('55')) {
    return '+55 (' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8)
  }
  return tel || ''
}

/** Hora em America/Sao_Paulo (UTC-3 fixo: o runtime não tem Intl). */
function horaCurta(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  return (
    String(brt.getUTCHours()).padStart(2, '0') + ':' + String(brt.getUTCMinutes()).padStart(2, '0')
  )
}

/** "Hoje", "Ontem" ou a data — separa os blocos da conversa. */
function rotuloDia(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000)
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const dia = brt.toISOString().slice(0, 10)
  if (dia === agora.toISOString().slice(0, 10)) return 'Hoje'
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (dia === ontem) return 'Ontem'
  return brt.getUTCDate() + '/' + (brt.getUTCMonth() + 1) + '/' + brt.getUTCFullYear()
}

function duracao(s: number): string {
  const n = Number(s || 0)
  if (n <= 0) return ''
  return Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0')
}

/** CA-3-70: minutos de espera em texto curto (cabe na linha da lista). */
function tempoEspera(min: number): string {
  if (min < 1) return 'agora'
  if (min < 60) return min + ' min'
  const h = Math.floor(min / 60)
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  return d + 'd'
}

export default function Conversas() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroNumero, setFiltroNumero] = useState('todos')
  const [soNaoLidas, setSoNaoLidas] = useState(false)
  // CA-3-25: separa conversa com CLIENTE da conversa da EQUIPE (número interno).
  // A equipe usa o WhatsApp entre si; isso não é atendimento e não pode
  // aparecer na mesma fila do cliente (nem acionar o robô).
  const [aba, setAba] = useState<'clientes' | 'equipe'>('clientes')
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [carregandoMsg, setCarregandoMsg] = useState(false)
  const [erroMsg, setErroMsg] = useState('')

  const [rascunho, setRascunho] = useState('')
  const [sugestao, setSugestao] = useState('')
  const [sugerindo, setSugerindo] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [avisoEnvio, setAvisoEnvio] = useState('')
  const [gravando, setGravando] = useState(false)
  const [segundosGrav, setSegundosGrav] = useState(0)
  const grabRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [observacoes, setObservacoes] = useState<Observacao[]>([])
  const [nota, setNota] = useState('')
  const [salvandoNota, setSalvandoNota] = useState(false)
  const [possoEscrever, setPossoEscrever] = useState(false)

  // ---------- botão do robô (04/11; NÃO remover — SPEC do atendimento) ----------
  // Liga e desliga o atendimento automático da central com um clique. Só
  // quem tem manage_atendimento vê o botão; os outros veem só a situação.
  const [robo, setRobo] = useState<{ ligado: boolean; pode: boolean; dentro: boolean } | null>(null)
  const [mudandoRobo, setMudandoRobo] = useState(false)
  const carregarRobo = useCallback(async () => {
    try {
      const r = (await pb.send('/backend/v1/atendimento/config', { method: 'GET' })) as {
        ligado: boolean
        pode_alterar: boolean
        dentro_do_horario: boolean
      }
      setRobo({ ligado: r.ligado, pode: r.pode_alterar, dentro: r.dentro_do_horario })
    } catch {
      setRobo(null)
    }
  }, [])
  useEffect(() => {
    void carregarRobo()
    const t = setInterval(() => void carregarRobo(), 60000)
    return () => clearInterval(t)
  }, [carregarRobo])
  const alternarRobo = async () => {
    if (!robo) return
    setMudandoRobo(true)
    try {
      await pb.send('/backend/v1/atendimento/ligar', {
        method: 'POST',
        body: JSON.stringify({ ligado: !robo.ligado, origem: 'conversas' }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // a situação real vem do servidor logo abaixo
    }
    await carregarRobo()
    setMudandoRobo(false)
  }

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
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  const carregarMensagens = useCallback(async (conversaId: string) => {
    setCarregandoMsg(true)
    setErroMsg('')
    try {
      const r = (await pb.send('/backend/v1/whatsapp/conversas/' + conversaId + '/mensagens', {
        method: 'GET',
      })) as { itens: Mensagem[] }
      setMensagens(r.itens || [])
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setMensagens([])
      setErroMsg(m.indexOf('permissão') >= 0 ? 'Você não tem acesso a esta conversa.' : m)
    } finally {
      setCarregandoMsg(false)
    }
  }, [])

  const carregarObservacoes = useCallback(async (conversaId: string) => {
    try {
      const r = (await pb.send('/backend/v1/whatsapp/conversas/' + conversaId + '/observacoes', {
        method: 'GET',
      })) as { itens: Observacao[]; posso_escrever: boolean }
      setObservacoes(r.itens || [])
      setPossoEscrever(Boolean(r.posso_escrever))
    } catch (_) {
      setObservacoes([])
      setPossoEscrever(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useRealtime('whatsapp_sinais', () => {
    void carregar()
    if (aberta) void carregarMensagens(aberta)
  })

  const numeros = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of conversas) {
      if (c.conexao && !mapa.has(c.conexao)) mapa.set(c.conexao, c.numero_nome || 'Número')
    }
    return Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome }))
  }, [conversas])

  const soUmNumero = numeros.length === 1

  const filtradas = useMemo(() => {
    let lista = conversas.filter((c) =>
      aba === 'equipe' ? c.interna === true : c.interna !== true,
    )
    if (filtroNumero !== 'todos') lista = lista.filter((c) => c.conexao === filtroNumero)
    // CA-3-70: filtro "Não respondidas"
    if (soNaoLidas) lista = lista.filter((c) => c.nao_lida === true)
    const q = busca.trim().toLowerCase()
    if (q !== '') {
      lista = lista.filter(
        (c) =>
          (c.contato_nome || '').toLowerCase().indexOf(q) >= 0 ||
          (c.contato_telefone || '').indexOf(q) >= 0 ||
          (c.ultima_previa || '').toLowerCase().indexOf(q) >= 0,
      )
    }
    return lista
  }, [conversas, filtroNumero, busca, aba, soNaoLidas])

  // quantas estão esperando (para o número do botão)
  //
  // CA-3-77 (05/11): a contagem respeita o filtro de número. Antes ela contava
  // TODAS as conversas, então a vendedora que vê só o próprio número via um
  // número na etiqueta e, ao filtrar, encontrava menos — a etiqueta mentia.
  const contagemNaoLidas = useMemo(() => {
    let base = conversas.filter((c) => c.nao_lida === true && c.interna !== true)
    if (filtroNumero !== 'todos') base = base.filter((c) => c.conexao === filtroNumero)
    return base.length
  }, [conversas, filtroNumero])

  const abrir = (c: Conversa) => {
    setAberta(c.id)
    setMensagens([])
    setObservacoes([])
    setAvisoEnvio('')
    setSugestao('')
    void carregarMensagens(c.id)
    void carregarObservacoes(c.id)
  }

  const convAberta = conversas.find((c) => c.id === aberta) || null

  // A IA escreve, voce envia pelo celular (03/11): a Meta bloqueia o envio
  // pela API, mas nao impede a IA de pensar. Este botao traz a resposta certa
  // para a etapa da conversa e preenche o campo — o vendedor copia e manda.
  const pedirSugestao = useCallback(async (idConversa: string) => {
    setSugerindo(true)
    setSugestao('')
    try {
      const r = await pb.send('/backend/v1/whatsapp/conversas/' + idConversa + '/sugestao', {
        method: 'GET',
      })
      const txt = String((r as { sugestao?: string }).sugestao || '')
      setSugestao(txt)
      if (txt !== '') setRascunho(txt)
    } catch (e) {
      setAvisoEnvio('Não consegui sugerir: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSugerindo(false)
    }
  }, [])

  const copiarSugestao = useCallback(async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado('Copiado! Cole no WhatsApp do celular.')
      window.setTimeout(() => setCopiado(''), 4000)
    } catch {
      setCopiado('Selecione o texto e copie manualmente.')
      window.setTimeout(() => setCopiado(''), 5000)
    }
  }, [])

  const responder = async (texto: string, midiaId?: string, legenda?: string) => {
    if (!aberta) return
    setEnviando(true)
    setAvisoEnvio('')
    try {
      await pb.send('/backend/v1/whatsapp/conversas/' + aberta + '/responder', {
        method: 'POST',
        body: JSON.stringify({
          texto: texto || '',
          midia_id: midiaId || '',
          legenda: legenda || '',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      setRascunho('')
      setAvisoEnvio('Mensagem na fila — sai em até 2 minutos.')
      void carregarMensagens(aberta)
    } catch (e) {
      setAvisoEnvio('Não enviei: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEnviando(false)
    }
  }

  const enviarTexto = () => {
    const t = rascunho.trim()
    if (t === '' || enviando) return
    void responder(t)
  }

  const enviarArquivo = async (file: File) => {
    if (!aberta || enviando) return
    setEnviando(true)
    setAvisoEnvio('Enviando arquivo…')
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('conexao', convAberta?.conexao || '')
      fd.append('lead', convAberta?.lead || '')
      const up = (await pb.send('/backend/v1/whatsapp/midia', {
        method: 'POST',
        body: fd,
      })) as { id: string }
      await pb.send('/backend/v1/whatsapp/conversas/' + aberta + '/responder', {
        method: 'POST',
        body: JSON.stringify({ texto: '', midia_id: up.id, legenda: rascunho.trim() }),
        headers: { 'Content-Type': 'application/json' },
      })
      setRascunho('')
      setAvisoEnvio('Arquivo na fila — sai em até 2 minutos.')
      void carregarMensagens(aberta)
    } catch (e) {
      setAvisoEnvio('Não enviei: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEnviando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const comecarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'audio-' + Date.now() + '.webm', { type: 'audio/webm' })
        void enviarArquivo(file)
      }
      rec.start()
      grabRef.current = rec
      setGravando(true)
      setSegundosGrav(0)
    } catch (_) {
      setAvisoEnvio('Não consegui usar o microfone neste navegador.')
    }
  }

  const pararGravacao = () => {
    const rec = grabRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    grabRef.current = null
    setGravando(false)
  }

  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => setSegundosGrav((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [gravando])

  const salvarNota = async () => {
    const t = nota.trim()
    if (t === '' || !aberta || salvandoNota) return
    setSalvandoNota(true)
    try {
      await pb.send('/backend/v1/whatsapp/conversas/' + aberta + '/observacoes', {
        method: 'POST',
        body: JSON.stringify({ texto: t }),
        headers: { 'Content-Type': 'application/json' },
      })
      setNota('')
      void carregarObservacoes(aberta)
    } catch (e) {
      setAvisoEnvio('Não salvei o recado: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSalvandoNota(false)
    }
  }

  if (carregando) return <EstadoCarregando />
  if (erro) return <EstadoErro mensagem={erro} />

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Conversas"
        descricao="WhatsApp dos números da Haisan — responde por aqui e deixa recado interno para o vendedor."
        acoes={
          robo ? (
            robo.pode ? (
              <Button
                size="sm"
                variant={robo.ligado ? 'default' : 'destructive'}
                disabled={mudandoRobo}
                onClick={() => void alternarRobo()}
                title={robo.ligado ? 'Clique para desligar o robô' : 'Clique para ligar o robô'}
              >
                {mudandoRobo
                  ? 'Mudando…'
                  : robo.ligado
                    ? robo.dentro
                      ? 'Robô ligado · clique para desligar'
                      : 'Robô ligado (fora do horário) · clique para desligar'
                    : 'Robô desligado · clique para ligar'}
              </Button>
            ) : (
              <Badge variant={robo.ligado ? 'default' : 'outline'}>
                {robo.ligado ? 'Robô ligado' : 'Robô desligado'}
              </Badge>
            )
          ) : undefined
        }
      />

      {/* CA-3-25: cliente x equipe. A conversa da equipe é operação interna —
          não é atendimento, não aciona o robô e não vira lead. */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={aba === 'clientes' ? 'default' : 'outline'}
          onClick={() => setAba('clientes')}
        >
          Clientes
        </Button>
        <Button
          size="sm"
          variant={aba === 'equipe' ? 'default' : 'outline'}
          onClick={() => setAba('equipe')}
        >
          Equipe
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {soUmNumero ? (
          <Badge variant="outline">{numeros[0]?.nome}</Badge>
        ) : (
          <div className="w-60">
            {/* CA-3-70: mostrar só quem está esperando */}
            <Button
              size="sm"
              variant={soNaoLidas ? 'default' : 'outline'}
              onClick={() => setSoNaoLidas((v) => !v)}
            >
              {soNaoLidas ? 'Não respondidas' : 'Todas'}
              {contagemNaoLidas > 0 && (
                <DicaNumero texto="Clientes cuja última mensagem é deles e ninguém respondeu ainda">
                  <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                    {contagemNaoLidas}
                  </span>
                </DicaNumero>
              )}
            </Button>
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
        <input
          value={busca}
          onChange={(ev) => setBusca(ev.target.value)}
          placeholder="Buscar contato ou mensagem…"
          className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">{filtradas.length} conversa(s)</span>
        <Button size="sm" variant="outline" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {filtradas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma conversa"
          descricao="As conversas aparecem quando chega a primeira mensagem no número."
        />
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(300px,1fr)_2fr]">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Conversas
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {filtradas.map((c) => (
              <button
                key={c.id}
                onClick={() => abrir(c)}
                className={
                  'flex w-full items-start gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-muted/50 ' +
                  (aberta === c.id
                    ? 'bg-emerald-50 dark:bg-emerald-950/20'
                    : c.nao_lida
                      ? 'bg-red-50/60 dark:bg-red-950/10'
                      : '')
                }
              >
                <span
                  className={
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ' +
                    corDoNome(c.contato_nome || c.contato_telefone || '?')
                  }
                >
                  {iniciais(c.contato_nome, c.contato_telefone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={'truncate text-sm ' + (c.nao_lida ? 'font-bold' : 'font-semibold')}
                    >
                      {c.contato_nome || telefoneBonito(c.contato_telefone)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {horaCurta(c.ultima_mensagem_em)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {c.ultima_previa || '(sem prévia)'}
                    </span>
                    {/* CA-3-70: tempo de espera quando a última é do cliente */}
                    {c.nao_lida && (c.espera_min ?? -1) >= 0 && (
                      <DicaNumero texto="Há quanto tempo o cliente espera resposta">
                        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          {tempoEspera(c.espera_min || 0)}
                        </span>
                      </DicaNumero>
                    )}
                    {c.ultimo_autor && (
                      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                        {ROTULO_AUTOR[c.ultimo_autor] || c.ultimo_autor}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{c.numero_nome}</span>
                    {c.estado && c.estado !== 'triagem' && (
                      <Badge variant="outline" className="px-1 py-0 text-xs">
                        {c.estado.replace('_', ' ')}
                      </Badge>
                    )}
                    {c.canal && c.canal !== 'sem_gatilho' && (
                      <Badge variant="secondary" className="px-1 py-0 text-xs">
                        {c.canal}
                      </Badge>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-lg border bg-card">
          {!convAberta && (
            <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Escolha uma conversa à esquerda para ler e responder.
            </div>
          )}

          {convAberta && (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <span
                  className={
                    'flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ' +
                    corDoNome(convAberta.contato_nome || convAberta.contato_telefone || '?')
                  }
                >
                  {iniciais(convAberta.contato_nome, convAberta.contato_telefone)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {convAberta.contato_nome || 'Contato'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {telefoneBonito(convAberta.contato_telefone)} · {convAberta.numero_nome}
                  </p>
                </div>
                {/* CA-3-45 (05/11): a vendedora puxa o cliente para o
                    WhatsApp dela, com a mensagem pronta. Sem custo: sai pelo
                    aplicativo, não pela API. */}
                {linkChamarWhatsapp(convAberta.contato_telefone) && (
                  <a
                    href={linkChamarWhatsapp(convAberta.contato_telefone) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Chamar no WhatsApp
                  </a>
                )}
                {convAberta.estado === 'pausada_humano' && (
                  <Badge variant="outline" className="text-xs">
                    IA pausada
                  </Badge>
                )}
              </div>

              {(observacoes.length > 0 || possoEscrever) && (
                <div className="border-b bg-amber-50 px-4 py-2 dark:bg-amber-950/20">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <span>🔒</span>
                    <span>Recado interno — o cliente NÃO vê, só o vendedor deste atendimento</span>
                  </div>
                  {observacoes.map((o) => (
                    <div
                      key={o.id}
                      className="mb-1 rounded border border-amber-300/60 bg-white/70 px-2 py-1 text-xs dark:bg-amber-900/20"
                    >
                      <span className="font-medium">{o.autor_nome || 'Gerência'}: </span>
                      <span className="whitespace-pre-wrap">{o.texto}</span>
                    </div>
                  ))}
                  {possoEscrever && (
                    <div className="flex gap-2">
                      <input
                        value={nota}
                        onChange={(ev) => setNota(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') void salvarNota()
                        }}
                        placeholder="Ex.: não fala que é aço, é madeira…"
                        className="flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs dark:bg-amber-900/30"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void salvarNota()}
                        disabled={salvandoNota}
                      >
                        {salvandoNota ? '…' : 'Recado'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="max-h-[26rem] flex-1 space-y-1 overflow-y-auto px-4 py-3">
                {carregandoMsg && (
                  <p className="text-xs text-muted-foreground">Carregando mensagens…</p>
                )}
                {!carregandoMsg && erroMsg && (
                  <p className="text-xs text-muted-foreground">{erroMsg}</p>
                )}
                {!carregandoMsg && !erroMsg && mensagens.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
                )}
                {!carregandoMsg &&
                  mensagens.map((m, i) => {
                    const anterior = i > 0 ? mensagens[i - 1] : null
                    const novoDia =
                      !anterior || rotuloDia(anterior.enviada_em) !== rotuloDia(m.enviada_em)
                    const minha = m.direcao === 'saida'
                    return (
                      <div key={m.id}>
                        {novoDia && (
                          <div className="my-2 text-center">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {rotuloDia(m.enviada_em)}
                            </span>
                          </div>
                        )}
                        <div className={'flex ' + (minha ? 'justify-end' : 'justify-start')}>
                          <div
                            className={
                              'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ' +
                              (minha
                                ? 'bg-emerald-100 text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-50'
                                : 'bg-muted text-foreground')
                            }
                          >
                            <div className="mb-0.5 flex items-center gap-2 text-xs opacity-70">
                              <span className="font-semibold">
                                {ROTULO_AUTOR[m.autor] || m.autor}
                              </span>
                              <span>{horaCurta(m.enviada_em)}</span>
                              {m.status && <span>· {m.status}</span>}
                              {m.editada_em ? <span>· editada</span> : null}
                            </div>
                            {m.apagada ? (
                              <p className="italic opacity-70">Mensagem apagada</p>
                            ) : (
                              <>
                                {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                                {m.media_url && (
                                  <span className="mt-1 block">
                                    {m.tipo === 'image' ? (
                                      <img
                                        src={m.media_url}
                                        alt="imagem enviada"
                                        className="max-h-64 rounded"
                                        loading="lazy"
                                      />
                                    ) : m.tipo === 'audio' ? (
                                      <audio controls src={m.media_url} className="max-w-full" />
                                    ) : m.tipo === 'video' ? (
                                      <video
                                        controls
                                        src={m.media_url}
                                        className="max-h-64 rounded"
                                      />
                                    ) : (
                                      <a
                                        href={m.media_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs underline"
                                      >
                                        {m.media_mimetype || 'Abrir arquivo'}
                                      </a>
                                    )}
                                    {m.tipo === 'audio' && duracao(m.media_duracao_s) !== '' && (
                                      <span className="ml-2 text-xs opacity-70">
                                        {duracao(m.media_duracao_s)}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!m.texto && !m.media_url && (
                                  <p className="text-xs opacity-70">({m.tipo})</p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>

              <div className="border-t px-3 py-2">
                {ENVIO_BLOQUEADO && (
                  <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
                    <strong>Responda pelo WhatsApp do celular.</strong> A Meta está bloqueando o
                    envio pela API (erro 130497) — o que você escrever aqui{' '}
                    <strong>não chega</strong> no cliente. Suas respostas pelo celular aparecem
                    nesta tela normalmente.
                  </div>
                )}

                {/* IA escreve, vendedor envia pelo celular */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => aberta && void pedirSugestao(aberta)}
                    disabled={sugerindo}
                    title="A IA escreve a resposta certa para esta etapa"
                  >
                    {sugerindo ? 'Pensando…' : '✨ Sugerir resposta'}
                  </Button>
                  {sugestao !== '' && (
                    <>
                      <Button size="sm" onClick={() => void copiarSugestao(sugestao)}>
                        Copiar para o celular
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Revise antes de enviar — a IA segue o roteiro, não decide preço.
                      </span>
                    </>
                  )}
                  {copiado !== '' && (
                    <span className="text-xs font-medium text-emerald-700">{copiado}</span>
                  )}
                </div>
                {avisoEnvio && <p className="mb-1 text-xs text-muted-foreground">{avisoEnvio}</p>}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*,audio/*,application/pdf"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files && ev.target.files[0]
                      if (f) void enviarArquivo(f)
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    title="Anexar foto, vídeo ou documento"
                    onClick={() => fileRef.current?.click()}
                    disabled={enviando}
                  >
                    📎
                  </Button>
                  <Button
                    size="sm"
                    variant={gravando ? 'destructive' : 'outline'}
                    title={gravando ? 'Parar e enviar áudio' : 'Gravar áudio'}
                    onClick={() => (gravando ? pararGravacao() : void comecarGravacao())}
                    disabled={enviando}
                  >
                    {gravando ? '⏹ ' + duracao(segundosGrav) : '🎤'}
                  </Button>
                  <textarea
                    value={rascunho}
                    onChange={(ev) => setRascunho(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' && !ev.shiftKey) {
                        ev.preventDefault()
                        enviarTexto()
                      }
                    }}
                    rows={1}
                    disabled={ENVIO_BLOQUEADO}
                    placeholder={
                      ENVIO_BLOQUEADO
                        ? 'Envio bloqueado pela Meta — responda pelo celular'
                        : 'Escreva a resposta… (Enter envia, Shift+Enter quebra linha)'
                    }
                    className="min-h-[38px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <Button
                    size="sm"
                    onClick={enviarTexto}
                    disabled={ENVIO_BLOQUEADO || enviando || rascunho.trim() === ''}
                  >
                    {enviando ? '…' : 'Enviar'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
