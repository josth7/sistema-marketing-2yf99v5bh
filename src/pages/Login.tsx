import { useEffect, useState } from 'react'
import { Loader2, LockKeyhole, Rocket } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

/**
 * Portão de entrada (30/10).
 *
 * Antes: a tela inicial era pública e o painel abria sem login — o pedido de
 * senha só aparecia ao clicar nas abas, uma a uma. Agora o sistema inteiro
 * fica atrás deste portão: sem sessão válida, só esta tela aparece.
 *
 * Quem entra vê apenas os módulos que os grants dele permitem (o menu vem do
 * servidor em /backend/v1/wa/sessao).
 */

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    // se já houver sessão válida, o App libera na próxima checagem
    setErro('')
  }, [])

  async function entrar(ev: React.FormEvent) {
    ev.preventDefault()
    if (entrando) return
    setErro('')
    setEntrando(true)
    try {
      await pb.collection('users').authWithPassword(email.trim(), senha)
      // recarrega para o App reler a sessão e montar o menu certo
      window.location.replace('/')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/Failed to authenticate|400/.test(msg)) {
        setErro('E-mail ou senha não conferem.')
      } else {
        setErro('Não consegui entrar: ' + msg)
      }
      setEntrando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-[linear-gradient(135deg,hsl(var(--marca-1)),hsl(var(--marca-2)))] text-white shadow-md">
            <Rocket className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Sistema Marketing
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Entre com seu e-mail e senha.</p>
          </div>
        </div>

        <form
          onSubmit={entrar}
          className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm"
        >
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="nome@haisan.com.br"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="senha" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          {erro !== '' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={entrando || email.trim() === '' || senha === ''}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
          >
            {entrando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            )}
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Esqueceu a senha? Fale com a gerência para redefinir.
        </p>
      </div>
    </div>
  )
}
