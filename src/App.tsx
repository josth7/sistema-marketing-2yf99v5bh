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
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

const App = () => (
  <TooltipProvider delayDuration={0}>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Index />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/criterios" element={<Criterios />} />
          <Route path="/decisoes" element={<Decisoes />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/caixa" element={<Caixa />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/saude-canal" element={<Saude />} />
          <Route path="/analises" element={<Analises />} />
          <Route path="/leads" element={<Leads />} />
          {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
)

export default App
