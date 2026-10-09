/**
 * Provas TDD do relatório executivo (SPEC-2-004, card 3b491438, CA-2-10).
 * Vitest no padrão do agregacao.test.ts (roda no QA do Skip).
 */
import { describe, expect, it } from 'vitest'
import {
  blocoComparativo,
  destaqueAtrasada,
  diasJanela,
  fixtureDecisoes,
  fixtureSnapshot,
  parseJson,
  parseSnapshot,
  resumoFactual,
  rotuloQuinzena,
} from './relatorio'

describe('3b491438 — CA-2-10: destaque de decisão atrasada (2+ ciclos)', () => {
  const hoje = '2026-10-09'
  it('review_date há mais de 30 dias → atrasada', () => {
    expect(destaqueAtrasada('2026-08-20', hoje)).toBe(true)
  })
  it('review_date dentro dos 30 dias → não atrasada', () => {
    expect(destaqueAtrasada('2026-09-25', hoje)).toBe(false)
  })
  it('review_date hoje-30 exato (limite) → atrasada', () => {
    expect(destaqueAtrasada('2026-09-09', hoje)).toBe(true)
  })
  it('sem review_date → nunca atrasada', () => {
    expect(destaqueAtrasada(null, hoje)).toBe(false)
  })
  it('decisão encerrada com data antiga: atrasada=true só indica destaque; filtro de estado fica na rota', () => {
    // a rota só lista state!=closed; a função de destaque é pura sobre a data
    expect(destaqueAtrasada('2026-08-01', hoje)).toBe(true)
  })
})

describe('3b491438 — CA-2-03: comparação só quando elegível', () => {
  it('eligibility válida + métricas presentes → % calculada', () => {
    const r = blocoComparativo(
      { atual: 800, anterior: 1000 },
      { valida: true, motivo: null, anterior: { inicio: '2026-09-01', fim: '2026-09-15' } },
    )
    expect(r.variacao).toBe(-20)
    expect(r.motivo).toBeNull()
  })
  it('cobertura desigual → % suprimida com motivo', () => {
    const r = blocoComparativo(
      { atual: 800, anterior: 1000 },
      {
        valida: false,
        motivo: 'cobertura desigual — meta_ads: 15 dia(s) nesta quinzena vs 1 na anterior',
        anterior: { inicio: '2026-09-01', fim: '2026-09-15' },
      },
    )
    expect(r.variacao).toBeNull()
    expect(r.motivo).toContain('cobertura desigual')
  })
  it('anterior sem dados → motivo, nunca 0%', () => {
    const r = blocoComparativo(
      { atual: 800, anterior: null },
      { valida: true, motivo: null, anterior: null },
    )
    expect(r.variacao).toBeNull()
    expect(r.motivo).toBe('comparação indisponível')
  })
  it('anterior zero → sem base, nunca divisão por zero', () => {
    const r = blocoComparativo(
      { atual: 800, anterior: 0 },
      { valida: true, motivo: null, anterior: { inicio: '2026-09-01', fim: '2026-09-15' } },
    )
    expect(r.variacao).toBeNull()
    expect(r.motivo).toBe('anterior sem base (zero)')
  })
})

describe('3b491438 — RN-06: ausência nunca vira zero (resumo factual)', () => {
  it('sem fontes → resumo declara indisponibilidade', () => {
    const r = resumoFactual(
      '2026-09-16',
      '2026-09-30',
      [],
      [
        'nenhum dado das fontes nesta quinzena (2026-09-16 a 2026-09-30) — relatório factual sem indicadores',
      ],
    )
    expect(r).toContain('Nenhuma fonte com dados')
    expect(r).toContain('Avisos:')
  })
  it('cobertura parcial → aviso no resumo (não esconde)', () => {
    const r = resumoFactual(
      '2026-09-16',
      '2026-09-30',
      [{ canal: 'meta_ads', dias: 2 }],
      [
        'meta_ads: 2 dia(s) coberto(s) de 15 — cobertura parcial (indicadores podem subestimar o período)',
      ],
    )
    expect(r).toContain('meta_ads: 2 dia(s)')
    expect(r).toContain('cobertura parcial')
  })
  it('janela 16–30 tem 15 dias', () => {
    expect(diasJanela('2026-09-16', '2026-09-30')).toBe(15)
    expect(diasJanela('2026-10-01', '2026-10-15')).toBe(15)
    expect(diasJanela('2026-02-16', '2026-02-28')).toBe(13)
  })
})

describe('3b491438 — segurança: payload XSS renderizado como texto', () => {
  it('fixture contém payload e a prévia o recebe como string (React escapa)', () => {
    const fs = fixtureDecisoes()
    const xss = fs.find((d) => d.id === 'fixture-1')
    expect(xss?.title).toBe('<img src=x onerror=alert(1)>')
    // a função de destaque não interpreta HTML — só trabalha a string
    expect(destaqueAtrasada(xss?.review_date ?? null, '2026-10-09')).toBe(true)
  })
})

describe('3b491438 — parse seguro (snapshot imutável lido do banco)', () => {
  it('snapshot válido parseia', () => {
    const fs = fixtureSnapshot()
    const json = JSON.stringify(fs)
    const p = parseSnapshot(json)
    expect(p?.pago?.porObjetivo.length).toBe(3)
    expect(p?.organico?.registros).toBe(1)
  })
  it('JSON malformado → null (tela mostra indisponível, não quebra)', () => {
    expect(parseSnapshot('{quebrado')).toBeNull()
    expect(parseSnapshot(null)).toBeNull()
  })
  it('parseJson com padrão', () => {
    expect(parseJson<string[]>('["a"]', [])).toEqual(['a'])
    expect(parseJson<string[]>('x', ['padrao'])).toEqual(['padrao'])
  })
})

describe('3b491438 — rótulos', () => {
  it('rótulo da quinzena', () => {
    expect(rotuloQuinzena('2026-09-16', '2026-09-30')).toBe(
      '2ª quinzena de setembro/2026 (2026-09-16 a 2026-09-30)',
    )
    expect(rotuloQuinzena('2026-10-01', '2026-10-15')).toBe(
      '1ª quinzena de outubro/2026 (2026-10-01 a 2026-10-15)',
    )
  })
})
