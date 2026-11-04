import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  const [aba, setAba] = useState<'equipe' | 'numeros'>('equipe')
  const [soAtivas, setSoAtivas] = useState(false)

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
        {aba === 'equipe' && (
          <Button
            size="sm"
            variant={soAtivas ? 'default' : 'outline'}
            onClick={() => setSoAtivas((v) => !v)}
          >
            Só quem tem acesso
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void carregar()}>
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
                </CardContent>
              </Card>
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
