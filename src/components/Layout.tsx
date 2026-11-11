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
  BrainCircuit,
  Users,
  Eye,
  MessageCircle,
  Smartphone,
  KeyRound,
  LogOut,
  Bot,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { VERSAO_SISTEMA } from '@/lib/versao'
import { SeletorEmpresa } from '@/components/base/seletor-empresa'
import type { Sessao } from '@/App'

/**
 * Layout único do sistema (SPEC-2-007, CA-2-16).
 *
 * Mudança de 30/10: o menu NÃO é mais uma lista fixa. Ele vem do servidor
 * (/backend/v1/wa/sessao → `menu`), com só os módulos que os grants da pessoa
 * permitem. Quem não tem a permissão não vê a aba — antes via tudo e tomava
 * erro ao clicar. O cabeçalho mostra quem está logado e permite sair.
 */

const ICONES: Record<string, typeof BarChart3> = {
  '/painel': BarChart3,
  '/criterios': ListPlus,
  '/alertas': BellRing,
  '/decisoes': Scale,
  '/relatorios': FileText,
  '/caixa': Inbox,
  '/leads': Users,
  '/conversas': MessageCircle,
  '/numeros': Smartphone,
  '/atendimento': Bot,
  '/concorrentes': Eye,
  '/analises': BrainCircuit,
  '/saude-canal': Activity,
}

export default function Layout({ sessao }: { sessao: Sessao }) {
  const atual = useLocation().pathname
  const currentYear = new Date().getFullYear()

  // Minha senha todo mundo tem; o resto vem do servidor
  const itens = [...sessao.menu, { para: '/minha-senha', rotulo: 'Minha senha' }]

  // CA-3-39 (06/11): menu por CATEGORIA, na ordem em que a gestão pensa o
  // negócio — Vendas, Marketing, Inteligência artificial, Administração.
  // Um item sem categoria cai em "Outros" em vez de sumir.
  const ORDEM_CATEGORIAS = [
    'Visão geral',
    'Vendas',
    'Marketing',
    'Inteligência artificial',
    'Administração',
    'Outros',
  ]
  const grupoMenu = ORDEM_CATEGORIAS.map((cat) => ({
    categoria: cat,
    itens: itens.filter((i) =>
      cat === 'Outros'
        ? !i.categoria || ORDEM_CATEGORIAS.indexOf(i.categoria) < 0
        : i.categoria === cat,
    ),
  })).filter((g) => g.itens.length > 0)

  function sair() {
    pb.authStore.clear()
    window.location.replace('/')
  }

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
          {/* CA-3-90: só o dono com duas empresas vê o seletor */}
          <SeletorEmpresa />
        </div>
        <nav
          className="flex items-center gap-0.5 md:gap-1 overflow-x-auto"
          aria-label="Navegação principal"
        >
          {grupoMenu.map((grupo, gi) => (
            <span key={grupo.categoria} className="flex items-center gap-0.5 md:gap-1">
              {gi > 0 && (
                <span
                  className="mx-1 h-5 w-px shrink-0 bg-border"
                  aria-hidden="true"
                  title={grupo.categoria}
                />
              )}
              {grupo.itens.map(({ para, rotulo }) => {
                const Icone = ICONES[para] || KeyRound
                const ativo = atual === para || atual.startsWith(para + '/')
                return (
                  <Link
                    key={para}
                    to={para}
                    aria-current={ativo ? 'page' : undefined}
                    title={grupo.categoria}
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
            </span>
          ))}
          <button
            type="button"
            onClick={sair}
            title={'Sair — ' + sessao.user.email}
            className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </button>
        </nav>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* Rodapé com a versão real (CA-2-16) */}
      <footer className="py-3 border-t border-border bg-card text-center text-xs text-muted-foreground">
        Sistema Marketing · {VERSAO_SISTEMA} · {currentYear}
        {sessao.user.nome !== '' && <> · {sessao.user.nome}</>}
      </footer>
    </div>
  )
}
