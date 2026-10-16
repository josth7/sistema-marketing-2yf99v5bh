/**
 * Versão real do sistema exibida no rodapé (SPEC-2-007, CA-2-16).
 *
 * O Skip não injeta a versão da build no frontend (nem VITE_APP_VERSION nem
 * endpoint público de versão) — esta constante é a ÚNICA origem do número no
 * rodapé e acompanha a publicação que a contém. Substitui o "v1.0.0" fixo do
 * cabeçalho. Limitação registrada na evidência do card: atualizar este valor
 * é manual a cada publicação; a fonte canônica continua sendo o Skip.
 */
export const VERSAO_SISTEMA = 'v0.0.137'
