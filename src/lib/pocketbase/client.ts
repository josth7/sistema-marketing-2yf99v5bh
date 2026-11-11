import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

/**
 * Empresa ativa no header de TODA chamada (CA-3-90, SPEC-3-017).
 *
 * **A regra:** o servidor decide pela empresa do grant; o header só **pede** uma
 * empresa específica. Se a pessoa não tiver grant dela, o servidor devolve
 * **403** — então trocar aqui no navegador não dá acesso a nada.
 *
 * **Só o dono vê o seletor** (o componente checa `eh_dono`). Para os outros, o
 * header vai vazio e o servidor usa a empresa do grant.
 */
pb.beforeSend = function (url, options) {
  const h = (options.headers || {}) as Record<string, string>
  try {
    const emp = localStorage.getItem('empresa_ativa')
    if (emp !== null && emp !== '') h['X-Empresa'] = emp
  } catch {
    /* localStorage indisponível: segue sem o header */
  }
  return { url, options: { ...options, headers: h } }
}

export default pb
