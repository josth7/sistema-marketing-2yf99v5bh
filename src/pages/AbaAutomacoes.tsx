import { useCallback, useEffect, useState } from 'react'
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
import pb from '@/lib/pocketbase/client'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/components/base/estados'

/**
 * Aba Automações — campanha de promoção (CA-3-53, SPEC-3-012, 05/11).
 *
 * **O que ela faz:** a gestão monta a campanha, vê a PRÉVIA (quem recebe e
 * quantos ficam de fora) e aprova. Nada sai sem aprovação.
 *
 * **Decisões do dono (05/11):**
 *   - campanha é criada só pela gestão (a rota recusa vendedor com 403);
 *   - teto de **200 mensagens por dia** por número, ritmo de **20 por hora**.
 *
 * **A prévia é o ponto:** ela mostra quantos contatos saem de cada motivo —
 * opt-out, número interno, duplicado e "nunca conversou". Sem isso a gestão
 * dispara no escuro e o número é bloqueado pela Meta.
 */

interface Campanha {
  id: string
  nome: string
  estado: string
  ritmo_hora: number
  teto_dia: number
  criado: string
}

interface Previa {
  total_base: number
  opt_out: number
  internos: number
  duplicados: number
  frios: number
  receberao: number
  duracao_horas: number
  dias_estimados: number
  exemplos: { nome: string; telefone: string; status: string }[]
}

interface Conexao {
  id: string
  nome_exibicao: string
  numero: string
  papel: string
}

const ROTULO_ESTADO: Record<string, string> = {
  rascunho: 'Rascunho',
  aprovada: 'Aprovada',
  pausada: 'Pausada',
  concluida: 'Concluída',
}

