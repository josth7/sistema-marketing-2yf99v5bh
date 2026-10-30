import { Link } from 'react-router-dom'
import { Rocket, BarChart3, Lock } from 'lucide-react'
import type { Sessao } from '@/App'

/**
 * Página inicial — depois do login (30/10).
 *
 * Antes esta tela era pública e dizia "dados demonstrativos", o que aparecia
 * para quem ainda nem tinha entrado. Agora ela só existe atrás do login e
 * mostra o que aquela pessoa realmente pode abrir, vindo dos grants dela.
 *
 * Sem permissão nenhuma de leitura, a tela diz isso com clareza em vez de
 * oferecer um botão que vai dar erro.
 */
export default function Index({ sessao }: { sessao: Sessao }) {
  const atalhos = sessao.menu.filter((m) => m.para !== '/minha-senha')
  const primeiro = atalhos.length > 0 ? atalhos[0].para : ''

  return (
    <div className="flex-1 flex items-center justify-center p-6 md:p-12">
      <div className="max-w-xl w-full text-center space-y-6">
        {/* Marca */}
        <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-primary/10 border border-primary/20 shadow-sm animate-fade-in">
          <div className="h-16 w-16 rounded-xl bg-[linear-gradient(135deg,hsl(var(--marca-1)),hsl(var(--marca-2)))] flex items-center justify-center text-white shadow-md">
            <Rocket className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>

        {/* Título e subtítulo */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Sistema Marketing
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-md mx-auto">
            Olá, {sessao.user.nome || sessao.user.email}.
          </p>
        </div>

        {sessao.provisoria && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
            <strong>Você ainda usa a senha provisória.</strong> Troque por uma senha só sua em{' '}
            <Link to="/minha-senha" className="underline">
              Minha senha
            </Link>
            .
          </div>
        )}

        {primeiro !== '' ? (
          <div className="rounded-xl border border-border bg-card p-8 sm:p-10 text-center shadow-sm space-y-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {atalhos.length === 1
                ? 'Seu módulo está disponível'
                : atalhos.length + ' módulos disponíveis para você'}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {atalhos.map((m) => (
                <Link
                  key={m.para}
                  to={m.para}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  {m.rotulo}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center mx-auto">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Sua conta não tem módulos liberados
            </h2>
            <p className="text-sm text-muted-foreground">
              Fale com a gerência para liberar o acesso que você precisa. Você já pode trocar sua
              senha em{' '}
              <Link to="/minha-senha" className="underline">
                Minha senha
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
