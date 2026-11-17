import { Link } from 'react-router-dom'
import { ArrowRight, Lock, Rocket } from 'lucide-react'
import type { Sessao } from '@/App'
import { Cartao } from '@/components/base/visual'

/**
 * Página inicial — depois do login (30/10).
 *
 * Antes esta tela era pública e dizia "dados demonstrativos", o que aparecia
 * para quem ainda nem tinha entrado. Agora ela só existe atrás do login e
 * mostra o que aquela pessoa realmente pode abrir, vindo dos grants dela.
 *
 * Sem permissão nenhuma de leitura, a tela diz isso com clareza em vez de
 * oferecer um botão que vai dar erro.
 *
 * SPEC-3-018 / CA-3-123 (17/11) — VISUAL NOVO: a tela passa a usar o padrão da
 * RN-203 (cabeçalho, cartões `rounded-cartao`, ações em pílula preta, lista
 * limpa em vez de blocos centrais). MESMO conteúdo e mesmos links: nada de
 * contador, busca ou módulo que não exista hoje.
 */
export default function Index({ sessao }: { sessao: Sessao }) {
  const atalhos = sessao.menu.filter((m) => m.para !== '/minha-senha')

  return (
    <div className="flex-1 p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* cabeçalho da tela (RN-203 item 1) */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-titulo-celular font-semibold tracking-tight md:text-titulo">
              Olá, {sessao.user.nome || sessao.user.email}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sistema Marketing · o que você pode abrir hoje
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>

        {/* aviso de senha provisória — mesmo texto e mesmo link de antes */}
        {sessao.provisoria && (
          <div className="rounded-cartao border border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/10 px-4 py-3 text-sm">
            <strong>Você ainda usa a senha provisória.</strong> Troque por uma senha só sua em{' '}
            <Link to="/minha-senha" className="underline">
              Minha senha
            </Link>
            .
          </div>
        )}

        {atalhos.length > 0 ? (
          <Cartao
            titulo={
              atalhos.length === 1
                ? 'Seu módulo está disponível'
                : atalhos.length + ' módulos disponíveis para você'
            }
          >
            {/* RN-203 item 7: lista limpa, sem caixa por linha */}
            <ul className="divide-y divide-border">
              {atalhos.map((m) => (
                <li key={m.para}>
                  <Link
                    to={m.para}
                    className="group flex items-center justify-between gap-3 py-3 transition-colors hover:text-foreground"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.rotulo}</span>
                      <span className="block text-xs text-muted-foreground">Abrir módulo</span>
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Cartao>
        ) : (
          <Cartao>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-base font-semibold">Sua conta não tem módulos liberados</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Fale com a gerência para liberar o acesso que você precisa. Você já pode trocar sua
                senha em{' '}
                <Link to="/minha-senha" className="underline">
                  Minha senha
                </Link>
                .
              </p>
            </div>
          </Cartao>
        )}
      </div>
    </div>
  )
}
