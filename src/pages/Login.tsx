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
 *
 * SPEC-3-018 / CA-3-125 (17/11) — LOGIN DIVIDIDO COM O CARTÃO VERDE:
 * a tela passa a ter dois lados. À esquerda, o cartão em gradiente verde
 * (`.cartao-destaque`, o mesmo token do painel) com a marca e uma frase curta;
 * à direita, o formulário. No celular o cartão verde fica no topo, menor.
 * MESMOS campos, MESMAS mensagens, MESMO fluxo — só a aparência mudou.
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-cartao bg-card md:grid-cols-2">
        {/* ---------- CARTÃO VERDE (esquerda no desktop, topo no celular) ---------- */}
        <div className="cartao-destaque flex flex-col justify-between p-6 md:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white">
              <Rocket className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-white/90">Haisan</span>
          </div>

          <div className="mt-8 md:mt-0">
            <h1 className="text-login font-semibold text-white">Sistema Marketing</h1>
            <p className="mt-3 max-w-xs text-sm text-white/80">
              Atendimento, vendas e mídia da Haisan num só lugar.
            </p>
          </div>

          <p className="mt-8 hidden text-xs text-white/70 md:block">
            Design e qualidade ao seu alcance.
          </p>
        </div>

        {/* ---------- FORMULÁRIO ---------- */}
        <div className="flex flex-col justify-center gap-5 p-6 md:p-10">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Entrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Entre com seu e-mail e senha.</p>
          </div>

          <form onSubmit={entrar} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-rotulo-campo font-medium">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-campo border border-input bg-card px-4 py-2.5 text-sm"
                placeholder="nome@haisan.com.br"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="senha" className="text-rotulo-campo font-medium">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-campo border border-input bg-card px-4 py-2.5 text-sm"
                required
              />
            </div>

            {erro !== '' && (
              <div className="rounded-campo border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </div>
            )}

            {/* RN-204: botão principal PRETO, em pílula, 44 px no formulário */}
            <button
              type="submit"
              disabled={entrando || email.trim() === '' || senha === ''}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
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
    </div>
  )
}
