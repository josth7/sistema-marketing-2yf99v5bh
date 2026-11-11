import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'

/**
 * Seletor de empresa no topo (CA-3-90, SPEC-3-017).
 *
 * **A regra do consultor (aval 10/11):** funcionário é de **uma** empresa só e
 * não vê seletor nenhum. **Só os donos** têm as duas e trocam aqui.
 *
 * **Como funciona:** a escolha vai no header `X-Empresa` de toda chamada. O
 * servidor confere o grant e devolve **403** se a pessoa não tem a empresa —
 * então esconder o seletor é conforto, a trava de verdade está no backend.
 *
 * **Sem empresa escolhida:** o servidor usa a do grant. Por isso o componente
 * não aparece quando há só uma.
 */
export function SeletorEmpresa() {
  const [empresas, setEmpresas] = useState<{ id: string; nome: string; apelido: string }[]>([])
  const [ativa, setAtiva] = useState('')
  const [ehDono, setEhDono] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await pb.send('/backend/v1/empresas', { method: 'GET' })
        if (!vivo) return
        setEmpresas(r.empresas || [])
        setAtiva(r.ativa || '')
        setEhDono(r.eh_dono === true)
      } catch {
        // sem permissão ou offline: não mostra o seletor
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  // só o dono com mais de uma empresa vê o seletor
  if (!ehDono || empresas.length < 2) return null

  const trocar = (id: string) => {
    setAtiva(id)
    try {
      localStorage.setItem('empresa_ativa', id)
    } catch {
      /* ignore */
    }
    // recarrega para todas as telas refazerem as chamadas com o header novo
    window.location.reload()
  }

  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="sr-only">Empresa ativa</span>
      <select
        value={ativa}
        onChange={(e) => trocar(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium"
        title="Trocar de empresa (só os donos veem as duas)"
      >
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.apelido || e.nome}
          </option>
        ))}
      </select>
    </label>
  )
}
