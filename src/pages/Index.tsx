import { Link } from 'react-router-dom'
import { Rocket, Sparkles, BarChart3 } from 'lucide-react'

export default function Index() {
  return (
    <div className="flex-1 flex items-center justify-center p-6 md:p-12">
      <div className="max-w-xl w-full text-center space-y-6">
        {/* Logo / Badge */}
        <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-[#6C3EF5]/10 to-[#A855F7]/10 border border-[#6C3EF5]/20 shadow-sm animate-fade-in">
          <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-[#6C3EF5] to-[#A855F7] flex items-center justify-center text-white shadow-md">
            <Rocket className="h-8 w-8" />
          </div>
        </div>

        {/* Title and Subtitle */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1F2937]">
            SISTEMA MARKETING
          </h1>
          <p className="text-base sm:text-lg text-[#6B7280] max-w-md mx-auto">
            Plataforma unificada para planejamento, execução e análise de campanhas de marketing
            digital.
          </p>
        </div>

        {/* Acesso ao painel */}
        <div className="rounded-xl border border-gray-200 bg-white p-8 sm:p-10 text-center shadow-sm space-y-4">
          <div className="h-12 w-12 rounded-full bg-[#6C3EF5]/10 text-[#6C3EF5] flex items-center justify-center mx-auto">
            <BarChart3 className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-[#1F2937]">Painel consolidado disponível</h2>
          <p className="text-sm text-[#6B7280]">
            Filtros por período, canal e objetivo — com dados demonstrativos identificados até a
            conexão das fontes reais.
          </p>
          <Link
            to="/painel"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#6C3EF5] to-[#A855F7] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" />
            Abrir o painel
          </Link>
        </div>
      </div>
    </div>
  )
}
