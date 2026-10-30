import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import Painel from './pages/Painel'
import Criterios from './pages/Criterios'
import Decisoes from './pages/Decisoes'
import Relatorios from './pages/Relatorios'
import Caixa from './pages/Caixa'
import Alertas from './pages/Alertas'
import Saude from './pages/Saude'
import Analises from './pages/Analises'
import Leads from './pages/Leads'
import Concorrentes from './pages/Concorrentes'
import Numeros from './pages/Numeros'
import Conversas from './pages/Conversas'
import MinhaSenha from './pages/MinhaSenha'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import pb from '@/lib/pocketbase/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

/**
 * Portão de sessão (30/10).
 *
 * Antes o sistema abria sem login e cada aba pedia senha na hora do clique.
 * Agora: sem sessão válida, só a tela de Login. Com sessão, o menu é montado
 * a partir do que o servidor diz que a pessoa pode ver (/backend/v1/wa/sessao).
 *
 * Duas travas, não uma: além de esconder do menu, as rotas de módulo que a
 * pessoa não tem ficam fora das <Routes> — digitar a URL na mão também não
 * abre. Quem não pode ver nada cai na tela de "sem acesso".
 */

export type Sessao = {
  autenticado: boolean
  user: { id: string; nome: string; email: string }
  papeis: string[]
  pode: string[]
  menu: { para: string; rotulo: string }[]
  provisoria: boolean
}

function SemAcesso() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-2">
        <h2 className="text-base font-semibold text-foreground">
          Este módulo não está liberado para você
        </h2>
        <p className="text-sm text-muted-foreground">
          Fale com a gerência se precisar deste acesso.
        </p>
      </div>
    </div>
  )
}

const App = () => {
  const [carregando, setCarregando] = useState(true)
  const [sessao, setSessao] = useState<Sessao | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      if (!pb.authStore.isValid) {
        if (vivo) {
          setSessao(null)
          setCarregando(false)
        }
        return
      }
      try {
        const s = (await pb.send('/backend/v1/wa/sessao', { method: 'GET' })) as Sessao
        if (vivo) setSessao(s)
      } catch {
        // sessão expirada ou inválida: limpa e cai no login
        pb.authStore.clear()
        if (vivo) setSessao(null)
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Carregando…</span>
      </div>
    )
  }

  if (!sessao || !sessao.autenticado) {
    return (
      <TooltipProvider delayDuration={0}>
        <Toaster />
        <Sonner />
        <Login />
      </TooltipProvider>
    )
  }

  // rotas liberadas = o que o servidor mandou no menu
  const liberadas: string[] = sessao.menu.map((m) => m.para)
  const modulos: { para: string; elemento: JSX.Element }[] = [
    { para: '/painel', elemento: <Painel /> },
    { para: '/criterios', elemento: <Criterios /> },
    { para: '/decisoes', elemento: <Decisoes /> },
    { para: '/relatorios', elemento: <Relatorios /> },
    { para: '/caixa', elemento: <Caixa /> },
    { para: '/alertas', elemento: <Alertas /> },
    { para: '/saude-canal', elemento: <Saude /> },
    { para: '/analises', elemento: <Analises /> },
    { para: '/leads', elemento: <Leads /> },
    { para: '/concorrentes', elemento: <Concorrentes /> },
    { para: '/conversas', elemento: <Conversas /> },
    { para: '/numeros', elemento: <Numeros /> },
  ]

  return (
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout sessao={sessao} />}>
            <Route path="/" element={<Index sessao={sessao} />} />
            {modulos.map(({ para, elemento }) => (
              <Route
                key={para}
                path={para}
                element={liberadas.indexOf(para) >= 0 ? elemento : <SemAcesso />}
              />
            ))}
            <Route path="/minha-senha" element={<MinhaSenha />} />
            {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
