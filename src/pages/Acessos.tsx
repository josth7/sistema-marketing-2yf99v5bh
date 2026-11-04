import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

/**
 * Tela Equipe e acessos (SPEC-3-006, CA-3-30).
 *
 * Responde duas perguntas que hoje só a migração respondia:
 *   1. "Quem é quem" — cada pessoa com cargo, quantos leads tem na carteira,
 *      quais números vê, quais módulos o menu libera e se a senha ainda é a
 *      provisória do time.
 *   2. "Quem cuida de cada número" — a aba Por número, que é a pergunta
 *      inversa e a mais útil quando o cliente liga reclamando.
 *
 * Só a gestão entra: a rota devolve 403 sem `manage_access`.
 * Esta tela é SOMENTE LEITURA. Mudar acesso é o card seguinte
 * ("Mudar o cargo e os acessos de cada pessoa, com travas de segurança").
 */

type Pessoa = {
  id: string
  nome: string
  email: string
  papeis: string[]
  cargo: string
  acoes: number
  modo_escopo: string
  modulos: string[]
  numeros: string[]
  leads_ativos: number
  ativa: boolean
  vence_em: string
  senha_provisoria: boolean
  conta_teste: boolean
}

type Acao = { id: string; rotulo: string; grupo: string }

type Numero = {
  id: string
  numero: string
  nome: string
  papel: string
  vendedor: string
  quem_ve: string[]
  conversas: number
  ativo: boolean
}

/** 5541997213499 -> (41) 9721-3499 */
function bonito(numero: string): string {
  const d = String(numero || '').replace(/\D/g, '')
  if (d.length === 13) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9)
  if (d.length === 12) return '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8)
  return numero || '—'
}

const COR_CARGO: Record<string, string> = {
  direction: 'bg-purple-100 text-purple-800',
  management: 'bg-indigo-100 text-indigo-800',
  vendedor: 'bg-emerald-100 text-emerald-800',
  marketing: 'bg-sky-100 text-sky-800',
}

