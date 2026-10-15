/**
 * Página de Decisões (SPEC-2-003, card edd618c7).
 *
 * Cadastro com responsável e data de revisão OBRIGATÓRIOS (validação no
 * servidor: 422 campo/motivo, 409 conflito de revisão), estados
 * aberta/em revisão/encerrada, histórico preservado. Sem lembrete automático
 * nesta task (é do card a434ca96). Usuários fixture para o teste.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Archive, CheckCircle2, Scale } from 'lucide-react'
import { CabecalhoPagina } from '@/components/base/estados'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { rotuloEstado } from '@/lib/marketing/decisoes'

interface DecisaoItem {
  id: string
  uuid: string
  source_alert_id: string | null
  scope: string | null
  title: string
  justification: string
  planned_action: string
  responsible_user: string | null
  review_date: string | null
  state: string
  revision: number
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  review_outcome: string | null
  closed_at: string | null
  history: string | null
}

const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const VAZIO = {
  title: '',
  justification: '',
  planned_action: '',
  responsible_user: '',
  review_date: AMANHA,
  scope: '',
}

export default function Decisoes() {
  const [itens, setItens] = useState<DecisaoItem[]>([])
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
  const [fechando, setFechando] = useState<string | null>(null)
  const [resultado, setResultado] = useState('')

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com um usuário de teste para ver e cadastrar decisões.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const res = (await pb.send('/backend/v1/decisions', { method: 'GET' })) as {
        itens?: DecisaoItem[]
      }
      setItens(Array.isArray(res.itens) ? res.itens : [])
    } catch (e) {
      setErro(getErrorMessage(e))
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
      setAviso(null)
      await carregar()
    } catch {
      setErroAuth(
        'Login inválido — usuário de teste: criterios.fixture.criador@haisan.com.br, senha Fixture@2026',
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

  const salvar = async () => {
    setSalvando(true)
    setErrosCampo({})
    setAviso(null)
    try {
      const body: Record<string, unknown> = { review_date: form.review_date }
      for (const k of ['title', 'justification', 'planned_action', 'responsible_user', 'scope']) {
        const v = form[k as keyof typeof form]
        if (v !== '') body[k] = v
      }
      await pb.send('/backend/v1/decisions', { method: 'POST', body: JSON.stringify(body) })
      setForm({ ...VAZIO, review_date: AMANHA })
      setAviso('Decisão registrada com data de revisão obrigatória.')
      await carregar()
    } catch (e) {
      const sdk = e as {
        response?: { data?: { erro?: string; campos?: Record<string, unknown> } } & {
          erro?: string
          campos?: Record<string, unknown>
        }
        data?: { erro?: string; campos?: Record<string, unknown> }
      }
      // SDK PocketBase: o corpo do erro vive em e.response (alias e.data);
      // validação nativa de coleção vive em e.response.data
      const detail = sdk.response?.data ?? sdk.response ?? sdk.data
      // verificado no bundle v0.26: throw new Xm({url, status, data:n}) →
      // constructor: t.response??t.data → this.response = CORPO; e.response.data = undefined
      const campos: Record<string, string> = {}
      if (detail?.campos && typeof detail.campos === 'object') {
        for (const [campo, det] of Object.entries(detail.campos)) {
          if (det && typeof det === 'object' && 'message' in det)
            campos[campo] = String((det as { message: string }).message)
          else campos[campo] = String(det)
        }
      }
      if (Object.keys(campos).length > 0) setErrosCampo(campos)
      const mensagemTopo = detail?.erro
      if (mensagemTopo) setAviso(mensagemTopo)
      else if (Object.keys(campos).length > 0) setAviso('Confira os campos destacados abaixo.')
      else setAviso(getErrorMessage(e))
    } finally {
      setSalvando(false)
    }
  }

  const encerrar = async (item: DecisaoItem) => {
    if (resultado.trim() === '') {
      setAviso('Escreva o resultado da revisão antes de encerrar.')
      return
    }
    setFechando(item.id)
    setAviso(null)
    try {
      await pb.send(`/backend/v1/decisions/${item.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ review_outcome: resultado }),
      })
      setResultado('')
      setFechando(null)
      setAviso('Decisão encerrada com o resultado da revisão registrado.')
      await carregar()
    } catch (e) {
      setAviso(getErrorMessage(e))
    } finally {
      setFechando(null)
    }
  }

  const badgeEstado = (estado: string) => {
    if (estado === 'closed') return <Badge variant="secondary">Encerrada</Badge>
    if (estado === 'in_review') return <Badge className="bg-sky-100 text-sky-800">Em revisão</Badge>
    return <Badge className="bg-amber-100 text-amber-800">Aberta</Badge>
  }

  const vencida = (item: DecisaoItem) =>
    item.state !== 'closed' &&
    item.review_date !== null &&
    item.review_date < new Date().toISOString().slice(0, 10)

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6">
      <CabecalhoPagina
        titulo="Decisões com revisão agendada"
        descricao="Toda decisão precisa de responsável e data de revisão futura — o servidor recusa decisão sem prazo. O lembrete automático chega no próximo passo (card a434ca96)."
      />

      {user && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            Logado como <strong>{String(user.email ?? '')}</strong>
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
            <Scale className="h-4 w-4 text-[#6C3EF5]" />
            Nova decisão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="ex.: Pausar campanha de YouTube"
              />
              {errosCampo.title && <p className="text-xs text-red-600">{errosCampo.title}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa *</Label>
              <Textarea
                rows={3}
                value={form.justification}
                onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder="por que esta decisão"
              />
              {errosCampo.justification && (
                <p className="text-xs text-red-600">{errosCampo.justification}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Ação planejada *</Label>
              <Textarea
                rows={3}
                value={form.planned_action}
                onChange={(e) => setForm((f) => ({ ...f, planned_action: e.target.value }))}
                placeholder="o que será feito"
              />
              {errosCampo.planned_action && (
                <p className="text-xs text-red-600">{errosCampo.planned_action}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Responsável (ID do usuário) *</Label>
              <Input
                value={form.responsible_user}
                onChange={(e) => setForm((f) => ({ ...f, responsible_user: e.target.value }))}
                placeholder="ID do usuário responsável"
              />
              {errosCampo.responsible_user && (
                <p className="text-xs text-red-600">{errosCampo.responsible_user}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Data de revisão *</Label>
              <Input
                type="date"
                min={AMANHA}
                value={form.review_date}
                onChange={(e) => setForm((f) => ({ ...f, review_date: e.target.value }))}
              />
              {errosCampo.review_date && (
                <p className="text-xs text-red-600">{errosCampo.review_date}</p>
              )}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Escopo (opcional — ex.: meta_ads, google_ads)</Label>
              <Input
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                placeholder="meta_ads"
              />
              {errosCampo.scope && <p className="text-xs text-red-600">{errosCampo.scope}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Registrar decisão'}
            </Button>
            <span className="text-xs text-[#6B7280]">
              * obrigatórios — revisão a partir de amanhã.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decisões registradas</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-[#6B7280]">Carregando…</p>
          ) : erro ? (
            <p className="text-sm text-red-600">{erro}</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-[#6B7280]">
              Nenhuma decisão ainda — o formulário acima registra a primeira.
            </p>
          ) : (
            <div className="space-y-3">
              {itens.map((it) => (
                <div
                  key={it.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {badgeEstado(it.state)}
                    <span className="text-xs text-[#6B7280]">rev. {it.revision}</span>
                    <span
                      className={
                        vencida(it) ? 'text-xs font-medium text-red-700' : 'text-xs text-[#6B7280]'
                      }
                    >
                      revisão em {it.review_date}
                      {vencida(it) ? ' (vencida)' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{it.title}</p>
                  <p className="text-xs text-[#6B7280]">Ação: {it.planned_action}</p>
                  {it.state !== 'closed' && (
                    <div className="space-y-2 pt-1">
                      <Input
                        value={fechando === it.id ? resultado : resultado}
                        onChange={(e) => setResultado(e.target.value)}
                        placeholder="resultado da revisão (obrigatório p/ encerrar)"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => encerrar(it)}
                        disabled={fechando === it.id}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Encerrar
                      </Button>
                    </div>
                  )}
                  {it.state === 'closed' && it.review_outcome && (
                    <p className="text-xs text-emerald-700 flex items-center gap-1">
                      <Archive className="h-3.5 w-3.5" />
                      Resultado: {it.review_outcome} · encerrada em{' '}
                      {String(it.closed_at ?? '').slice(0, 10)}
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
