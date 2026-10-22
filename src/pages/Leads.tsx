/**
 * Página de Leads (CRM próprio — fase 4, card 1).
 *
 * Tabela com filtros por status/origem/busca, criação manual, edição de status
 * com trilha de eventos, importação por CSV colado (planilha da agência).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
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
import {
  STATUS_LEADS,
  ORIGENS_LEADS,
  listarLeads,
  criarLead,
  editarLead,
  eventosDoLead,
  importarLeadsCsv,
  type Lead,
  type LeadEvento,
  type ResultadoImportacao,
} from '@/lib/marketing/crm'

const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  orcamento: 'Orçamento',
  fechado: 'Fechado',
  perdido: 'Perdido',
}

const COR_STATUS: Record<string, string> = {
  novo: 'bg-blue-100 text-blue-800',
  em_contato: 'bg-amber-100 text-amber-800',
  orcamento: 'bg-purple-100 text-purple-800',
  fechado: 'bg-emerald-100 text-emerald-800',
  perdido: 'bg-gray-200 text-gray-700',
}

const ROTULO_ORIGEM: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  site: 'Site',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
  importacao: 'Importado',
}

export default function Leads() {
  const [itens, setItens] = useState<Lead[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  // criação
  const [abrirCriar, setAbrirCriar] = useState(false)
  const [nNome, setNNome] = useState('')
  const [nTelefone, setNTelefone] = useState('')
  const [nEmail, setNEmail] = useState('')
  const [nOrigem, setNOrigem] = useState('manual')
  const [nObs, setNObs] = useState('')
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState<string | null>(null)
  // detalhe
  const [detalhe, setDetalhe] = useState<Lead | null>(null)
  const [eventos, setEventos] = useState<LeadEvento[]>([])
  const [novoStatus, setNovoStatus] = useState('')
  const [salvando, setSalvando] = useState(false)
  // importação
  const [abrirImportar, setAbrirImportar] = useState(false)
  const [csv, setCsv] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erroImportar, setErroImportar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com o seu usuário para ver os leads.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setItens(await listarLeads())
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

  const filtrados = useMemo(() => {
    let out = itens
    if (filtroStatus !== 'todos') out = out.filter((l) => l.status === filtroStatus)
    if (busca.trim() !== '') {
      const q = busca.trim().toLowerCase()
      out = out.filter(
        (l) =>
          l.nome.toLowerCase().includes(q) ||
          l.telefone.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q),
      )
    }
    return out
  }, [itens, filtroStatus, busca])

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of STATUS_LEADS) c[s.valor] = 0
    for (const l of itens) c[l.status] = (c[l.status] || 0) + 1
    return c
  }, [itens])

  const criar = async () => {
    if (nNome.trim() === '') {
      setErroCriar('Informe o nome do lead.')
      return
    }
    setCriando(true)
    setErroCriar(null)
    try {
      await criarLead({
        nome: nNome.trim(),
        telefone: nTelefone.trim(),
        email: nEmail.trim(),
        origem: nOrigem,
        observacoes: nObs.trim(),
      })
      setAbrirCriar(false)
      setNNome('')
      setNTelefone('')
      setNEmail('')
      setNOrigem('manual')
      setNObs('')
      setMsg('Lead criado.')
      await carregar()
    } catch (e) {
      setErroCriar(e instanceof Error ? e.message : String(e))
    } finally {
      setCriando(false)
    }
  }

  const abrirDetalhe = async (l: Lead) => {
    setDetalhe(l)
    setNovoStatus(l.status)
    setMsg(null)
    try {
      setEventos(await eventosDoLead(l.id))
    } catch {
      setEventos([])
    }
  }

  const salvarStatus = async () => {
    if (!detalhe) return
    setSalvando(true)
    try {
      await editarLead(detalhe.id, { status: novoStatus })
      setMsg('Status atualizado.')
      await carregar()
      const atualizado = { ...detalhe, status: novoStatus as Lead['status'] }
      setDetalhe(atualizado)
      setEventos(await eventosDoLead(detalhe.id))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const importar = async () => {
    setImportando(true)
    setErroImportar(null)
    setResultado(null)
    try {
      const r = await importarLeadsCsv(csv)
      setResultado(r)
      await carregar()
    } catch (e) {
      setErroImportar(e instanceof Error ? e.message : String(e))
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6">
      <CabecalhoPagina
        titulo="Leads (CRM)"
        descricao="Base própria de leads — origem, pipeline de status e trilha de eventos. Importação da planilha da agência por CSV."
      />

      {/* resumo por status */}
      <div className="flex flex-wrap gap-2">
        {STATUS_LEADS.map((s) => (
          <button
            key={s.valor}
            onClick={() => setFiltroStatus(filtroStatus === s.valor ? 'todos' : s.valor)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              filtroStatus === s.valor ? 'border-primary bg-primary/5 font-medium' : 'border-border'
            }`}
          >
            {s.rotulo}: <strong>{contagem[s.valor] ?? 0}</strong>
          </button>
        ))}
        {filtroStatus !== 'todos' && (
          <button
            onClick={() => setFiltroStatus('todos')}
            className="text-sm text-muted-foreground underline"
          >
            limpar filtro
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, telefone ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setAbrirImportar(true)}>
            Importar CSV
          </Button>
          <Button onClick={() => setAbrirCriar(true)}>Novo lead</Button>
        </div>
      </div>

      {user && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
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
            <CardTitle className="text-base">Entrar para ver os leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lead-login-email">E-mail</Label>
              <Input
                id="lead-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@haisan.com.br"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-login-senha">Senha</Label>
              <Input
                id="lead-login-senha"
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

      {msg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      )}

      {carregando && <EstadoCarregando />}
      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {!carregando && !erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Nenhum lead ainda"
          descricao="Crie o primeiro lead manualmente ou importe a planilha da agência (botão Importar CSV)."
        />
      )}
      {!carregando && !erro && itens.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">Origem</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{l.nome}</td>
                      <td className="py-2 pr-3">{l.telefone || '—'}</td>
                      <td className="py-2 pr-3">{ROTULO_ORIGEM[l.origem] || l.origem}</td>
                      <td className="py-2 pr-3">
                        <Badge className={COR_STATUS[l.status] || ''}>
                          {ROTULO_STATUS[l.status] || l.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{(l.data_lead || '').slice(0, 10) || '—'}</td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" onClick={() => void abrirDetalhe(l)}>
                          Abrir
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground">
                        Nenhum lead com esse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {filtrados.length} de {itens.length} leads
            </p>
          </CardContent>
        </Card>
      )}

      {/* criar */}
      <Dialog open={abrirCriar} onOpenChange={setAbrirCriar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lead-nome">Nome *</Label>
              <Input id="lead-nome" value={nNome} onChange={(e) => setNNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lead-tel">Telefone</Label>
                <Input
                  id="lead-tel"
                  value={nTelefone}
                  onChange={(e) => setNTelefone(e.target.value)}
                  placeholder="(41) 99999-9999"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input id="lead-email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Origem</Label>
              <Select value={nOrigem} onValueChange={setNOrigem}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENS_LEADS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {ROTULO_ORIGEM[o] || o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-obs">Observações</Label>
              <Textarea
                id="lead-obs"
                value={nObs}
                onChange={(e) => setNObs(e.target.value)}
                rows={3}
              />
            </div>
            {erroCriar && <p className="text-sm text-destructive">{erroCriar}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbrirCriar(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void criar()} disabled={criando}>
                {criando ? 'Criando…' : 'Criar lead'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* detalhe */}
      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detalhe?.nome}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Telefone:</span> {detalhe.telefone || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">E-mail:</span> {detalhe.email || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Origem:</span>{' '}
                  {ROTULO_ORIGEM[detalhe.origem] || detalhe.origem}
                </p>
                <p>
                  <span className="text-muted-foreground">Campanha:</span> {detalhe.campanha || '—'}
                </p>
              </div>
              {detalhe.observacoes && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{detalhe.observacoes}</p>
              )}
              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label>Status</Label>
                  <Select value={novoStatus} onValueChange={setNovoStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_LEADS.map((s) => (
                        <SelectItem key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => void salvarStatus()}
                  disabled={salvando || novoStatus === detalhe.status}
                >
                  {salvando ? 'Salvando…' : 'Salvar status'}
                </Button>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Trilha de eventos</p>
                <div className="space-y-1">
                  {eventos.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sem eventos.</p>
                  )}
                  {eventos.map((ev) => (
                    <p key={ev.id} className="text-xs text-muted-foreground">
                      • {ev.texto}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* importar */}
      <Dialog open={abrirImportar} onOpenChange={setAbrirImportar}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar leads (CSV da planilha)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Abre a planilha da agência, seleciona a aba "Leads", copia tudo e cola aqui (uma linha
              por lead; cabeçalho é detectado automaticamente). Colunas: nome, telefone, email,
              origem, campanha, data_lead, status, observacoes.
            </p>
            <Textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={10}
              placeholder={
                'Maria Silva;(41) 99123-4567;maria@email.com;meta;Salão — Tráfego;2026-10-05;fechado;Poltrona hidráulica'
              }
            />
            {erroImportar && <p className="text-sm text-destructive">{erroImportar}</p>}
            {resultado && (
              <div className="rounded-md border px-3 py-2 text-sm">
                <p>
                  <strong>{resultado.criados}</strong> criados ·{' '}
                  <strong>{resultado.duplicados}</strong> duplicados (já existiam) ·{' '}
                  <strong>{resultado.invalidos}</strong> inválidos
                </p>
                {resultado.erros.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {resultado.erros.map((er, i) => (
                      <li key={i}>{er}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbrirImportar(false)}>
                Fechar
              </Button>
              <Button onClick={() => void importar()} disabled={importando || csv.trim() === ''}>
                {importando ? 'Importando…' : 'Importar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
