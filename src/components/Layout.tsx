import { useState } from 'react'
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
  Menu as MenuIcon,
  X,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { VERSAO_SISTEMA } from '@/lib/versao'
import { SeletorEmpresa } from '@/components/base/seletor-empresa'
import type { Sessao } from '@/App'

/**
 * Layout único do sistema (SPEC-2-007, CA-2-16).
 *
 * Mudança de 30/10: o menu NÃO é uma lista fixa. Ele vem do servidor
 * (/backend/v1/wa/sessao → `menu`), com só os módulos que os grants da pessoa
 * permitem. Quem não tem a permissão não vê a aba.
 *
 * **CA-3-39 (16/11) — MENU NA LATERAL:** até 15/11 o menu ficava numa faixa
 * horizontal no topo, apesar de o card pedir a lateral. Aqui ele passa para uma
 * coluna à esquerda, agrupado por categoria. No celular a coluna vira uma
 * gaveta, aberta pelo botão do cabeçalho — senão ela comeria a tela.
 *
 * **CA-3-40:** cada item tem `title` (dica ao passar o mouse) e a categoria
 * virou cabeçalho visível, não só um separador — que é o "menos branco e
 * separar melhor as seções" pedido.
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
  const [menuAberto, setMenuAberto] = useState(false)

  // Minha senha todo mundo tem; o resto vem do servidor
  const itens = [...sessao.menu, { para: '/minha-senha', rotulo: 'Minha senha' }]

  // Ordem em que a gestão pensa o negócio. Item sem categoria cai em "Outros".
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

  // A coluna lateral. No celular fica escondida até o botão abrir.
  const lateral = (
    <div className="flex flex-col h-full">
      {/* marca */}
      <div className="flex items-center gap-3 h-16 shrink-0 px-4 border-b border-border">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-[linear-gradient(135deg,hsl(var(--marca-1)),hsl(var(--marca-2)))] flex items-center justify-center text-white shadow-sm">
          <Rocket className="h-5 w-5" aria-hidden="true" />
        </div>
        <span className="font-semibold text-sm tracking-tight truncate">Sistema Marketing</span>
        <button
          type="button"
          onClick={() => setMenuAberto(false)}
          className="md:hidden ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* seletor de empresa (CA-3-90: só o dono com 2+ empresas vê) */}
      <div className="px-3 py-2 border-b border-border">
        <SeletorEmpresa />
      </div>

      {/* categorias + itens */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Navegação principal">
        {grupoMenu.map((grupo) => (
          <div key={grupo.categoria}>
            <div
              className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
              title={grupo.categoria}
            >
              {grupo.categoria}
            </div>
            <ul className="space-y-0.5">
              {grupo.itens.map(({ para, rotulo }) => {
                const Icone = ICONES[para] || KeyRound
                const ativo = atual === para || atual.startsWith(para + '/')
                return (
                  <li key={para}>
                    <Link
                      to={para}
                      aria-current={ativo ? 'page' : undefined}
                      title={rotulo + ' — ' + grupo.categoria}
                      onClick={() => setMenuAberto(false)}
                      className={
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ' +
                        (ativo
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground')
                      }
                    >
                      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{rotulo}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* sair */}
      <div className="shrink-0 border-t border-border p-2">
        <button
          type="button"
          onClick={sair}
          title={'Sair — ' + sessao.user.email}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Sair</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* fundo escuro da gaveta no celular */}
      {menuAberto && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      {/* COLUNA LATERAL — fixa no desktop, gaveta no celular */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 md:static md:translate-x-0 md:z-auto ' +
          (menuAberto ? 'translate-x-0' : '-translate-x-full')
        }
      >
        {lateral}
      </aside>

      {/* conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* cabeçalho enxuto: só o botão do menu e o nome de quem está logado */}
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30 px-4 md:px-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label="Abrir menu"
          >
            <MenuIcon className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="font-semibold text-base md:text-lg tracking-tight truncate md:hidden">
            Sistema Marketing
          </span>
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <span className="hidden sm:inline text-xs text-muted-foreground truncate">
              {sessao.user.nome !== '' ? sessao.user.nome : sessao.user.email}
            </span>
          </div>
        </header>

        <main className="flex-1 flex flex-col min-w-0">
          <Outlet />
        </main>

        {/* rodapé com a versão real (CA-2-16) */}
        <footer className="py-3 border-t border-border bg-card text-center text-xs text-muted-foreground">
          Sistema Marketing · {VERSAO_SISTEMA} · {currentYear}
          {sessao.user.nome !== '' && <> · {sessao.user.nome}</>}
        </footer>
      </div>
    </div>
  )
}
