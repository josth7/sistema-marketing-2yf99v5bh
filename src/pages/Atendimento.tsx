import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AbaAutomacoes from '@/pages/AbaAutomacoes'
import pb from '@/lib/pocketbase/client'
import { CabecalhoPagina, EstadoCarregando, EstadoErro } from '@/components/base/estados'

/**
 * Tela Atendimento — governança do robô da central (SPEC-3-005, painel da
 * gestão; criada em 04/11).
 *
 * A gestão (manage_atendimento):
 *   - liga e desliga o robô na hora (o mesmo botão existe na tela Conversas)
 *   - define o horário em que ele funciona (dias e horas de Brasília)
 *   - edita os textos de cada etapa, o FAQ e as palavras que o robô reconhece
 *   - cadastra os números da equipe (o robô nunca responde esses números)
 *   - vê as últimas respostas do robô e volta para uma versão anterior
 *
 * Cada salvamento é uma VERSÃO nova (com quem salvou e quando); o robô usa a
 * mais nova a partir do minuto seguinte. Texto apagado volta ao padrão.
 */

type Faq = { pergunta: string; chaves: string[]; resposta: string }
type Cfg = {
  versao: number
  ligado: boolean
  usar_horario: boolean
  dias: number[]
  hora_inicio: string
  hora_fim: string
  janela_min: number
  textos: Record<string, string>
  faq: Faq[]
  palavras: Record<string, string[]>
  observacao: string
  autor_nome: string
  criado: string
}
type Interno = { id: string; numero: string; rotulo: string }
type Resposta = {
  id: string
  criado: string
  estado: string
  erro: string
  texto: string
  lead_nome: string
}
type Estado = {
  ok: boolean
  pode_alterar: boolean
  ligado: boolean
  dentro_do_horario: boolean
  respondendo_agora: boolean
  hora_brasilia: string
  atual?: Cfg | null
  versoes?: Cfg[]
  internos?: Interno[]
  ultimas?: Resposta[]
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// textos na ordem da conversa, com o nome que a gestão entende
const TEXTOS: { chave: string; rotulo: string; dica?: string }[] = [
  { chave: 'menu_meta', rotulo: 'Boas-vindas e menu — quem vem de anúncio (Instagram/Facebook)' },
  { chave: 'menu_organico', rotulo: 'Boas-vindas e menu — demais contatos (Google, perfil, site)' },
  {
    chave: 'nao_entendi',
    rotulo: 'Quando não entende a escolha do menu',
    dica: 'Na segunda vez seguida, o robô passa para o vendedor.',
  },
  { chave: 'pergunta_origem', rotulo: 'Pergunta "de onde nos conheceu?"' },
  { chave: 'origem_invalida', rotulo: 'Quando não entende a origem' },
  { chave: 'origem_google', rotulo: 'Resposta para quem veio do Google' },
  { chave: 'origem_meta', rotulo: 'Resposta para quem veio do Instagram/Facebook' },
  { chave: 'abrindo_ampliando', rotulo: 'Pergunta "abrindo ou ampliando?" (quem vem de anúncio)' },
  { chave: 'cliente_ou_primeiro', rotulo: 'Pergunta "já é cliente ou é o primeiro contato?"' },
  { chave: 'pede_documento_vendas', rotulo: 'Pedido de CPF/CNPJ (já é cliente)' },
  { chave: 'pede_documento_manutencao', rotulo: 'Pedido de CPF/CNPJ (manutenção)' },
  { chave: 'documento_invalido', rotulo: 'Quando o CPF/CNPJ vem errado' },
  { chave: 'cliente_ok', rotulo: 'Depois do CPF/CNPJ (cliente)' },
  { chave: 'manutencao_ok', rotulo: 'Depois do CPF/CNPJ (manutenção)' },
  {
    chave: 'transferencia_consultor',
    rotulo: 'Transferência para o vendedor',
    dica: 'Use {nome} e {numero}: o sistema troca pelo vendedor dono do lead.',
  },
  {
    chave: 'transferencia_consultor_sem_numero',
    rotulo: 'Transferência quando o vendedor não tem número',
    dica: 'Use {nome}.',
  },
  { chave: 'encaminhar_humano', rotulo: 'Quando o cliente pede uma pessoa ou está irritado' },
  {
    chave: 'fora_escopo',
    rotulo: 'Quando o assunto foge do roteiro (preço, frete, prazo de um item…)',
  },
  {
    chave: 'horario',
    rotulo: 'Aviso de horário de atendimento',
    dica: 'Vai junto em toda transferência.',
  },
]

const PALAVRAS: { chave: string; rotulo: string }[] = [
  { chave: 'linha_barbearia', rotulo: 'Menu: Barbearia' },
  { chave: 'linha_salao', rotulo: 'Menu: Salão de Beleza' },
  { chave: 'linha_podologia', rotulo: 'Menu: Podologia ou Estética' },
  { chave: 'linha_manicure', rotulo: 'Menu: Manicure e Pedicure' },
  { chave: 'linha_manutencao', rotulo: 'Menu: Manutenção dos móveis' },
  { chave: 'ja_cliente', rotulo: 'Respostas que querem dizer "já sou cliente"' },
  { chave: 'humano', rotulo: 'Pede para falar com uma pessoa (transfere na hora)' },
  { chave: 'estresse', rotulo: 'Cliente irritado (transfere na hora)' },
  { chave: 'fora_escopo', rotulo: 'Assuntos que vão direto para o vendedor' },
]

function dataBR(s: string): string {
  if (!s) return '—'
  const d = new Date(s.replace(' ', 'T'))
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function errosDe(e: unknown): string[] {
  const x = e as {
    response?: { erros?: string[]; erro?: string }
    data?: { erros?: string[]; erro?: string }
  }
  const corpo = x?.response || x?.data
  if (corpo?.erros && corpo.erros.length > 0) return corpo.erros
  if (corpo?.erro) return [corpo.erro]
  return [e instanceof Error ? e.message : String(e)]
}

export default function Atendimento() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [form, setForm] = useState<Cfg | null>(null)
  const [palavrasTxt, setPalavrasTxt] = useState<Record<string, string>>({})
  const [observacao, setObservacao] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagens, setMensagens] = useState<string[]>([])
  const [aviso, setAviso] = useState('')
  const [alterado, setAlterado] = useState(false)
  const [confirmar, setConfirmar] = useState('')
  const [novoNumero, setNovoNumero] = useState('')
  const [novoRotulo, setNovoRotulo] = useState('')

  const carregar = useCallback(async () => {
    try {
      const r = (await pb.send('/backend/v1/atendimento/config', { method: 'GET' })) as Estado
      setEstado(r)
      if (r.atual) {
        setForm(JSON.parse(JSON.stringify(r.atual)) as Cfg)
        const p: Record<string, string> = {}
        for (const { chave } of PALAVRAS) p[chave] = (r.atual.palavras[chave] || []).join(', ')
        setPalavrasTxt(p)
      }
      setAlterado(false)
      setErro(null)
    } catch (e) {
      const msg = errosDe(e).join(' ')
      setErro(
        msg.indexOf('403') >= 0 || msg.indexOf('permiss') >= 0
          ? 'Você não tem permissão para o atendimento automático (manage_atendimento).'
          : msg,
      )
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const mudar = (parcial: Partial<Cfg>) => {
    if (!form) return
    setForm({ ...form, ...parcial })
    setAlterado(true)
  }

  const ligarDesligar = async (ligado: boolean) => {
    setMensagens([])
    try {
      await pb.send('/backend/v1/atendimento/ligar', {
        method: 'POST',
        body: JSON.stringify({ ligado, origem: 'atendimento' }),
        headers: { 'Content-Type': 'application/json' },
      })
      setAviso(
        ligado
          ? 'Robô ligado. Ele volta a responder no próximo minuto.'
          : 'Robô desligado. Ele para de responder no próximo minuto.',
      )
      await carregar()
    } catch (e) {
      setMensagens(errosDe(e))
    }
  }

  const salvar = async (conteudo: Cfg, obs: string) => {
    setSalvando(true)
    setMensagens([])
    setAviso('')
    try {
      const palavras: Record<string, string[]> = { ...conteudo.palavras }
      if (conteudo === form) {
        for (const { chave } of PALAVRAS) {
          palavras[chave] = (palavrasTxt[chave] || '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== '')
        }
      }
      const r = (await pb.send('/backend/v1/atendimento/config', {
        method: 'POST',
        body: JSON.stringify({
          ligado: estado ? estado.ligado : conteudo.ligado,
          usar_horario: conteudo.usar_horario,
          dias: conteudo.dias,
          hora_inicio: conteudo.hora_inicio,
          hora_fim: conteudo.hora_fim,
          janela_min: conteudo.janela_min,
          textos: conteudo.textos,
          faq: conteudo.faq,
          palavras,
          observacao: obs,
        }),
        headers: { 'Content-Type': 'application/json' },
      })) as { versao: number }
      setObservacao('')
      setConfirmar('')
      setAviso('Versão ' + r.versao + ' salva. O robô usa a partir do próximo minuto.')
      await carregar()
    } catch (e) {
      setMensagens(errosDe(e))
    } finally {
      setSalvando(false)
    }
  }

  const internos = async (corpo: Record<string, string>) => {
    setMensagens([])
    try {
      await pb.send('/backend/v1/atendimento/internos', {
        method: 'POST',
        body: JSON.stringify(corpo),
        headers: { 'Content-Type': 'application/json' },
      })
      setNovoNumero('')
      setNovoRotulo('')
      setConfirmar('')
      await carregar()
    } catch (e) {
      setMensagens(errosDe(e))
    }
  }

  if (carregando) return <EstadoCarregando />
  if (erro) return <EstadoErro mensagem={erro} aoTentar={() => void carregar()} />
  if (!estado) return null

  const situacao = !estado.ligado
    ? { texto: 'Desligado — não responde ninguém', cor: 'destructive' as const }
    : estado.dentro_do_horario
      ? { texto: 'Ligado e respondendo agora', cor: 'default' as const }
      : {
          texto: 'Ligado, mas fora do horário agora (' + estado.hora_brasilia + ' em Brasília)',
          cor: 'outline' as const,
        }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Atendimento automático"
        descricao="O robô que responde quem chama a central no WhatsApp. Toda alteração vira uma versão nova e pode ser desfeita no Histórico."
        acoes={
          <Button size="sm" variant="outline" onClick={() => void carregar()}>
            Atualizar
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-3">
            <Switch
              checked={estado.ligado}
              onCheckedChange={(v) => void ligarDesligar(v)}
              aria-label="Ligar ou desligar o robô"
            />
            <div>
              <p className="font-medium">{estado.ligado ? 'Robô ligado' : 'Robô desligado'}</p>
              <Badge variant={situacao.cor}>{situacao.texto}</Badge>
            </div>
          </div>
          {estado.atual && (
            <p className="text-xs text-muted-foreground">
              Versão {estado.atual.versao} · {estado.atual.autor_nome || '—'} ·{' '}
              {dataBR(estado.atual.criado)}
              {estado.atual.observacao ? ' · ' + estado.atual.observacao : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {aviso && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{aviso}</p>
      )}
      {mensagens.length > 0 && (
        <div className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {mensagens.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}

      {!form ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há configuração salva: o robô usa os textos padrão.
        </p>
      ) : (
        <Tabs defaultValue="horario">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="horario">Horário</TabsTrigger>
            <TabsTrigger value="textos">Textos</TabsTrigger>
            <TabsTrigger value="faq">Perguntas frequentes</TabsTrigger>
            <TabsTrigger value="palavras">Palavras</TabsTrigger>
            <TabsTrigger value="equipe">Números da equipe</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="respostas">Últimas respostas</TabsTrigger>
            <TabsTrigger value="automacoes">Automações</TabsTrigger>
          </TabsList>

          <TabsContent value="horario">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quando o robô funciona</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.usar_horario}
                    onCheckedChange={(v) => mudar({ usar_horario: v })}
                    aria-label="Funcionar só no horário definido"
                  />
                  <Label>
                    {form.usar_horario
                      ? 'Só no horário abaixo (fora dele o robô fica quieto)'
                      : 'O dia todo, todos os dias'}
                  </Label>
                </div>
                {form.usar_horario && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {DIAS.map((nome, i) => {
                        const marcado = form.dias.indexOf(i) >= 0
                        return (
                          <Button
                            key={nome}
                            size="sm"
                            variant={marcado ? 'default' : 'outline'}
                            onClick={() =>
                              mudar({
                                dias: marcado
                                  ? form.dias.filter((d) => d !== i)
                                  : [...form.dias, i].sort((a, b) => a - b),
                              })
                            }
                          >
                            {nome}
                          </Button>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="ini">Das</Label>
                        <Input
                          id="ini"
                          type="time"
                          value={form.hora_inicio}
                          onChange={(ev) => mudar({ hora_inicio: ev.target.value })}
                          className="w-32"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="fim">Até</Label>
                        <Input
                          id="fim"
                          type="time"
                          value={form.hora_fim}
                          onChange={(ev) => mudar({ hora_fim: ev.target.value })}
                          className="w-32"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Horário de Brasília.</p>
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label htmlFor="janela">
                    Responder mensagens recebidas nos últimos (minutos)
                  </Label>
                  <Input
                    id="janela"
                    type="number"
                    min={5}
                    max={1440}
                    value={form.janela_min}
                    onChange={(ev) => mudar({ janela_min: Number(ev.target.value) })}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mensagem mais antiga que isso fica para a equipe responder pelo celular.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="textos">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <p className="text-xs text-muted-foreground">
                  Texto apagado volta ao padrão. *negrito* funciona como no WhatsApp.
                </p>
                {TEXTOS.map(({ chave, rotulo, dica }) => (
                  <div key={chave} className="space-y-1">
                    <Label htmlFor={'t-' + chave}>{rotulo}</Label>
                    <Textarea
                      id={'t-' + chave}
                      rows={chave.startsWith('menu_') ? 7 : 3}
                      value={form.textos[chave] || ''}
                      onChange={(ev) =>
                        mudar({ textos: { ...form.textos, [chave]: ev.target.value } })
                      }
                    />
                    {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="faq">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <p className="text-xs text-muted-foreground">
                  Se a mensagem do cliente tiver uma das palavras-chave, o robô manda a resposta.
                </p>
                {form.faq.map((f, i) => (
                  <div key={i} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={f.pergunta}
                        placeholder="Título (só para vocês)"
                        onChange={(ev) => {
                          const faq = [...form.faq]
                          faq[i] = { ...f, pergunta: ev.target.value }
                          mudar({ faq })
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mudar({ faq: form.faq.filter((_, j) => j !== i) })}
                      >
                        Remover
                      </Button>
                    </div>
                    <Input
                      value={f.chaves.join(', ')}
                      placeholder="Palavras-chave separadas por vírgula"
                      onChange={(ev) => {
                        const faq = [...form.faq]
                        faq[i] = {
                          ...f,
                          chaves: ev.target.value.split(',').map((s) => s.trimStart()),
                        }
                        mudar({ faq })
                      }}
                    />
                    <Textarea
                      rows={3}
                      value={f.resposta}
                      placeholder="Resposta do robô"
                      onChange={(ev) => {
                        const faq = [...form.faq]
                        faq[i] = { ...f, resposta: ev.target.value }
                        mudar({ faq })
                      }}
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    mudar({ faq: [...form.faq, { pergunta: '', chaves: [], resposta: '' }] })
                  }
                >
                  Adicionar pergunta
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="palavras">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <p className="text-xs text-muted-foreground">
                  Palavras separadas por vírgula, sem acento (o robô ignora acento e maiúscula).
                  Lista vazia volta ao padrão.
                </p>
                {PALAVRAS.map(({ chave, rotulo }) => (
                  <div key={chave} className="space-y-1">
                    <Label htmlFor={'p-' + chave}>{rotulo}</Label>
                    <Textarea
                      id={'p-' + chave}
                      rows={2}
                      value={palavrasTxt[chave] || ''}
                      onChange={(ev) => {
                        setPalavrasTxt({ ...palavrasTxt, [chave]: ev.target.value })
                        setAlterado(true)
                      }}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="equipe">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <p className="text-xs text-muted-foreground">
                  Mensagem de um número desta lista não vira lead e o robô nunca responde. Cadastre
                  o celular de cada pessoa da equipe que conversa com os números da Haisan.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="num">Número (com DDD)</Label>
                    <Input
                      id="num"
                      value={novoNumero}
                      placeholder="(41) 99999-9999"
                      onChange={(ev) => setNovoNumero(ev.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rot">De quem é</Label>
                    <Input
                      id="rot"
                      value={novoRotulo}
                      placeholder="Ex.: Fábio — celular"
                      onChange={(ev) => setNovoRotulo(ev.target.value)}
                      className="w-56"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      void internos({ acao: 'adicionar', numero: novoNumero, rotulo: novoRotulo })
                    }
                  >
                    Adicionar
                  </Button>
                </div>
                <div className="divide-y divide-border rounded-md border border-border">
                  {(estado.internos || []).length === 0 && (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum número cadastrado.</p>
                  )}
                  {(estado.internos || []).map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-2 p-3 text-sm"
                    >
                      <span>
                        <span className="font-mono">{it.numero}</span> · {it.rotulo}
                      </span>
                      <Button
                        size="sm"
                        variant={confirmar === 'int-' + it.id ? 'destructive' : 'outline'}
                        onClick={() =>
                          confirmar === 'int-' + it.id
                            ? void internos({ acao: 'remover', id: it.id })
                            : setConfirmar('int-' + it.id)
                        }
                      >
                        {confirmar === 'int-' + it.id ? 'Confirmar remoção' : 'Remover'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historico">
            <Card>
              <CardContent className="divide-y divide-border pt-6">
                {(estado.versoes || []).map((v) => (
                  <div
                    key={v.versao}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        Versão {v.versao}{' '}
                        {v.versao === estado.atual?.versao && <Badge>atual</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dataBR(v.criado)} · {v.autor_nome || '—'} ·{' '}
                        {v.ligado ? 'ligado' : 'desligado'}
                        {v.observacao ? ' · ' + v.observacao : ''}
                      </p>
                    </div>
                    {v.versao !== estado.atual?.versao && (
                      <Button
                        size="sm"
                        variant={confirmar === 'v-' + v.versao ? 'destructive' : 'outline'}
                        disabled={salvando}
                        onClick={() =>
                          confirmar === 'v-' + v.versao
                            ? void salvar(v, 'Voltou para a versão ' + v.versao)
                            : setConfirmar('v-' + v.versao)
                        }
                      >
                        {confirmar === 'v-' + v.versao ? 'Confirmar volta' : 'Voltar para esta'}
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="respostas">
            <Card>
              <CardContent className="divide-y divide-border pt-6">
                {(estado.ultimas || []).length === 0 && (
                  <p className="py-3 text-sm text-muted-foreground">
                    Nenhuma resposta do robô nos últimos 2 dias.
                  </p>
                )}
                {(estado.ultimas || []).map((u) => (
                  <div key={u.id} className="space-y-1 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{dataBR(u.criado)}</span>
                      <span className="font-medium">{u.lead_nome || 'Cliente'}</span>
                      <Badge
                        variant={
                          u.estado === 'enviado'
                            ? 'outline'
                            : u.estado.indexOf('erro') >= 0
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {u.estado || '—'}
                      </Badge>
                      {u.erro && <span className="text-xs text-destructive">{u.erro}</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground">{u.texto}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CA-m1 (06/11): cada aba é uma seção com fundo e borda próprios,
              para o olho separar um bloco do outro. */}
          <TabsContent value="automacoes" className="rounded-lg border bg-muted/30 p-3">
            <AbaAutomacoes />
          </TabsContent>
        </Tabs>
      )}

      {form && estado.pode_alterar && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3">
          <Input
            value={observacao}
            placeholder="O que mudou? (opcional)"
            onChange={(ev) => setObservacao(ev.target.value)}
            className="w-72"
          />
          <Button disabled={!alterado || salvando} onClick={() => void salvar(form, observacao)}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Button>
          {alterado && (
            <Button variant="outline" disabled={salvando} onClick={() => void carregar()}>
              Descartar
            </Button>
          )}
          {alterado && (
            <span className="text-xs text-muted-foreground">Há alterações não salvas.</span>
          )}
        </div>
      )}
    </div>
  )
}
