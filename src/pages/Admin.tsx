import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import { Dica } from '@/components/base/dica'
import { ChaveEstado } from '@/components/base/chave-estado'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Administração — avisos liga/desliga (CA-3-48, SPEC-3-010, 06/11).
 *
 * **O que se controla aqui:**
 *   1. **Aviso por e-mail** — quem recebe os avisos de lead novo. Nasce DESLIGADO.
 *   2. **Resumo no WhatsApp** — quem recebe, em que horários e em que dias.
 *      Nasce DESLIGADO.
 *   3. **Quem pode responder pelo sistema** — lista de pessoas liberadas.
 *
 * **Versionado:** cada salvamento cria uma versão com autor. Nada é apagado —
 * a lista de versões embaixo permite voltar para qualquer uma.
 *
 * Só a gestão entra aqui (a rota recusa os demais com 403).
 */

interface Config {
  id: string
  versao: number
  email_ativo: boolean
  email_destinatarios: string[]
  resumo_ativo: boolean
  resumo_horarios: string[]
  resumo_dias: string[]
  resumo_destinatarios: string[]
  responder_sistema: string[]
  autor_nome: string
  observacao: string
  criado: string
}

interface VendedorApres {
  conexao: string
  nome: string
  numero: string
  ativa: boolean
  modelo: string
  segredo_ok: boolean
}

interface Pessoa {
  id: string
  nome: string
}

const DIAS = [
  { v: '1', r: 'Seg' },
  { v: '2', r: 'Ter' },
  { v: '3', r: 'Qua' },
  { v: '4', r: 'Qui' },
  { v: '5', r: 'Sex' },
  { v: '6', r: 'Sáb' },
  { v: '0', r: 'Dom' },
]

