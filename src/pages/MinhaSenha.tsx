import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'

/**
 * Tela Minha senha (30/10).
 *
 * Por que existe: os acessos do piloto nasceram com a senha provisória
 * `Haisan@2026`, definida por migração e conhecida por mais de uma pessoa.
 * Aqui a pessoa troca por uma senha só dela.
 *
 * O servidor confere a senha atual, exige 8+ caracteres e recusa repetir a
 * provisória — a tela só mostra o recado que vem de lá.
 */

type Status = {
  provisoria: boolean
  nome: string
  email: string
}

export default function MinhaSenha() {
  const [status, setStatus] = useState<Status | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroStatus, setErroStatus] = useState('')

  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [nova2, setNova2] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [recado, setRecado] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const s = (await pb.send('/backend/v1/minha-senha/status', { method: 'GET' })) as Status
        if (vivo) setStatus(s)
      } catch (e) {
        if (vivo) setErroStatus(e instanceof Error ? e.message : String(e))
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function trocar(ev: React.FormEvent) {
    ev.preventDefault()
    if (enviando) return
    setErro('')
    setRecado('')
    setEnviando(true)
    try {
      const r = (await pb.send('/backend/v1/minha-senha', {
        method: 'POST',
        body: JSON.stringify({ senha_atual: atual, senha_nova: nova, senha_nova2: nova2 }),
        headers: { 'Content-Type': 'application/json' },
      })) as { mensagem: string }
      setRecado(r.mensagem || 'Senha alterada.')
      setAtual('')
      setNova('')
      setNova2('')
      const s = (await pb.send('/backend/v1/minha-senha/status', { method: 'GET' })) as Status
      setStatus(s)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErro(msg.replace(/^.*?"erro":"?/, '').replace(/"?}?$/, '') || msg)
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando…</span>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 md:p-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">Minha senha</h1>
        </div>

        {erroStatus !== '' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Não consegui carregar seu status: {erroStatus}
          </div>
        )}

        {status && (
          <div
            className={
              'rounded-lg border px-4 py-3 text-sm ' +
              (status.provisoria
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-900')
            }
          >
            <div className="flex items-start gap-2">
              {status.provisoria ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <div>
                {status.provisoria ? (
                  <>
                    <strong>Você ainda usa a senha provisória.</strong>
                    <p className="mt-1 leading-snug">
                      Ela foi definida na instalação e é a mesma para todo o time. Troque por uma
                      senha só sua — leva dez segundos.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Senha pessoal ativa.</strong>
                    <p className="mt-1 leading-snug">
                      Ninguém além de você conhece esta senha. Se desconfiar de algo, troque de
                      novo.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {status && (status.nome !== '' || status.email !== '') && (
          <p className="text-xs text-muted-foreground">
            {status.nome} · {status.email}
          </p>
        )}

        <form onSubmit={trocar} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <label htmlFor="atual" className="text-sm font-medium">
              Senha atual
            </label>
            <input
              id="atual"
              type="password"
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="nova" className="text-sm font-medium">
              Senha nova
            </label>
            <input
              id="nova"
              type="password"
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              minLength={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <p className="text-[11px] text-muted-foreground">Mínimo 8 caracteres.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="nova2" className="text-sm font-medium">
              Repita a senha nova
            </label>
            <input
              id="nova2"
              type="password"
              autoComplete="new-password"
              value={nova2}
              onChange={(e) => setNova2(e.target.value)}
              minLength={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          {erro !== '' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro}
            </div>
          )}
          {recado !== '' && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {recado}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando || atual === '' || nova === '' || nova2 === ''}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {enviando ? 'Alterando…' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
