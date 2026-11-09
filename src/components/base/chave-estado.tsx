import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Dica } from '@/components/base/dica'

/**
 * Chave de liga/desliga com ESTADO VISÍVEL (CA-3-101, pedido da Sabrina 09/11).
 *
 * **O problema:** a chave do shadcn muda de posição, mas quem olha de longe
 * (ou no celular, no sol) não distingue ligado de desligado. A Sabrina pediu
 * **cor e texto**.
 *
 * **A regra:**
 *   - **ligada** → cor de destaque do design system + a palavra **"Ligado"**;
 *   - **desligada** → cinza + a palavra **"Desligado"**;
 *   - a cor e o texto mudam **na hora** em que a chave muda;
 *   - se o servidor **recusar**, volta ao estado anterior (e mostra o motivo).
 *
 * **O "volta atrás" é o ponto delicado.** Mudar a cor antes de o servidor
 * confirmar dá sensação de rapidez — mas se ele recusar, a tela estaria
 * mentindo. Aqui o estado é otimista: muda na hora e, se a gravação falhar,
 * retorna sozinho ao que era.
 */
export function ChaveEstado({
  ligada,
  aoMudar,
  rotulo,
  dica,
  desabilitada = false,
}: {
  ligada: boolean
  /** Deve lançar (ou devolver Promise rejeitada) se o servidor recusar. */
  aoMudar: (novo: boolean) => Promise<void> | void
  rotulo?: string
  dica?: string
  desabilitada?: boolean
}) {
  // estado otimista: a tela responde antes do servidor
  const [valor, setValor] = useState(ligada)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // se o pai recarregar e o valor mudar, acompanha
  useEffect(() => {
    setValor(ligada)
  }, [ligada])

  const alternar = async (novo: boolean) => {
    const anterior = valor
    setValor(novo) // muda a cor na hora
    setErro('')
    setSalvando(true)
    try {
      await aoMudar(novo)
    } catch (e) {
      // servidor recusou: volta ao estado anterior
      setValor(anterior)
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const conteudo = (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={valor}
        disabled={desabilitada || salvando}
        onCheckedChange={(v) => void alternar(v)}
      />
      <span
        className={
          'text-xs font-medium ' +
          (valor ? 'text-primary' : 'text-muted-foreground') +
          (salvando ? ' opacity-60' : '')
        }
      >
        {salvando ? 'Salvando…' : valor ? 'Ligado' : 'Desligado'}
      </span>
    </span>
  )

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {rotulo ? (
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{rotulo}</span>
          {dica ? <Dica texto={dica}>{conteudo}</Dica> : conteudo}
        </span>
      ) : dica ? (
        <Dica texto={dica}>{conteudo}</Dica>
      ) : (
        conteudo
      )}
      {erro !== '' && (
        <span className="max-w-[240px] text-right text-[11px] leading-snug text-destructive">
          {erro}
        </span>
      )}
    </span>
  )
}