export default function Admin() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [config, setConfig] = useState<Config | null>(null)
  const [historico, setHistorico] = useState<Config[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])

  // formulário
  const [emailAtivo, setEmailAtivo] = useState(false)
  const [emailDest, setEmailDest] = useState<string[]>([])
  const [resumoAtivo, setResumoAtivo] = useState(false)
  const [resumoDest, setResumoDest] = useState<string[]>([])
  const [resumoHor, setResumoHor] = useState('08:00')
  const [resumoDias, setResumoDias] = useState<string[]>(['1', '2', '3', '4', '5'])
  const [responder, setResponder] = useState<string[]>([])
  // CA-3-80 (06/11): apresentação por número — o vendedor se apresenta ao
  // cliente 15 min depois da transferência, usando modelo aprovado.
  const [apres, setApres] = useState<VendedorApres[]>([])
  const [modeloPorCx, setModeloPorCx] = useState<Record<string, string>>({})
  // 09/11: erro do interruptor de apresentação, mostrado AO LADO dele.
  // Antes o texto caía no erro geral e a página parecia sumir ("Something went
  // wrong") sem dizer o motivo da recusa.
  const [erroApres, setErroApres] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/admin/config', { method: 'GET' })) as {
        ok: boolean
        atual: Config | null
        historico: Config[]
        pessoas: Pessoa[]
        erro?: string
      }
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar a configuração.')
      } else {
        setConfig(r.atual)
        setHistorico(r.historico || [])
        setPessoas(r.pessoas || [])
        // apresentação por número
        try {
          const ap = (await pb.send('/backend/v1/atendimento/apresentacao', {
            method: 'GET',
          })) as { ok: boolean; itens: VendedorApres[] }
          setApres(ap.itens || [])
          const m: Record<string, string> = {}
          for (const i of ap.itens || []) m[i.conexao] = i.modelo
          setModeloPorCx(m)
        } catch {
          setApres([])
        }
        if (r.atual) {
          setEmailAtivo(r.atual.email_ativo)
          setEmailDest(r.atual.email_destinatarios || [])
          setResumoAtivo(r.atual.resumo_ativo)
          setResumoDest(r.atual.resumo_destinatarios || [])
          setResumoHor((r.atual.resumo_horarios || ['08:00'])[0] || '08:00')
          setResumoDias(r.atual.resumo_dias || ['1', '2', '3', '4', '5'])
          setResponder(r.atual.responder_sistema || [])
        }
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

  const alterna = (lista: string[], id: string) =>
    lista.indexOf(id) >= 0 ? lista.filter((x) => x !== id) : lista.concat([id])

  const salvar = async () => {
    setSalvando(true)
    setErro('')
    setAviso('')
    try {
      const r = (await pb.send('/backend/v1/admin/config', {
        method: 'POST',
        body: JSON.stringify({
          email_ativo: emailAtivo,
          email_destinatarios: emailDest,
          resumo_ativo: resumoAtivo,
          resumo_destinatarios: resumoDest,
          resumo_horarios: resumoHor ? [resumoHor] : [],
          resumo_dias: resumoDias,
          responder_sistema: responder,
        }),
        headers: { 'Content-Type': 'application/json' },
      })) as { ok: boolean; versao: number; autor: string }
      setAviso(
        'Salvo como versão ' +
          r.versao +
          ', por ' +
          r.autor +
          '. Para desfazer, use o histórico abaixo.',
      )
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const voltar = async (versao: number) => {
    setErro('')
    try {
      await pb.send('/backend/v1/admin/config/voltar', {
        method: 'POST',
        body: JSON.stringify({ versao }),
        headers: { 'Content-Type': 'application/json' },
      })
      setAviso('Voltou para a versão ' + versao + ' (criada como versão nova, nada foi apagado).')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const alternarApresentacao = async (cx: string, ativa: boolean, modelo: string) => {
    setErroApres('')
    try {
      await pb.send('/backend/v1/atendimento/apresentacao', {
        method: 'POST',
        body: JSON.stringify({ conexao: cx, ativa: ativa, modelo: modelo }),
        headers: { 'Content-Type': 'application/json' },
      })
      setAviso(ativa ? 'Apresentação ligada para este número.' : 'Apresentação desligada.')
      await carregar()
    } catch (e) {
      // o texto da recusa vem no campo `erro` da resposta; melhor mostrá-lo
      // do que deixar a tela parecer quebrada
      let texto = ''
      try {
        const qualquer = e as unknown as {
          data?: { erro?: string; detalhe?: string }
          status?: number
        }
        if (qualquer && qualquer.data) {
          texto = String(qualquer.data.erro || '')
          if (qualquer.data.detalhe) texto += ' — ' + String(qualquer.data.detalhe)
        }
      } catch (eLer) {}
      if (texto === '') texto = e instanceof Error ? e.message : String(e)
      setErroApres(texto)
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Administração"
        descricao="Liga e desliga os avisos do sistema. Cada alteração vira uma versão com autor e pode ser desfeita."
      />

      {aviso && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {aviso}
        </div>
      )}
      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && !erro && (
        <>
          {config && (
            <p className="text-sm text-muted-foreground">
              Versão atual: <strong>{config.versao}</strong>
              {config.autor_nome && ' · por ' + config.autor_nome}
            </p>
          )}

          {/* ---------- aviso por e-mail ---------- */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Aviso por e-mail</p>
                <p className="text-xs text-muted-foreground">
                  Manda um e-mail quando entra lead novo. Hoje está desligado.
                </p>
              </div>
              <ChaveEstado
                ligada={emailAtivo}
                dica="Liga ou desliga o envio de e-mail de aviso de lead novo"
                aoMudar={(novo) => setEmailAtivo(novo)}
              />
            </div>
            {emailAtivo && (
              <div className="space-y-1">
                <Label className="text-xs">Quem recebe</Label>
                <div className="flex flex-wrap gap-2">
                  {pessoas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setEmailDest((l) => alterna(l, p.id))}
                      className={
                        'rounded-md border px-2 py-1 text-xs ' +
                        (emailDest.indexOf(p.id) >= 0
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted')
                      }
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------- resumo no WhatsApp ---------- */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Resumo no WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Um resumo por dia com recebidos, distribuídos e quem precisa de ação. Desligado.
                </p>
              </div>
              <ChaveEstado
                ligada={resumoAtivo}
                dica="Liga ou desliga o resumo diário no WhatsApp da gestão"
                aoMudar={(novo) => setResumoAtivo(novo)}
              />
            </div>
            {resumoAtivo && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Horário</Label>
                  <Input
                    type="time"
                    value={resumoHor}
                    onChange={(e) => setResumoHor(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dias</Label>
                  <div className="flex flex-wrap gap-1">
                    {DIAS.map((d) => (
                      <button
                        key={d.v}
                        type="button"
                        onClick={() => setResumoDias((l) => alterna(l, d.v))}
                        className={
                          'rounded border px-2 py-1 text-xs ' +
                          (resumoDias.indexOf(d.v) >= 0
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground')
                        }
                      >
                        {d.r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Quem recebe</Label>
                  <div className="flex flex-wrap gap-2">
                    {pessoas.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setResumoDest((l) => alterna(l, p.id))}
                        className={
                          'rounded-md border px-2 py-1 text-xs ' +
                          (resumoDest.indexOf(p.id) >= 0
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted')
                        }
                      >
                        {p.nome}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ---------- quem responde pelo sistema ---------- */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-semibold">Quem pode responder pelo sistema</p>
            <p className="text-xs text-muted-foreground">
              Libera a pessoa a responder o cliente pela tela Conversas, com texto e mídia.
            </p>
            <div className="flex flex-wrap gap-2">
              {pessoas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setResponder((l) => alterna(l, p.id))}
                  className={
                    'rounded-md border px-2 py-1 text-xs ' +
                    (responder.indexOf(p.id) >= 0
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted')
                  }
                >
                  {p.nome}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- apresentação por número (CA-3-80) ---------- */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-semibold">Apresentação automática do vendedor</p>
              <p className="text-xs text-muted-foreground">
                15 minutos depois da transferência, o vendedor se apresenta ao cliente pelo WhatsApp
                dele. Exige modelo aprovado na Meta. Padrão: desligado.
              </p>
            </div>
            {apres.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum número de vendedor ativo para configurar.
              </p>
            )}
            {apres.map((v) => (
              <div
                key={v.conexao}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{v.nome}</p>
                  <p className="text-xs text-muted-foreground">{v.numero}</p>
                  {/* recusa do interruptor aparece AQUI, sem esconder a página */}
                  {erroApres !== '' && (
                    <p className="mt-1 max-w-md rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                      {erroApres}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-8 w-40 text-xs"
                    placeholder="modelo aprovado"
                    value={modeloPorCx[v.conexao] || ''}
                    onChange={(e) => setModeloPorCx((m) => ({ ...m, [v.conexao]: e.target.value }))}
                  />
                  <ChaveEstado
                    ligada={v.ativa}
                    dica="Liga a apresentação automática por este número (precisa de modelo aprovado)"
                    aoMudar={async (novo) => {
                      // se o servidor recusar, o componente volta ao estado
                      // anterior e mostra o motivo
                      await alternarApresentacao(
                        v.conexao,
                        novo,
                        modeloPorCx[v.conexao] || v.modelo,
                      )
                      if (erroApres !== '') throw new Error(erroApres)
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar como versão nova'}
          </Button>

          {/* ---------- histórico ---------- */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Histórico</p>
            {historico.length === 0 && (
              <EstadoVazio
                titulo="Só existe a versão atual"
                descricao="Cada vez que você salvar, as versões anteriores aparecem aqui para voltar."
              />
            )}
            {historico.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    Versão <strong>{h.versao}</strong>{' '}
                    {h.autor_nome && (
                      <span className="text-muted-foreground">· {h.autor_nome}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.criado} · e-mail {h.email_ativo ? 'ligado' : 'desligado'} · resumo{' '}
                    {h.resumo_ativo ? 'ligado' : 'desligado'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge variant="secondary">v{h.versao}</Badge>
                  <Button size="sm" variant="outline" onClick={() => void voltar(h.versao)}>
                    Voltar para esta
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
