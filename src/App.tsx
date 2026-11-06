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
import VendasSemValor from './pages/VendasSemValor'
import Recontato from './pages/Recontato'
import PrecisaAcao from './pages/PrecisaAcao'
import Admin from './pages/Admin'
import GestaoLeads from './pages/GestaoLeads'
import Conversoes from './pages/Conversoes'
import Concorrentes from './pages/Concorrentes'
import Numeros from './pages/Numeros'
import Conversas from './pages/Conversas'
// Atendimento (painel do robô) e Acessos: as rotas TÊM de existir aqui. O menu
// vem do servidor (wa_sessao.js) e já mostra os dois; sem a rota a aba abre a
// tela de "não encontrado" (aconteceu em 04/11). Ao reescrever este arquivo,
// conferir que toda entrada do catálogo de wa_sessao.js tem a sua <Route>.
import Atendimento from './pages/Atendimento'
import Acessos from './pages/Acessos'
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
 * a partir do que o servidor diz que a pessoa pode ver (/backend/v1/wa/sessao)
 * — quem não tem a permissão não vê o módulo, em vez de clicar e tomar erro.
 */

export type Sessao = {
  autenticado: boolean
  user: { id: string; nome: string; email: string }
  papeis: string[]
  pode: string[]
  menu: { para: string; rotulo: string }[]
  provisoria: boolean
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

  return (
    <TooltipProvider delayDuration={0}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout sessao={sessao} />}>
            <Route path="/" element={<Index sessao={sessao} />} />
            <Route path="/painel" element={<Painel />} />
            <Route path="/criterios" element={<Criterios />} />
            <Route path="/decisoes" element={<Decisoes />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/caixa" element={<Caixa />} />
            <Route path="/alertas" element={<Alertas />} />
            <Route path="/saude-canal" element={<Saude />} />
            <Route path="/analises" element={<Analises />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/vendas-sem-valor" element={<VendasSemValor />} />
            <Route path="/recontato" element={<Recontato />} />
            <Route path="/precisa-acao" element={<PrecisaAcao />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/gestao-leads" element={<GestaoLeads />} />
            <Route path="/conversoes" element={<Conversoes />} />
            <Route path="/concorrentes" element={<Concorrentes />} />
            <Route path="/conversas" element={<Conversas />} />
            <Route path="/numeros" element={<Numeros />} />
            <Route path="/atendimento" element={<Atendimento />} />
            <Route path="/acessos" element={<Acessos />} />
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
