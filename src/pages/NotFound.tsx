import { Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Compass } from 'lucide-react'

/** 404 no padrão da base visual (SPEC-2-007, CA-2-16) — tokens, PT-BR, saída clara. */
const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <Compass className="mx-auto h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Página não encontrada</h1>
        <p className="text-muted-foreground">O endereço acessado não existe neste sistema.</p>
        <Link
          to="/painel"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  )
}

export default NotFound