export default function AbaAutomacoes() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [conexoes, setConexoes] = useState<Conexao[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)

  // formulário
  const [nome, setNome] = useState('')
  const [conexao, setConexao] = useState('')
  const [modelo, setModelo] = useState('')
  const [criando, setCriando] = useState(false)
  // CA-3-81 (06/11): lista de modelos APROVADOS do número + prévia real.
  // Antes o nome era digitado à mão: uma letra errada fazia a Meta recusar
  // o envio de toda a campanha.
  const [modelos, setModelos] = useState<
    { nome: string; categoria: string; cabecalho: string; corpo: string }[]
  >([])
  const [avisoModelos, setAvisoModelos] = useState('')
  const [previa, setPrevia] = useState<{
    corpo: string
    cabecalho: string
    contato_exemplo: string
    aviso: string
  } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/campanhas', { method: 'GET' })) as {
        ok: boolean
        itens: Campanha[]
        erro?: string
      }
      if (!r.ok) {
        setErro(r.erro || 'Não consegui carregar as campanhas.')
      } else {
        setCampanhas(r.itens || [])
      }
      const c = (await pb.send('/backend/v1/whatsapp/conexoes', { method: 'GET' })) as {
        itens: Conexao[]
      }
      const ativas = (c.itens || []).filter((x) => x.papel === 'vendedor' || x.papel === 'central')
      setConexoes(ativas)
      if (conexao === '') {
        const central = ativas.find((x) => x.papel === 'central')
        if (central) setConexao(central.id)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [conexao])

  useEffect(() => {
    void carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ao definir/trocar o número, busca os modelos aprovados dele
  useEffect(() => {
    if (conexao !== '') void carregarModelos(conexao)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexao])

  // carrega os modelos aprovados do número escolhido
  const carregarModelos = useCallback(async (cxId: string) => {
    if (cxId === '') return
    try {
      const r = (await pb.send('/backend/v1/campanhas/modelos?conexao=' + cxId, {
        method: 'GET',
      })) as {
        ok: boolean
        modelos: { nome: string; categoria: string; cabecalho: string; corpo: string }[]
        aviso: string
      }
      setModelos(r.modelos || [])
      setAvisoModelos(r.aviso || '')
    } catch {
      setModelos([])
      setAvisoModelos('Não consegui buscar os modelos agora.')
    }
  }, [])

  const verPreviaModelo = async (cxId: string, nomeModelo: string) => {
    if (cxId === '' || nomeModelo === '') return
    try {
      const r = (await pb.send(
        '/backend/v1/campanhas/previa-modelo?conexao=' +
          cxId +
          '&modelo=' +
          encodeURIComponent(nomeModelo),
        { method: 'GET' },
      )) as { corpo: string; cabecalho: string; contato_exemplo: string; aviso: string }
      setPrevia(r)
    } catch {
      setPrevia(null)
    }
  }

  const criar = async () => {
    if (nome.trim() === '' || conexao === '' || modelo.trim() === '') {
      setErro('Preencha nome, número e modelo antes de criar.')
      return
    }
    setCriando(true)
    setErro('')
    setAviso('')
    try {
      const r = (await pb.send('/backend/v1/campanhas', {
        method: 'POST',
        body: JSON.stringify({ nome: nome.trim(), conexao: conexao, modelo_nome: modelo.trim() }),
        headers: { 'Content-Type': 'application/json' },
      })) as { ok: boolean; id: string; ritmo_hora: number; teto_dia: number }
      setAviso('Campanha criada como rascunho. Veja a prévia e aprove antes de iniciar.')
      setNome('')
      setModelo('')
      await carregar()
      if (r.id) await verPrevia(r.id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCriando(false)
    }
  }

  const verPrevia = async (id: string) => {
    setErro('')
    try {
      const p = (await pb.send('/backend/v1/campanhas/' + id + '/previa', {
        method: 'GET',
      })) as Previa
      setPrevia(p)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const aprovar = async (id: string) => {
    setErro('')
    try {
      await pb.send('/backend/v1/campanhas/' + id + '/aprovar', { method: 'POST' })
      setAviso('Campanha aprovada. O disparo entra no próximo passo do card.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const pausar = async (id: string) => {
    setErro('')
    try {
      await pb.send('/backend/v1/campanhas/' + id + '/pausar', {
        method: 'POST',
        body: JSON.stringify({ motivo: 'pausada pela tela' }),
        headers: { 'Content-Type': 'application/json' },
      })
      setAviso('Campanha pausada.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        Teto de <strong>200 mensagens por dia</strong> e ritmo de <strong>20 por hora</strong>. Nada
        sai sem aprovação.
      </div>

      {aviso && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {aviso}
        </div>
      )}
      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {carregando && <EstadoCarregando />}

      {!carregando && (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm font-semibold">Nova campanha</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nome da campanha</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Promoção de novembro"
              />
            </div>
            <div className="space-y-1">
              <Label>Número que envia</Label>
              <Select value={conexao} onValueChange={setConexao}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o número" />
                </SelectTrigger>
                <SelectContent>
                  {conexoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_exibicao} — {c.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Modelo aprovado</Label>
              {modelos.length > 0 ? (
                <Select
                  value={modelo}
                  onValueChange={(v) => {
                    setModelo(v)
                    void verPreviaModelo(conexao, v)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um modelo aprovado" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m) => (
                      <SelectItem key={m.nome} value={m.nome}>
                        {m.nome}
                        {m.categoria ? ' — ' + m.categoria : ''}
                        {m.cabecalho ? ' · ' + m.cabecalho : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Nome exato do modelo aprovado na Meta"
                />
              )}
              <p className="text-xs text-muted-foreground">
                {avisoModelos !== ''
                  ? avisoModelos
                  : 'Fora da janela de 24h a Meta só aceita modelo aprovado.'}
              </p>
              {modelo !== '' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void verPreviaModelo(conexao, modelo)}
                >
                  Ver prévia
                </Button>
              )}
              {previa && (
                <div className="space-y-1 rounded-md border border-emerald-300 bg-emerald-50/50 p-2">
                  <p className="text-xs font-semibold">Como o cliente vai receber</p>
                  {previa.cabecalho !== '' && (
                    <p className="text-xs text-muted-foreground">Cabeçalho: {previa.cabecalho}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{previa.corpo || '(sem corpo)'}</p>
                  {previa.contato_exemplo !== '' && (
                    <p className="text-xs text-muted-foreground">
                      Variáveis com: {previa.contato_exemplo}
                    </p>
                  )}
                  {previa.aviso !== '' && <p className="text-xs text-amber-700">{previa.aviso}</p>}
                </div>
              )}
            </div>
          </div>
          <Button onClick={() => void criar()} disabled={criando}>
            {criando ? 'Criando…' : 'Criar rascunho'}
          </Button>
        </div>
      )}

      {previa && (
        <div className="space-y-2 rounded-lg border border-emerald-300 p-3">
          <p className="text-sm font-semibold">Prévia da base</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <p>
              Base total: <strong>{previa.total_base}</strong>
            </p>
            <p>
              Nunca conversaram: <strong>{previa.frios}</strong>
            </p>
            <p>
              Opt-out: <strong>{previa.opt_out}</strong>
            </p>
            <p>
              Números internos: <strong>{previa.internos}</strong>
            </p>
            <p>
              Duplicados: <strong>{previa.duplicados}</strong>
            </p>
            <p className="text-emerald-700">
              Receberão: <strong>{previa.receberao}</strong>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Duração: {previa.duracao_horas}h no ritmo de 20/h · cerca de {previa.dias_estimados}{' '}
            dia(s) no teto de 200/dia.
          </p>
          {previa.exemplos.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Exemplos: {previa.exemplos.map((e) => e.nome || e.telefone).join(', ')}
            </div>
          )}
        </div>
      )}

      {!carregando && campanhas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma campanha ainda"
          descricao="Crie o rascunho acima, veja a prévia e aprove. Só depois disso o disparo pode começar."
        />
      )}

      {!carregando &&
        campanhas.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.nome}</p>
              <p className="text-xs text-muted-foreground">
                {c.ritmo_hora}/hora · teto {c.teto_dia}/dia · criada {c.criado}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={c.estado === 'aprovada' ? 'default' : 'secondary'}>
                {ROTULO_ESTADO[c.estado] || c.estado}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => void verPrevia(c.id)}>
                Ver prévia
              </Button>
              {(c.estado === 'rascunho' || c.estado === 'pausada') && (
                <Button size="sm" onClick={() => void aprovar(c.id)}>
                  Aprovar
                </Button>
              )}
              {c.estado === 'aprovada' && (
                <Button size="sm" variant="outline" onClick={() => void pausar(c.id)}>
                  Pausar
                </Button>
              )}
            </div>
          </div>
        ))}
    </div>
  )
}