export default function Acessos() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [equipe, setEquipe] = useState<Pessoa[]>([])
  const [numeros, setNumeros] = useState<Numero[]>([])
  const [aba, setAba] = useState<'equipe' | 'numeros' | 'historico'>('equipe')
  const [soAtivas, setSoAtivas] = useState(false)

  // ---- edição de acesso (CA-3-31) ----
  const [acoes, setAcoes] = useState<Acao[]>([])
  const [editando, setEditando] = useState<Pessoa | null>(null)
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoCargo, setNovoCargo] = useState('vendedor')
  const [erroCriar, setErroCriar] = useState('')
  const [resultadoCriar, setResultadoCriar] = useState<{
    email: string
    senha: string
    cargo: string
    expira: string
  } | null>(null)
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [escopoTodos, setEscopoTodos] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [avisoEdicao, setAvisoEdicao] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [senhaAviso, setSenhaAviso] = useState('')
  // histórico (CA-3-35)
  const [historico, setHistorico] = useState<
    { id: string; quando: string; quem: string; acao_texto: string; alvo: string }[]
  >([])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const a = (await pb.send('/backend/v1/acessos/equipe', { method: 'GET' })) as {
        ok?: boolean
        itens?: Pessoa[]
      }
      setEquipe(a.itens || [])
      try {
        const b = (await pb.send('/backend/v1/acessos/por-numero', { method: 'GET' })) as {
          itens?: Numero[]
        }
        setNumeros(b.itens || [])
      } catch {
        // a aba por número é complementar: se falhar, a de equipe continua
      }
      try {
        const c = (await pb.send('/backend/v1/acessos/acoes', { method: 'GET' })) as {
          acoes?: Acao[]
        }
        setAcoes(c.acoes || [])
      } catch {
        // sem o catálogo a edição não abre; a leitura continua funcionando
      }
      try {
        const h = (await pb.send('/backend/v1/acessos/auditoria', { method: 'GET' })) as {
          itens?: { id: string; quando: string; quem: string; acao_texto: string; alvo: string }[]
        }
        setHistorico(h.itens || [])
      } catch {
        //
      }
    } catch (e) {
      setErro(
        e instanceof Error && e.message.indexOf('403') >= 0
          ? 'Só a gestão (permissão de acessos) abre esta tela.'
          : 'Não consegui carregar: ' + (e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  /** abre o diálogo com o estado atual da pessoa */
  const abrirEdicao = (p: Pessoa) => {
    // as ações reais vêm do detalhe: a lista da equipe só traz a contagem
    setEditando(p)
    setMarcadas([])
    setEscopoTodos(p.modo_escopo === 'todos')
    setAvisoEdicao('')
    setNovaSenha('')
    setSenhaAviso('')
    void (async () => {
      try {
        const r = (await pb.send('/backend/v1/acessos/pessoa/' + p.id + '/detalhe', {
          method: 'GET',
        })) as { acoes?: string[] }
        setMarcadas(r.acoes || [])
      } catch {
        setAvisoEdicao('Não consegui ler as ações desta pessoa.')
      }
    })()
  }

  const alternar = (id: string) => {
    setMarcadas((atual) =>
      atual.indexOf(id) >= 0 ? atual.filter((a) => a !== id) : [...atual, id],
    )
  }

  const salvarAcesso = async () => {
    if (!editando || salvando) return
    setSalvando(true)
    setAvisoEdicao('')
    try {
      await pb.send('/backend/v1/acessos/pessoa/' + editando.id, {
        method: 'POST',
        body: JSON.stringify({
          acoes: marcadas,
          escopo: escopoTodos ? 'todos' : 'proprio',
        }),
        headers: { 'Content-Type': 'application/json' },
      })
      setAvisoEdicao('Acesso salvo. O menu da pessoa muda no próximo acesso.')
      await carregar()
    } catch (e) {
      setAvisoEdicao('Não salvei: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSalvando(false)
    }
  }

  const redefinirSenha = async () => {
    if (!editando) return
    if (novaSenha.length < 8) {
      setSenhaAviso('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    setSenhaAviso('')
    try {
      await pb.send('/backend/v1/acessos/pessoa/' + editando.id + '/senha', {
        method: 'POST',
        body: JSON.stringify({ senha: novaSenha }),
        headers: { 'Content-Type': 'application/json' },
      })
      setSenhaAviso('Senha redefinida. A pessoa troca no primeiro acesso.')
      setNovaSenha('')
    } catch (e) {
      setSenhaAviso('Não redefini: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const suspender = async (p: Pessoa) => {
    const certeza = window.confirm(
      'Suspender ' +
        (p.nome || p.email) +
        '?\n\nIsso bloqueia o login na hora, revoga os acessos, fecha os números de WhatsApp dela e devolve os ' +
        p.leads_ativos +
        ' lead(s) da carteira para o rodízio.\n\nNada é apagado e dá para reativar depois.',
    )
    if (!certeza) return
    try {
      const r = (await pb.send('/backend/v1/acessos/pessoa/' + p.id + '/suspender', {
        method: 'POST',
        body: JSON.stringify({ motivo: 'suspenso pela tela de acessos' }),
        headers: { 'Content-Type': 'application/json' },
      })) as { leads_redistribuidos?: number; grants_revogados?: number }
      window.alert(
        'Suspenso.\n\nAcessos revogados: ' +
          (r.grants_revogados ?? 0) +
          '\nLeads devolvidos ao rodízio: ' +
          (r.leads_redistribuidos ?? 0),
      )
      await carregar()
    } catch (e) {
      window.alert('Não suspendi: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const criarPessoa = async () => {
    setErroCriar('')
    if (novoNome.trim() === '') return setErroCriar('Informe o nome.')
    if (!novoEmail.includes('@')) return setErroCriar('E-mail inválido.')
    try {
      const r = (await pb.send('/backend/v1/acessos/pessoa/nova', {
        method: 'POST',
        body: JSON.stringify({
          nome: novoNome.trim(),
          email: novoEmail.trim(),
          cargo: novoCargo,
        }),
        headers: { 'Content-Type': 'application/json' },
      })) as {
        ok: boolean
        email: string
        senha_provisoria: string
        cargo: string
        expira_em: string
      }
      setResultadoCriar({
        email: String(r.email),
        senha: String(r.senha_provisoria),
        cargo: String(r.cargo),
        expira: String(r.expira_em).slice(0, 10),
      })
      setNovoNome('')
      setNovoEmail('')
      setNovoCargo('vendedor')
      await carregar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErroCriar(msg.includes('já existe') ? 'Já existe alguém com este e-mail.' : msg)
    }
  }

  const lista = soAtivas ? equipe.filter((p) => p.ativa) : equipe

  if (carregando) return <EstadoCarregando />
  if (erro !== '') return <EstadoErro mensagem={erro} aoTentarNovamente={() => void carregar()} />

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Equipe e acessos"
        descricao="Quem é quem, o que cada pessoa vê e por qual número de WhatsApp."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={aba === 'equipe' ? 'default' : 'outline'}
          onClick={() => setAba('equipe')}
        >
          Pessoas
        </Button>
        <Button
          size="sm"
          variant={aba === 'numeros' ? 'default' : 'outline'}
          onClick={() => setAba('numeros')}
        >
          Por número
        </Button>
        <Button
          size="sm"
          variant={aba === 'historico' ? 'default' : 'outline'}
          onClick={() => setAba('historico')}
        >
          Histórico
        </Button>
        {aba === 'equipe' && (
          <Button
            size="sm"
            variant={soAtivas ? 'default' : 'outline'}
            onClick={() => setSoAtivas((v) => !v)}
          >
            Só quem tem acesso
          </Button>
        )}
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => {
            setResultadoCriar(null)
            setErroCriar('')
            setCriando(true)
          }}
        >
          + Nova pessoa
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {aba === 'equipe' && (
        <>
          {lista.length === 0 && <EstadoVazio titulo="Ninguém encontrado" />}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((p) => (
              <Card key={p.id} className={p.ativa ? '' : 'opacity-60'}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm">{p.nome || p.email}</CardTitle>
                      <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>
                    </div>
                    <Badge
                      className={
                        'shrink-0 text-[10px] ' +
                        (COR_CARGO[p.papeis[0] || ''] || 'bg-gray-100 text-gray-600')
                      }
                    >
                      {p.cargo}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0 text-[11px]">
                  <p>
                    <span className="text-muted-foreground">Leads na carteira: </span>
                    <strong className="tabular-nums">{p.leads_ativos}</strong>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Vê: </span>
                    {p.modo_escopo === 'todos' ? 'tudo' : 'só o que é dele'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Números: </span>
                    {p.numeros.length === 0 ? '—' : p.numeros.map(bonito).join(' · ')}
                  </p>
                  <p className="text-muted-foreground">
                    {p.modulos.length} módulo(s): {p.modulos.slice(0, 4).join(', ')}
                    {p.modulos.length > 4 ? '…' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {!p.ativa && (
                      <Badge variant="outline" className="text-[10px]">
                        sem acesso
                      </Badge>
                    )}
                    {p.senha_provisoria && p.ativa && (
                      <Badge className="bg-amber-100 text-[10px] text-amber-800">
                        senha provisória
                      </Badge>
                    )}
                    {p.conta_teste && (
                      <Badge variant="outline" className="text-[10px]">
                        conta de teste
                      </Badge>
                    )}
                    {p.vence_em !== '' && (
                      <Badge variant="outline" className="text-[10px]">
                        até {p.vence_em}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => abrirEdicao(p)}
                    >
                      Editar
                    </Button>
                    {p.ativa && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => void suspender(p)}
                      >
                        Suspender
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ---------- diálogo de edição (CA-3-31) ---------- */}
      <Dialog open={criando} onOpenChange={(v) => !v && setCriando(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar pessoa nova</DialogTitle>
            <DialogDescription>
              A pessoa nasce com senha provisória de 72 horas e é obrigada a trocar no primeiro
              acesso. O cargo define o que ela vê no menu — e o escopo começa fechado: só o que for
              dela.
            </DialogDescription>
          </DialogHeader>

          {resultadoCriar ? (
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
                <p className="font-medium">Pronto. Passe estes dados para a pessoa:</p>
                <p className="mt-2">
                  <span className="text-muted-foreground">E-mail: </span>
                  <strong>{resultadoCriar.email}</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Senha provisória: </span>
                  <strong>{resultadoCriar.senha}</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Cargo: </span>
                  <strong>{resultadoCriar.cargo}</strong>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ela entra em app.adapta.one, troca a senha e passa a ver só o que é dela. A senha
                  provisória expira em 72h ({resultadoCriar.expira}).
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResultadoCriar(null)}>
                  Cadastrar outra
                </Button>
                <Button onClick={() => setCriando(false)}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={novoNome}
                  onChange={(ev) => setNovoNome(ev.target.value)}
                  placeholder="Ex.: Fabio Teles"
                />
              </div>
              <div>
                <label className="text-sm font-medium">E-mail da empresa</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={novoEmail}
                  onChange={(ev) => setNovoEmail(ev.target.value)}
                  placeholder="nome@haisan.com.br"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Cargo</label>
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={novoCargo}
                  onChange={(ev) => setNovoCargo(ev.target.value)}
                >
                  <option value="vendedor">
                    Vendedor — vê os leads e conversas da carteira dela
                  </option>
                  <option value="marketing">
                    Marketing — painel, critérios, alertas, relatórios
                  </option>
                  <option value="financeiro">Financeiro — painel e relatórios</option>
                  <option value="gestao">Gestão — tudo, inclusive acessos</option>
                </select>
              </div>
              {erroCriar && <p className="text-sm text-destructive">{erroCriar}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCriando(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void criarPessoa()}>Cadastrar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar acesso — {editando?.nome || editando?.email}</DialogTitle>
            <DialogDescription>
              O que marcar aqui é exatamente o que a pessoa vê no menu. As travas do servidor
              impedem mudar o próprio acesso e deixar o sistema sem ninguém que gerencie acessos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={escopoTodos} onCheckedChange={(v) => setEscopoTodos(v === true)} />
              Vê os dados de <strong>todos</strong> (sem marcar, vê só o que é dela)
            </label>

            {['Base', 'CRM', 'WhatsApp', 'Marketing', 'Administração'].map((grupo) => {
              const doGrupo = acoes.filter((a) => a.grupo === grupo)
              if (doGrupo.length === 0) return null
              return (
                <div key={grupo} className="rounded-md border p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    {grupo}
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {doGrupo.map((a) => (
                      <label key={a.id} className="flex items-start gap-2 text-xs">
                        <Checkbox
                          checked={marcadas.indexOf(a.id) >= 0}
                          onCheckedChange={() => alternar(a.id)}
                        />
                        {a.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {avisoEdicao !== '' && <p className="text-[11px] text-muted-foreground">{avisoEdicao}</p>}

          <div className="rounded-md border border-dashed p-2">
            <p className="mb-1 text-[11px] font-semibold">Redefinir senha</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={novaSenha}
                onChange={(ev) => setNovaSenha(ev.target.value)}
                placeholder="nova senha (mín. 8)"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
              <Button size="sm" variant="outline" onClick={() => void redefinirSenha()}>
                Redefinir
              </Button>
            </div>
            {senhaAviso !== '' && (
              <p className="mt-1 text-[11px] text-muted-foreground">{senhaAviso}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>
              Fechar
            </Button>
            <Button onClick={() => void salvarAcesso()} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar acesso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aba === 'historico' && (
        <>
          {historico.length === 0 && <EstadoVazio titulo="Nenhuma mudança registrada ainda" />}
          <div className="space-y-1">
            {historico.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-baseline gap-2 rounded border px-2 py-1.5 text-xs"
              >
                <span className="tabular-nums text-muted-foreground">{h.quando}</span>
                <strong>{h.quem}</strong>
                <span>{h.acao_texto}</span>
                {h.alvo !== '' && <span className="text-muted-foreground">→ {h.alvo}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {aba === 'numeros' && (
        <>
          {numeros.length === 0 && <EstadoVazio titulo="Nenhum número cadastrado" />}
          <div className="space-y-2">
            {numeros.map((n) => (
              <Card key={n.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {bonito(n.numero)}{' '}
                      <span className="font-normal text-muted-foreground">· {n.nome}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Quem vê: {n.quem_ve.length === 0 ? '—' : n.quem_ve.join(' · ')}
                    </p>
                  </div>
                  <Badge
                    className={
                      'text-[10px] ' +
                      (n.papel === 'central'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-800')
                    }
                  >
                    {n.papel}
                  </Badge>
                  <p className="tabular-nums text-muted-foreground">{n.conversas} conversa(s)</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
