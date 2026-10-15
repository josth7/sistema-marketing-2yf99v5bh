/**
 * Página de Critérios de Alerta (SPEC-2-002, card fc6d0f5a).
 *
 * Cadastro em RASCUNHO com estados draft/approved/archived e validação no
 * servidor (422 campo/motivo, 403 aprovação indevida, 409 conflito de versão).
 * Nenhum limiar padrão: o formulário nasce vazio — limiares reais são da
 * Anézia no workshop (CL-003, !22/10). Aprovar exige outro responsável
 * (quem criou não aprova a si mesmo — separação básica até a SPEC-2-005).
 */
import { useCallback, useEffect, useState } from 'react'
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
import { Archive, CheckCircle2, ListPlus, ShieldCheck } from 'lucide-react'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { lerErroCustom } from '@/lib/marketing/erros-custom'
import {
  CANAIS,
  DIRECOES,
  METRICAS,
  NATUREZAS,
  OBJETIVOS,
  PERIODOS,
  TIPOS_RESULTADO,
  resumoCriterio,
} from '@/lib/marketing/criterios'

const ROTULO: Record<string, string> = {
  gasto: 'Gasto (R$)',
  cliques: 'Cliques',
  impressoes: 'Impressões',
  alcance: 'Alcance',
  resultados: 'Resultados',
  cpc: 'CPC (custo por clique)',
  cpm: 'CPM (custo por mil)',
  ctr: 'CTR',
  custo_por_resultado: 'Custo por resultado (CPR)',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  meta_organico: 'Meta orgânico',
  trafico: 'Tráfego',
  engajamento: 'Engajamento',
  leads: 'Leads',
  vendas: 'Vendas',
  video: 'Vídeo',
  nao_informado: 'Não informado',
  pago: 'Pago',
  organico: 'Orgânico',
  increase: 'Alta (aumento)',
  decrease: 'Queda (diminuição)',
  monthly: 'Mensal (1º ao último dia)',
  calendar_half: 'Quinzenal (1–15 / 16–fim)',
  conversoes: 'Conversões',
}

interface CriterioItem {
  id: string
  uuid: string
  version: number
  state: string
  metric: string | null
  canal: string | null
  objetivo: string | null
  result_type: string | null
  natureza: string | null
  direction: string | null
  threshold_pct: number | null
  min_base: number | null
  period_kind: string | null
  comparison_mode: string | null
  responsible_user: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  history: string | null
  created: string
  updated: string
}

const VAZIO = {
  metric: '',
  canal: '',
  objetivo: '',
  result_type: '',
  natureza: '',
  direction: '',
  threshold_pct: '',
  min_base: '',
  period_kind: '',
}

