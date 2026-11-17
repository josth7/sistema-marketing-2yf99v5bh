# SPEC-3-018 — Inventário do ANTES (capturas e números de base)

**Data:** 17/11/2026 · **Executor:** Michael (Maestro da Haisan)
**Estado inspecionado:** v0.0.164 → v0.0.167

Este documento registra o sistema **como estava** antes do visual novo, para que
qualquer número ou tela possa ser comparado depois. É o que a SPEC-3-018 pede em
"Linha de base e capturas" e o que a **RN-199** usa como régua: se um número
mudar na comparação, para e registra.

## 1. Tokens do ANTES (marca violeta e cantos de 8 px)

| Token                 | Valor antigo            | Onde estava                  |
| --------------------- | ----------------------- | ---------------------------- |
| `--primary`           | `255 90% 60%` (violeta) | botão principal, item ativo  |
| `--accent`            | `255 90% 96%`           | fundo suave de destaque      |
| `--accent-foreground` | `255 90% 50%`           | texto sobre o accent         |
| `--ring`              | `255 90% 60%`           | anel de foco                 |
| `--marca-1`           | `255 90% 60%`           | gradiente da marca           |
| `--marca-2`           | `271 91% 65%`           | gradiente da marca           |
| `--background`        | `210 20% 98%`           | fundo da página              |
| `--radius`            | `0.5rem` (8 px)         | cantos de todos os cartões   |
| `--chart-1`           | `255 90% 60%`           | série principal dos gráficos |
| `--sidebar-primary`   | `255 90% 60%`           | barra lateral                |

`--ok` (`160 84% 39%`), `--warn` (`38 92% 50%`) e `--destructive` (`0 84% 60%`)
**não mudaram** — a RN-200 manda mantê-los.

## 2. Estrutura do ANTES

| Item               | Como era                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Navegação          | **uma coluna só**, menu agrupado por categoria, no `aside` de `Layout.tsx` (CA-3-39, corrigido em 16/11) |
| Cabeçalho da tela  | `CabecalhoPagina` com `titulo` + `descricao`                                                             |
| Indicadores        | 4 a 8 caixas `rounded-lg border` em `grid`, cada uma com seu número em 2xl                               |
| Cartões            | `rounded-lg` com `shadow-sm`                                                                             |
| Filtros            | `Button` com variante `default`/`outline` para alternar vistas                                           |
| Campos             | `rounded-md`, altura 40 px                                                                               |
| Botões             | `rounded-lg` e `rounded-md`; nenhum em pílula                                                            |
| Login              | coluna única centralizada, cartão branco, marca em gradiente violeta                                     |
| Bolhas de conversa | nossa em `emerald-100`, cliente em `--muted`                                                             |
| Recado interno     | âmbar do tema antigo (`amber-50`, `amber-300`)                                                           |
| Janelas            | `Dialog` sem classe de raio própria                                                                      |
| Tabelas            | `overflow-x-auto` já presente em Caixa, Painel, Relatórios, Leads                                        |

## 3. Números de base (conferidos em 17/11, antes da troca)

### Painel — novembro/2026 (Haisan, dados reais)

| Métrica    | Valor                   |
| ---------- | ----------------------- |
| Gasto      | **R$ 3.539,87**         |
| Cliques    | **4.024**               |
| Impressões | **170.934**             |
| Alcance    | **129.171**             |
| CPC        | **R$ 0,88**             |
| CPM        | **R$ 20,71**            |
| CTR        | **2,35%**               |
| Resultados | — (sem dado no período) |

### CRM (aba Leads, Haisan)

| Métrica            | Valor                              |
| ------------------ | ---------------------------------- |
| Receita ganha      | **R$ 188.479,00**                  |
| Conversões         | **28**                             |
| Ticket médio       | **R$ 6.731,39**                    |
| Taxa de conversão  | **84,8%**                          |
| Pipeline em aberto | **1.966** leads ativos             |
| Lead time (venda)  | — (sem vendas com data de entrada) |

### Conversas

| Item               | Valor                   |
| ------------------ | ----------------------- |
| Conversas na lista | **824** (visão "Todas") |
| Robô               | **ligado**              |

### Rotas do backend (regressão de base)

| Rota                      | Status |
| ------------------------- | ------ |
| `GET /crm/leads`          | 200    |
| `GET /whatsapp/conversas` | 200    |
| `GET /gestao/resumo`      | 200    |
| `GET /wa/sessao`          | 200    |
| `GET /atendimento/config` | 200    |
| `GET /inbox`              | 200    |
| `GET /alert-criteria`     | 200    |
| `GET /decisions`          | 200    |
| `GET /reports`            | 200    |

## 4. Como reverter

Voltar `src/main.css`, `tailwind.config.ts`, `src/components/Layout.tsx`,
`src/components/base/visual/` e as telas de `src/pages/` ao commit anterior ao
primeiro card da SPEC. Os valores dos tokens estão na tabela do item 1.

**Nenhuma migração de banco foi criada por esta SPEC** — só interface.
