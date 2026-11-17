/**
 * Página de Concorrentes (fase 4, card 4) — observações manuais.
 * Catálogo fixo dos 5 concorrentes do dono + registro de observações
 * (preço, lançamento, promoção, produto) com data e canal onde viu.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'
import { CabecalhoTela } from '@/components/base/visual'
import pb from '@/lib/pocketbase/client'
import {
  TIPOS_OBS,
  CONCORRENTES_FIXOS,
  listarObs,
  criarObs,
  type ObsConcorrente,
} from '@/lib/marketing/concorrentes'

const ROTULO_TIPO: Record<string, string> = {
  preco: 'Preço',
  lancamento: 'Lançamento',
  promocao: 'Promoção',
  produto: 'Produto',
  outro: 'Outro',
}

const COR_TIPO: Record<string, string> = {
  preco: 'bg-blue-100 text-blue-800',
  lancamento: 'bg-purple-100 text-purple-800',
  promocao: 'bg-amber-100 text-amber-800',
  produto: 'bg-emerald-100 text-emerald-800',
  outro: 'bg-gray-200 text-gray-700',
}

export default function Concorrentes() {
  const [itens, setItens] = useState<ObsConcorrente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  // criar
  const [abrirCriar, setAbrirCriar] = useState(false)
  const [nConcorrente, setNConcorrente] = useState<string>(CONCORRENTES_FIXOS[0])
  const [nTipo, setNTipo] = useState('preco')
  const [nTexto, setNTexto] = useState('')
  const [nCanal, setNCanal] = useState('')
  const [nData, setNData] = useState('')
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com o seu usuário para ver as observações.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setItens(await listarObs())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (pb.authStore.isValid) void carregar()
  }, [carregar])

  const entrar = async () => {
    setEntrando(true)
    setErroAuth(null)
    try {
      await pb.collection('users').authWithPassword(email, senha)
      setUser(pb.authStore.isValid ? pb.authStore.record : null)
      setErro(null)
      await carregar()
    } catch {
      setErroAuth('Login inválido — confira e-mail e senha.')
    } finally {
      setEntrando(false)
    }
  }

  const sair = () => {
    pb.authStore.clear()
    setUser(null)
    setItens([])
    setErro(null)
  }

  const filtrados = useMemo(
    () => (filtro === 'todos' ? itens : itens.filter((o) => o.concorrente === filtro)),
    [itens, filtro],
  )

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of itens) c[o.concorrente] = (c[o.concorrente] || 0) + 1
    return c
  }, [itens])

  const criar = async () => {
    if (nTexto.trim() === '') {
      setErroCriar('Descreva o que observou.')
      return
    }
    setCriando(true)
    setErroCriar(null)
    try {
      await criarObs({
        concorrente: nConcorrente,
        tipo: nTipo,
        texto: nTexto.trim(),
        canal_visto: nCanal.trim(),
        data_obs: nData || undefined,
      })
      setAbrirCriar(false)
      setNTexto('')
      setNCanal('')
      setNData('')
      setMsg('Observação registrada.')
      await carregar()
    } catch (e) {
      setErroCriar(e instanceof Error ? e.message : String(e))
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6">
      <CabecalhoTela
        titulo="Concorrentes"
        subtitulo="Monitoração manual dos concorrentes — preço, lançamento, promoção e produto observados (sem scraping)."
      />

      {user && (
        <div className="flex items-center justify-between rounded-cartao border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            Conectado como <strong>{user.email}</strong>
          </span>
          <Button size="sm" variant="ghost" onClick={sair}>
            Sair
          </Button>
        </div>
      )}
      {!user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrar para ver as observações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="conc-email">E-mail</Label>
              <Input
                id="conc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@haisan.com.br"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conc-senha">Senha</Label>
              <Input
                id="conc-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {erroAuth && <p className="text-sm text-destructive">{erroAuth}</p>}
            <Button onClick={() => void entrar()} disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* catálogo dos concorrentes */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFiltro('todos')}
          className={`rounded-cartao border px-3 py-1.5 text-sm ${filtro === 'todos' ? 'border-primary bg-primary/5 font-medium' : 'border-border'}`}
        >
          Todos: <strong>{itens.length}</strong>
        </button>
        {CONCORRENTES_FIXOS.map((c) => (
          <button
            key={c}
            onClick={() => setFiltro(filtro === c ? 'todos' : c)}
            className={`rounded-cartao border px-3 py-1.5 text-sm ${filtro === c ? 'border-primary bg-primary/5 font-medium' : 'border-border'}`}
          >
            {c}: <strong>{contagem[c] ?? 0}</strong>
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setAbrirCriar(true)} disabled={!user}>
          Registrar observação
        </Button>
      </div>

      {msg && (
        <p className="rounded-cartao border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      )}

      {carregando && <EstadoCarregando />}
      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {!carregando && !erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma observação ainda"
          descricao="Registre o que viu de cada concorrente: preço, lançamento, promoção ou produto."
        />
      )}
      {!carregando && !erro && itens.length > 0 && (
        <div className="space-y-3">
          {filtrados.map((o) => (
            <Card key={o.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.concorrente}</span>
                  <Badge className={COR_TIPO[o.tipo] || ''}>{ROTULO_TIPO[o.tipo] || o.tipo}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {(o.data_obs || o.criado_em).slice(0, 10)}
                    {o.canal_visto ? ' · ' + o.canal_visto : ''}
                  </span>
                </div>
                <p className="mt-1 text-sm">{o.texto}</p>
              </CardContent>
            </Card>
          ))}
          {filtrados.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Nenhuma observação desse concorrente.
            </p>
          )}
        </div>
      )}

      {/* criar */}
      <Dialog open={abrirCriar} onOpenChange={setAbrirCriar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar observação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Concorrente</Label>
                <Select value={nConcorrente} onValueChange={setNConcorrente}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCORRENTES_FIXOS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={nTipo} onValueChange={setNTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_OBS.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="obs-texto">O que observou *</Label>
              <Textarea
                id="obs-texto"
                value={nTexto}
                onChange={(e) => setNTexto(e.target.value)}
                rows={3}
                placeholder="Ex.: Poltrona hidráulica a R$ 890 no site"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="obs-canal">Onde viu</Label>
                <Input
                  id="obs-canal"
                  value={nCanal}
                  onChange={(e) => setNCanal(e.target.value)}
                  placeholder="site, instagram, loja…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="obs-data">Data</Label>
                <Input
                  id="obs-data"
                  type="date"
                  value={nData}
                  onChange={(e) => setNData(e.target.value)}
                />
              </div>
            </div>
            {erroCriar && <p className="text-sm text-destructive">{erroCriar}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbrirCriar(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void criar()} disabled={criando}>
                {criando ? 'Registrando…' : 'Registrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