export default function Criterios() {
  const [itens, setItens] = useState<CriterioItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState({ ...VAZIO })
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com um usuário de teste para ver e cadastrar critérios.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const res = (await pb.send('/backend/v1/alert-criteria', { method: 'GET' })) as {
        itens?: CriterioItem[]
      }
      setItens(Array.isArray(res.itens) ? res.itens : [])
    } catch (e) {
      setErro(lerErroCustom(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (pb.authStore.isValid) void carregar()
  }, [carregar])

  const salvar = async () => {
    setSalvando(true)
    setErrosCampo({})
    setAviso(null)
    try {
      const body: Record<string, unknown> = {}
      for (const k of Object.keys(form)) {
        const v = form[k as keyof typeof form]
        if (v !== '') body[k] = k === 'threshold_pct' || k === 'min_base' ? Number(v) : v
      }
      await pb.send('/backend/v1/alert-criteria', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setForm({ ...VAZIO })
      setAviso('Rascunho salvo no servidor.')
      await carregar()
    } catch (e) {
      const detail = (e as { response?: { data?: Record<string, { message?: string }> } }).response
        ?.data
      const campos: Record<string, string> = {}
      if (detail && typeof detail === 'object') {
        for (const [campo, det] of Object.entries(detail)) {
          if (det && typeof det === 'object' && 'message' in det)
            campos[campo] = String(det.message)
        }
      }
      if (Object.keys(campos).length > 0) setErrosCampo(campos)
      setAviso(lerErroCustom(e))
    } finally {
      setSalvando(false)
    }
  }

  const aprovar = async (item: CriterioItem) => {
    setAviso(null)
    try {
      await pb.send(`/backend/v1/alert-criteria/${item.id}/approve`, { method: 'POST' })
      setAviso('Critério aprovado no servidor (ator, data e versão registrados).')
      await carregar()
    } catch (e) {
      // AP-2026-10-14-1400: mostrar O PORQUÊ da recusa (contrato custom {erro}),
      // não a mensagem técnica do SDK
      setAviso(lerErroCustom(e))
    }
  }

  const arquivar = async (item: CriterioItem) => {
    setAviso(null)
    try {
      await pb.send(`/backend/v1/alert-criteria/${item.id}/archive`, { method: 'POST' })
      setAviso('Critério arquivado (a regra anterior aprovada permanece até substituição).')
      await carregar()
    } catch (e) {
      setAviso(lerErroCustom(e))
    }
  }

  const entrar = async () => {
    setEntrando(true)
    setErroAuth(null)
    try {
      await pb.collection('users').authWithPassword(email, senha)
      setUser(pb.authStore.isValid ? pb.authStore.record : null)
      setAviso(null)
      await carregar()
    } catch {
      setErroAuth(
        'Login inválido — usuários de teste: criterios.fixture.criador@haisan.com.br (cria) ou criterios.fixture.aprovador@haisan.com.br (aprova), senha Fixture@2026',
      )
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

  const badgeEstado = (estado: string) => {
    if (estado === 'approved')
      return <Badge className="bg-emerald-100 text-emerald-800">aprovado</Badge>
    if (estado === 'archived') return <Badge variant="secondary">arquivado</Badge>
    return <Badge className="bg-amber-100 text-amber-800">rascunho</Badge>
  }

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6">
      <CabecalhoPagina
        titulo="Critérios de alerta"
        descricao="Cadastro em rascunho — preparação para o workshop de limiares com a Anézia (22/10). Nenhuma regra nasce aprovada: aprovar exige outro responsável e todos os campos obrigatórios."
      />

      {user && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            Logado como <strong>{String(user.email ?? '')}</strong>
            {String(user.email ?? '').startsWith('criterios.fixture.criador') &&
              ' — cria rascunhos (aprovação é de outro responsável)'}
            {String(user.email ?? '').startsWith('criterios.fixture.aprovador') &&
              ' — pode aprovar rascunhos de outra pessoa'}
          </span>
          <Button size="sm" variant="ghost" onClick={sair}>
            Sair
          </Button>
        </div>
      )}

      {!user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrar (usuário de teste)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="criterios.fixture.criador@haisan.com.br"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={senha}
                  onChange={(ev) => setSenha(ev.target.value)}
                  placeholder="Fixture@2026"
                />
              </div>
            </div>
            {erroAuth && <p className="text-xs text-red-600">{erroAuth}</p>}
            <Button onClick={entrar} disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </Button>
            <p className="text-xs text-[#6B7280]">
              Contas de teste (migração 0013): <strong>criador</strong> cria rascunhos (não aprova a
              si mesmo) e <strong>aprovador</strong> aprova. Senha das duas: Fixture@2026.
            </p>
          </CardContent>
        </Card>
      )}

      {aviso && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {aviso}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListPlus className="h-4 w-4 text-[#6C3EF5]" />
            Novo critério (rascunho)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Métrica</Label>
              <Select
                value={form.metric || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, metric: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {METRICAS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ROTULO[m] ?? m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.metric && <p className="text-xs text-red-600">{errosCampo.metric}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select
                value={form.canal || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, canal: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CANAIS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {ROTULO[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.canal && <p className="text-xs text-red-600">{errosCampo.canal}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Objetivo</Label>
              <Select
                value={form.objetivo || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, objetivo: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {OBJETIVOS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {ROTULO[o] ?? o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.objetivo && <p className="text-xs text-red-600">{errosCampo.objetivo}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo do resultado</Label>
              <Select
                value={form.result_type || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, result_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_RESULTADO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTULO[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.result_type && (
                <p className="text-xs text-red-600">{errosCampo.result_type}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Natureza</Label>
              <Select
                value={form.natureza || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, natureza: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {NATUREZAS.map((n) => (
                    <SelectItem key={n} value={n}>
                      {ROTULO[n] ?? n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.natureza && <p className="text-xs text-red-600">{errosCampo.natureza}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Direção</Label>
              <Select
                value={form.direction || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, direction: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {DIRECOES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {ROTULO[d] ?? d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.direction && (
                <p className="text-xs text-red-600">{errosCampo.direction}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Limiar (%)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="ex.: 20"
                value={form.threshold_pct}
                onChange={(e) => setForm((f) => ({ ...f, threshold_pct: e.target.value }))}
              />
              {errosCampo.threshold_pct && (
                <p className="text-xs text-red-600">{errosCampo.threshold_pct}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Base mínima</Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="ex.: 10"
                value={form.min_base}
                onChange={(e) => setForm((f) => ({ ...f, min_base: e.target.value }))}
              />
              {errosCampo.min_base && <p className="text-xs text-red-600">{errosCampo.min_base}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Calendário do período</Label>
              <Select
                value={form.period_kind || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, period_kind: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PERIODOS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULO[p] ?? p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.period_kind && (
                <p className="text-xs text-red-600">{errosCampo.period_kind}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar rascunho'}
            </Button>
            <span className="text-xs text-[#6B7280]">
              Rascunho pode nascer incompleto — completar antes de aprovar.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Critérios cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <EstadoCarregando linhas={2} />
          ) : erro ? (
            <EstadoErro mensagem={erro} />
          ) : itens.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum critério ainda"
              descricao="O formulário acima cria o primeiro rascunho."
            />
          ) : (
            <div className="space-y-3">
              {itens.map((it) => (
                <div
                  key={it.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {badgeEstado(it.state)}
                    <span className="text-xs text-[#6B7280]">versão {it.version}</span>
                    {it.approved_by && (
                      <span className="text-xs text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        aprovado em {String(it.approved_at ?? '').slice(0, 10)} (v{it.version})
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium">
                    {resumoCriterio({
                      metric: it.metric,
                      direcao: it.direction,
                      thresholdPct: it.threshold_pct,
                      periodKind: it.period_kind,
                      minBase: it.min_base,
                    })}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {[it.canal, it.objetivo, it.result_type, it.natureza]
                      .filter(Boolean)
                      .map((v) => ROTULO[v as string] ?? v)
                      .join(' · ') || 'recorte incompleto'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {it.state === 'draft' && (
                      <Button size="sm" variant="outline" onClick={() => aprovar(it)}>
                        <CheckCircle2 className="h-4 w-4" />
                        Aprovar
                      </Button>
                    )}
                    {it.state !== 'archived' && (
                      <Button size="sm" variant="ghost" onClick={() => arquivar(it)}>
                        <Archive className="h-4 w-4" />
                        Arquivar
                      </Button>
                    )}
                  </div>
                  {it.state === 'draft' && (
                    <p className="text-xs text-[#6B7280]">
                      Aprovar exige todos os campos preenchidos e um responsável diferente de quem
                      criou.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
