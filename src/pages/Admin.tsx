import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import pb from '@/lib/pocketbase/client'
import { Dica } from '@/components/base/dica'
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
              <Dica texto="Liga ou desliga o envio de e-mail de aviso de lead novo">
                <Switch checked={emailAtivo} onCheckedChange={setEmailAtivo} />
              </Dica>
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
              <Dica texto="Liga ou desliga o resumo diário no WhatsApp da gestão">
                <Switch checked={resumoAtivo} onCheckedChange={setResumoAtivo} />
              </Dica>
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
