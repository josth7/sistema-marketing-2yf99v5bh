import { Rocket, Sparkles } from 'lucide-react'

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

        {/* Placeholder / Empty State Card */}
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 sm:p-10 text-center shadow-sm">
          <div className="h-12 w-12 rounded-full bg-[#6C3EF5]/10 text-[#6C3EF5] flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold text-[#1F2937] mb-1">
            Projeto iniciado com sucesso
          </h2>
          <p className="text-sm text-[#6B7280]">
            Este é o espaço inicial reservado para o sistema. Defina seu produto, campanhas ou
            estratégias nas próximas etapas.
          </p>
        </div>
      </div>
    </div>
  )
}
