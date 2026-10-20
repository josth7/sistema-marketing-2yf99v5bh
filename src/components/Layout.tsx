import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  Rocket,
  BarChart3,
  ListPlus,
  Scale,
  FileText,
  Inbox,
  BellRing,
  Activity,
} from 'lucide-react'
import { VERSAO_SISTEMA } from '@/lib/versao'

/**
 * Layout único do sistema (SPEC-2-007, CA-2-16): cabeçalho com logo, nome e
 * navegação SÓ para módulos existentes; versão real no rodapé (sai o v1.0.0
 * fixo); cores só de tokens do tema (bg-background, bg-card, text-muted-*,
 * primary) + gradientes da marca (--marca-1/--marca-2 definidos em main.css).
 */
const ITENS_MENU = [
  { para: '/painel', rotulo: 'Painel', Icone: BarChart3 },
  { para: '/criterios', rotulo: 'Critérios', Icone: ListPlus },
  { para: '/alertas', rotulo: 'Alertas', Icone: BellRing },
  { para: '/decisoes', rotulo: 'Decisões', Icone: Scale },
  { para: '/relatorios', rotulo: 'Relatórios', Icone: FileText },
  { para: '/caixa', rotulo: 'Caixa', Icone: Inbox },
  { para: '/saude-canal', rotulo: 'Saúde do canal', Icone: Activity },
]

export default function Layout() {
  const atual = useLocation().pathname
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Cabeçalho */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30 px-4 md:px-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-[linear-gradient(135deg,hsl(var(--marca-1)),hsl(var(--marca-2)))] flex items-center justify-center text-white shadow-sm">
            <Rocket className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="font-semibold text-base md:text-lg tracking-tight truncate">
            Sistema Marketing
          </span>
        </div>
        <nav
          className="flex items-center gap-0.5 md:gap-1 overflow-x-auto"
          aria-label="Navegação principal"
        >
          {ITENS_MENU.map(({ para, rotulo, Icone }) => {
            const ativo = atual === para || atual.startsWith(para + '/')
            return (
              <Link
                key={para}
                to={para}
                aria-current={ativo ? 'page' : undefined}
                className={
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 md:px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (ativo
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                }
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {rotulo}
              </Link>
            )
          })}
        </nav>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* Rodapé com a versão real (CA-2-16) */}
      <footer className="py-3 border-t border-border bg-card text-center text-xs text-muted-foreground">
        Sistema Marketing · {VERSAO_SISTEMA} · {currentYear}
      </footer>
    </div>
  )
}
