import { Link } from 'react-router-dom'
import { Rocket, BarChart3 } from 'lucide-react'

/**
 * Página inicial no padrão da base visual (SPEC-2-007, CA-2-16): só tokens do
 * tema (primary, foreground, muted-foreground) + gradiente da marca
 * (--marca-1/--marca-2 em main.css). Nenhuma regra ou rota muda.
 */
export default function Index() {
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
            Plataforma unificada para planejamento, execução e análise de campanhas de marketing
            digital.
          </p>
        </div>

        {/* Acesso ao painel */}
        <div className="rounded-xl border border-border bg-card p-8 sm:p-10 text-center shadow-sm space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Painel consolidado disponível</h2>
          <p className="text-sm text-muted-foreground">
            Filtros por período, canal e objetivo — com dados demonstrativos identificados até a
            conexão das fontes reais.
          </p>
          <Link
            to="/painel"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Abrir o painel
          </Link>
        </div>
      </div>
    </div>
  )
}
