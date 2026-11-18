import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
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
  Rocket,
  LayoutGrid,
  Handshake,
  Megaphone,
  Sparkles,
  Settings,
  Folder,
  X,
  ClipboardList,
  Hourglass,
  BadgeDollarSign,
  PhoneCall,
  AlertTriangle,
  SlidersHorizontal,
  ShieldCheck,
  Target,
  Circle,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { VERSAO_SISTEMA } from '@/lib/versao'
import { SeletorEmpresa } from '@/components/base/seletor-empresa'
import { Dica } from '@/components/base/dica'
import type { Sessao } from '@/App'

/**
 * Layout do sistema — NAVEGAÇÃO EM DOIS NÍVEIS (SPEC-3-018 / RN-202).
 *
 * Antes: uma coluna única com o menu agrupado por categoria (CA-3-39).
 * Agora: uma BARRA ESTREITA DE ÍCONES (64 px) + um PAINEL DE MÓDULOS (240 px),
 * como nas referências.
 *
 * Regras da RN-202 que este arquivo implementa:
 *  - barra: quadrado preto de 40 px com o ícone da marca no topo (leva a `/`);
 *    um botão redondo de 44 px por categoria que a pessoa tem; a categoria
 *    ATIVA num círculo preto com ícone branco; no rodapé, Minha senha e Sair
 *    (Minha senha fica SÓ aqui, não entra em categoria);
 *  - painel: nome da categoria em exibição, o SeletorEmpresa (só quem tem 2+),
 *    e os módulos daquela categoria — o da rota atual numa pílula branca;
 *  - categoria em exibição: ao abrir uma tela é a que contém a rota; clicar num
 *    ícone troca o painel SEM trocar de tela; clicar num módulo navega e a
 *    categoria volta a ser a da rota nova;
 *  - rotas fora do menu (Início `/`, Minha senha, não encontrado): nenhum ícone
 *    marcado e o painel mostra a primeira categoria;
 *  - larguras: ≥1024 px barra e painel fixos; 768–1023 px só a barra fixa e o
 *    painel abre por cima; <768 px uma gaveta com os dois lado a lado;
 *  - teclado: Tab percorre, Enter/Espaço ativam, Esc fecha e devolve o foco.
 *
 * Nenhum dado, rota, permissão ou contador novo: o menu continua vindo do
 * servidor (`/backend/v1/wa/sessao` → `menu[]`, com `para`, `rotulo`,
 * `categoria`).
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
  '/gestao-leads': ClipboardList,
  '/esperando': Hourglass,
  '/vendas-sem-valor': BadgeDollarSign,
  '/recontato': PhoneCall,
  '/precisa-acao': AlertTriangle,
  '/admin': SlidersHorizontal,
  '/acessos': ShieldCheck,
  '/conversoes': Target,
  '/minha-senha': KeyRound,
}

// Uma frase curta embaixo de cada módulo, para a pessoa saber o que tem lá
// sem precisar abrir (só texto de tela; o menu continua vindo do servidor).
const DESCRICOES: Record<string, string> = {
  '/painel': 'Números de marketing e vendas',
  '/criterios': 'Quando o sistema deve avisar',
  '/alertas': 'Avisos de queda ou alta nos números',
  '/decisoes': 'O que foi decidido e por quê',
  '/relatorios': 'Resumos semanais e quinzenais',
  '/caixa': 'Itens esperando sua revisão',
  '/leads': 'Todos os clientes e o funil',
  '/gestao-leads': 'Quem está com cada vendedor',
  '/esperando': 'Clientes aguardando resposta',
  '/conversas': 'WhatsApp de todos os números',
  '/vendas-sem-valor': 'Vendas fechadas sem o valor',
  '/recontato': 'Clientes para chamar de novo',
  '/precisa-acao': 'Leads parados que pedem ação',
  '/conversoes': 'Vendas enviadas ao Meta e Google',
  '/concorrentes': 'O que os concorrentes estão fazendo',
  '/analises': 'Análises feitas pela IA',
  '/saude-canal': 'Se as integrações estão funcionando',
  '/numeros': 'Números de WhatsApp conectados',
  '/atendimento': 'Como o robô responde',
  '/acessos': 'Quem entra e o que pode ver',
  '/admin': 'Ajustes gerais do sistema',
}

// RN-202: um ícone por categoria
const ICONES_CATEGORIA: Record<string, typeof LayoutGrid> = {
  'Visão geral': LayoutGrid,
  Vendas: Handshake,
  Marketing: Megaphone,
  'Inteligência artificial': Sparkles,
  Administração: Settings,
  Outros: Folder,
}

const ORDEM_CATEGORIAS = [
  'Visão geral',
  'Vendas',
  'Marketing',
  'Inteligência artificial',
  'Administração',
  'Outros',
]

export default function Layout({ sessao }: { sessao: Sessao }) {
  const atual = useLocation().pathname
  const currentYear = new Date().getFullYear()

  // <768 px: gaveta aberta/fechada. 768–1023 px: painel sobreposto.
  const [gaveta, setGaveta] = useState(false)
  const [painelSobreposto, setPainelSobreposto] = useState(false)

  // Minha senha todo mundo tem; o resto vem do servidor
  const itens = [...sessao.menu, { para: '/minha-senha', rotulo: 'Minha senha' }]

  const grupoMenu = ORDEM_CATEGORIAS.map((cat) => ({
    categoria: cat,
    itens: itens.filter((i) =>
      cat === 'Outros'
        ? !i.categoria || ORDEM_CATEGORIAS.indexOf(i.categoria) < 0
        : i.categoria === cat,
    ),
  })).filter((g) => g.itens.length > 0)

  // RN-202: categoria da ROTA atual; se a rota não está no menu, a primeira
  const categoriaDaRota = (() => {
    for (const g of grupoMenu) {
      for (const i of g.itens) {
        if (i.para === atual || atual.startsWith(i.para + '/')) return g.categoria
      }
    }
    return grupoMenu.length > 0 ? grupoMenu[0].categoria : ''
  })()

  // Categoria EM EXIBIÇÃO no painel. Começa na da rota e é trocada ao clicar
  // num ícone (sem navegar). Volta a ser a da rota quando a rota muda.
  const [categoriaExibida, setCategoriaExibida] = useState(categoriaDaRota)
  useEffect(() => {
    setCategoriaExibida(categoriaDaRota)
  }, [categoriaDaRota])

  const grupoExibido =
    grupoMenu.find((g) => g.categoria === categoriaExibida) || grupoMenu[0] || null

  function sair() {
    pb.authStore.clear()
    window.location.replace('/')
  }

  function escolherCategoria(cat: string) {
    setCategoriaExibida(cat)
    setPainelSobreposto(true) // em 768–1023 abre por cima
    setGaveta(false)
  }

  // Esc fecha o painel sobreposto e a gaveta
  useEffect(() => {
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return
      setPainelSobreposto(false)
      setGaveta(false)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  // ---------------- BARRA DE ÍCONES (64 px) ----------------
  const barra = (
    <nav
      aria-label="Categorias"
      className="flex w-16 shrink-0 flex-col items-center gap-1 bg-background py-3"
    >
      {/* marca: quadrado preto de 40 px */}
      <Link
        to="/"
        aria-label="Início"
        title="Início"
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90"
      >
        <Rocket className="h-5 w-5" aria-hidden="true" />
      </Link>

      {grupoMenu.map((g) => {
        const Icone = ICONES_CATEGORIA[g.categoria] || Folder
        const ativa = g.categoria === categoriaExibida
        return (
          <Dica key={g.categoria} texto={g.categoria}>
            <button
              type="button"
              onClick={() => escolherCategoria(g.categoria)}
              aria-label={g.categoria}
              aria-current={ativa ? 'true' : undefined}
              className={
                'flex h-11 w-11 items-center justify-center rounded-full transition-colors ' +
                (ativa
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground')
              }
            >
              <Icone className="h-5 w-5" aria-hidden="true" />
            </button>
          </Dica>
        )
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <Dica texto="Minha senha">
          <Link
            to="/minha-senha"
            aria-label="Minha senha"
            className={
              'flex h-11 w-11 items-center justify-center rounded-full transition-colors ' +
              (atual === '/minha-senha'
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')
            }
          >
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Dica>
        <Dica texto="Sair">
          <button
            type="button"
            onClick={sair}
            aria-label={'Sair — ' + sessao.user.email}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </Dica>
      </div>
    </nav>
  )

  // ---------------- PAINEL DE MÓDULOS (240 px) ----------------
  const painel = (
    <div className="flex h-full w-60 shrink-0 flex-col gap-3 bg-background px-3 py-4">
      <h2 className="text-painel font-semibold tracking-tight">
        {grupoExibido ? grupoExibido.categoria : ''}
      </h2>

      {/* CA-3-90: só quem tem 2+ empresas vê */}
      <SeletorEmpresa />

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {(grupoExibido ? grupoExibido.itens : []).map(({ para, rotulo }) => {
          const Icone = ICONES[para] || Circle
          const descricao = DESCRICOES[para] || ''
          const ativo = atual === para || atual.startsWith(para + '/')
          return (
            <li key={para}>
              <Link
                to={para}
                onClick={() => {
                  setPainelSobreposto(false)
                  setGaveta(false)
                }}
                aria-current={ativo ? 'page' : undefined}
                title={descricao ? rotulo + ' — ' + descricao : rotulo}
                className={
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ' +
                  (ativo
                    ? 'bg-card font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground')
                }
              >
                <span
                  className={
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' +
                    (ativo ? 'bg-foreground text-background' : 'bg-muted text-foreground/70')
                  }
                >
                  <Icone className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{rotulo}</span>
                  {descricao !== '' && (
                    <span className="truncate text-[11px] font-normal leading-tight text-muted-foreground">
                      {descricao}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ---------- ≥1024 px: barra e painel fixos lado a lado ---------- */}
      <div className="hidden min-h-screen border-r border-border bg-background lg:flex">
        {barra}
        <div className="border-l border-border">{painel}</div>
      </div>

      {/* ---------- 768–1023 px: só a barra fixa; painel por cima ---------- */}
      <div className="hidden min-h-screen border-r border-border bg-background md:flex lg:hidden">
        {barra}
      </div>
      {painelSobreposto && (
        <div className="fixed inset-0 z-40 hidden md:block lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setPainelSobreposto(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-16 z-50 border-r border-border bg-background shadow-janela">
            {painel}
          </div>
        </div>
      )}

      {/* ---------- <768 px: gaveta com barra e painel lado a lado ---------- */}
      {gaveta && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setGaveta(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full bg-background shadow-janela">
            {barra}
            <div className="border-l border-border">{painel}</div>
            <button
              type="button"
              onClick={() => setGaveta(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-2 rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- conteúdo ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* cabeçalho: abaixo de 1024 px fica só para o botão de menu e a empresa */}
        <header className="flex h-16 items-center gap-3 border-b border-border px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setGaveta(true)}
            aria-label="Abrir menu"
            className="rounded-full p-2 text-muted-foreground hover:bg-muted md:hidden"
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setPainelSobreposto((v) => !v)}
            aria-label="Abrir módulos"
            className="hidden rounded-full p-2 text-muted-foreground hover:bg-muted md:inline-flex lg:hidden"
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="truncate text-sm font-semibold">Sistema Marketing</span>
        </header>

        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>

        <footer className="py-3 text-center text-xs text-muted-foreground">
          Sistema Marketing · {VERSAO_SISTEMA} · {currentYear}
          {sessao.user.nome !== '' && <> · {sessao.user.nome}</>}
        </footer>
      </div>
    </div>
  )
}
