import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import Painel from './pages/Painel'
import Criterios from './pages/Criterios'
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
          {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
)

export default App
