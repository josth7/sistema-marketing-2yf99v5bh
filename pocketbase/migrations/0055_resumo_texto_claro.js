/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0055 — correção editorial do resumo publicado (a mando do dono, 22/10).
 *
 * Contexto: a Anezia APROVOU o resumo real da quinzena 1–15/10, mas o texto da IA
 * estava técnico demais para leigos em tráfego pago. O dono pediu texto mais claro.
 *
 * O que a migração faz (com trilha de auditoria):
 * - report_ai_summaries eij8fo50e9hnx8w: texto_publicado ← texto claro
 *   (rascunho NÃO é tocado — RN-27 preservado; a edição pós-aprovação é correção
 *   editorial registrada, não revisão de fluxo).
 * - reports g9tvducgquh7dfc (rev 6, criada pela revisão da Anezia): resumo_publicado
 *   ← mesmo texto claro; resumo_revisao_registro ganha sufixo da correção.
 * - Idempotente: só aplica se o texto atual for o original técnico.
 */

const TEXTO_CLARO = `O que aconteceu com o dinheiro dos anúncios entre 1 e 15 de outubro (linguagem simples):

1. Quanto foi gasto: R$ 2.150,11 no total, em 2 plataformas:
   - Meta (Facebook/Instagram): R$ 1.491,34 — quase 70% do dinheiro — trouxe 4.658 cliques; cada clique custou R$ 0,32.
   - Google: R$ 658,77 — 30% — trouxe 510 cliques; cada clique custou R$ 1,29 (4x mais caro que no Meta).
2. Para que foi cada parte do dinheiro (objetivo de cada campanha):
   - R$ 694,18 em anúncios de tráfego (levar gente para o site): 3.330 cliques.
   - R$ 513,93 em anúncios de leads (conseguir contato de cliente): 1.243 cliques.
   - R$ 283,23 em alcance (mostrar o anúncio para mais gente): 85 cliques.
   - R$ 658,77 em campanhas sem objetivo identificado no sistema: 510 cliques e custo de R$ 27,45 por resultado — é o ponto que merece atenção primeiro.
3. Dado incompleto: o Google só reportou 6 dos 15 dias (Meta 14 de 15). Os números podem mudar um pouco quando o Google completar o histórico.
4. Nenhum alerta disparou no período. Duas decisões seguem aguardando revisão no sistema.

Em uma frase: o Meta entregou cliques bem mais baratos que o Google, e o bloco de R$ 658,77 sem objetivo identificado é o primeiro ponto a investigar.`

migrate(
  (app) => {
    // 1. resumo
    let sum = null
    try {
      sum = app.findRecordById('report_ai_summaries', 'eij8fo50e9hnx8w')
    } catch (e) {
      console.log('0055: resumo eij8fo50e9hnx8w não encontrado — nada a fazer')
    }
    if (sum) {
      const atual = String(sum.get('texto_publicado') || '')
      if (atual.indexOf('Resumo factual da quinzena 1–15/10') === 0) {
        sum.set('texto_publicado', TEXTO_CLARO)
        app.save(sum)
        console.log('0055: texto_publicado do resumo atualizado (texto claro p/ leigo)')
      } else {
        console.log('0055: resumo já atualizado — pulado (idempotente)')
      }
    }
    // 2. report rev 6 (clonado na revisão)
    let rep = null
    try {
      rep = app.findRecordById('reports', 'g9tvducgquh7dfc')
    } catch (e) {
      console.log('0055: report g9tvducgquh7dfc não encontrado — nada a fazer')
    }
    if (rep) {
      const atualR = String(rep.get('resumo_publicado') || '')
      if (atualR.indexOf('Resumo factual da quinzena 1–15/10') === 0) {
        rep.set('resumo_publicado', TEXTO_CLARO)
        const reg = String(rep.get('resumo_revisao_registro') || '')
        rep.set(
          'resumo_revisao_registro',
          reg + ' · texto reescrito em linguagem simples a mando do dono (22/10)',
        )
        app.save(rep)
        console.log('0055: resumo_publicado da rev 6 atualizado + registro da correção')
      } else {
        console.log('0055: report já atualizado — pulado (idempotente)')
      }
    }
  },
  (app) => {
    // rollback: restaura o texto técnico original (rascunho da IA)
    const ORIGINAL =
      'Resumo factual da quinzena 1–15/10 (dados parciais: meta_ads 14/15 dias, google_ads 6/15). Gasto total registrado: R$ 2.150,11 em 45 registros. Por objetivo: tráfego R$ 694,18 com 3.330 cliques; não informado R$ 658,77 com 510 cliques (custo por resultado R$ 27,45); leads R$ 513,93 com 1.243 cliques; alcance R$ 283,23 com 85 cliques. Nenhum alerta aberto registrado. Duas decisões seguem em revisão. Cobertura parcial: google_ads sem 9 dias do período.'
    try {
      const sum = app.findRecordById('report_ai_summaries', 'eij8fo50e9hnx8w')
      sum.set('texto_publicado', ORIGINAL)
      app.save(sum)
    } catch (e) {}
    try {
      const rep = app.findRecordById('reports', 'g9tvducgquh7dfc')
      rep.set('resumo_publicado', ORIGINAL)
      const reg = String(rep.get('resumo_revisao_registro') || '')
      rep.set(
        'resumo_revisao_registro',
        reg.replace(' · texto reescrito em linguagem simples a mando do dono (22/10)', ''),
      )
      app.save(rep)
    } catch (e) {}
  },
)
