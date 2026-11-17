# SPEC-3-018 — Testes do DEPOIS (provas por card)

**Data:** 17/11/2026 · **Versão no ar:** v0.0.167 · **Executor:** Michael
**Régua:** RN-199 — se um número mudar na comparação com o `inventario.md`,
para e registra.

## Resumo

| #   | Card                                | Estado | Como foi provado                  |
| --- | ----------------------------------- | ------ | --------------------------------- |
| 1   | Base visual (CA-3-121)              | ✅     | CSS publicado + conferido na tela |
| 2   | Navegação em dois níveis (CA-3-122) | ✅     | conferido na tela                 |
| 3   | Início, Painel e Gestão (CA-3-123)  | ✅     | **números conferidos um por um**  |
| 4   | Leads, funil e ficha (CA-3-124)     | ✅     | conferido na tela                 |
| 5   | Conversas, Atendimento, vendas      | ✅     | conferido na tela                 |
| 6   | Login e Minha senha (CA-3-125)      | ✅     | conferido na tela                 |
| 7   | Demais telas (CA-3-126)             | ✅     | 16 telas, 3 abertas para conferir |
| 8   | Celular e acessibilidade (CA-3-127) | ✅     | **medido, não olhado**            |

## Card 1 — base visual

**No CSS publicado** (`assets/index-*.css` do bundle):

| Verificação                            | Resultado                           |
| -------------------------------------- | ----------------------------------- |
| `--primary:0 0% 9%` (ação PRETA)       | ✅ presente                         |
| `--destaque:80 18% 55%` (verde-sálvia) | ✅ presente                         |
| `--radius:1rem`                        | ✅ presente                         |
| `.cartao-destaque`                     | ✅ presente                         |
| `--etapa-1` … `--etapa-10`             | ✅ presentes                        |
| Roxo antigo (`255 90%`)                | ✅ **zero ocorrências**             |
| `.dark`                                | ✅ **intacto**, como a RN-200 manda |

**Defeito encontrado e corrigido no caminho:** eu havia começado com **verde na
`--primary`**. A spec quer **preto** na ação e verde só como destaque. Corrigido
antes de seguir.

**Segundo defeito:** a classe `.cartao-destaque` estava dentro de `@layer base`
e o build a **descartava**. Movida para fora do layer; conferida no bundle.

## Card 2 — navegação

| Verificação                             | Resultado           |
| --------------------------------------- | ------------------- |
| Barra de 64 px com ícones por categoria | ✅ na tela          |
| Categoria ativa em círculo preto        | ✅                  |
| Painel de 240 px com os módulos         | ✅                  |
| Mesmo menu do servidor (`menu[]`)       | ✅ nenhum item novo |
| Nenhum contador ou busca criados        | ✅                  |

## Card 3 — Início, Painel e Gestão

### Números do Painel — ANTES × DEPOIS

| Métrica    | Inventário  | Depois          | Mudou? |
| ---------- | ----------- | --------------- | ------ |
| Gasto      | R$ 3.539,87 | **R$ 3.539,87** | ❌ não |
| Cliques    | 4.024       | **4.024**       | ❌ não |
| Impressões | 170.934     | **170.934**     | ❌ não |
| Alcance    | 129.171     | **129.171**     | ❌ não |
| CPC        | R$ 0,88     | **R$ 0,88**     | ❌ não |
| CPM        | R$ 20,71    | **R$ 20,71**    | ❌ não |
| CTR        | 2,35%       | **2,35%**       | ❌ não |

**RN-199 cumprida: nenhum número mudou.**

### CRM — ANTES × DEPOIS

| Métrica            | Inventário    | Depois            | Mudou? |
| ------------------ | ------------- | ----------------- | ------ |
| Receita ganha      | R$ 188.479,00 | **R$ 188.479,00** | ❌ não |
| Ticket médio       | R$ 6.731,39   | **R$ 6.731,39**   | ❌ não |
| Taxa de conversão  | 84,8%         | **84,8%**         | ❌ não |
| Pipeline em aberto | 1.966         | **1.966**         | ❌ não |

## Card 4 — Leads, funil e ficha

| Verificação                            | Resultado                            |
| -------------------------------------- | ------------------------------------ |
| Funil com as 10 colunas                | ✅                                   |
| Colunas em contêiner `--muted`         | ✅                                   |
| Ponto de cor por etapa no chip         | ✅ nome da etapa **sempre em texto** |
| Cartões de lead `rounded-lead` (16 px) | ✅                                   |
| Janelas em `rounded-janela` (24 px)    | ✅ 2 janelas                         |
| Receita preservada                     | ✅ R$ 188.479,00                     |
| Colunas vazias dizem "vazio"           | ✅                                   |

## Card 5 — Conversas e Atendimento

| Verificação                                          | Resultado            |
| ---------------------------------------------------- | -------------------- |
| Conversas carregam                                   | ✅ **824 conversas** |
| Robô ligado                                          | ✅                   |
| Bolha do cliente branca com borda                    | ✅                   |
| Bolha nossa em `--accent`                            | ✅                   |
| Botão de enviar em pílula preta                      | ✅                   |
| Recado interno com `--interna` e a palavra "Interna" | ✅                   |
| Nenhum erro na tela                                  | ✅                   |

## Card 6 — Login e Minha senha

| Verificação                           | Resultado                    |
| ------------------------------------- | ---------------------------- |
| Login em 2 colunas com cartão verde   | ✅ na tela                   |
| Campos `rounded-campo` (12 px), 44 px | ✅                           |
| Botão principal preto em pílula       | ✅                           |
| **Mesmos campos e mensagens**         | ✅ nenhuma mensagem alterada |
| Minha senha com os 3 campos no padrão | ✅                           |

## Card 7 — demais telas (16)

Trocadas em lote: `CabecalhoPagina` → `CabecalhoTela` (`descricao` → `subtitulo`),
`rounded-lg border` → `rounded-cartao border`, `rounded-md` → `rounded-campo`.

| Tela aberta para conferir | Resultado                                 |
| ------------------------- | ----------------------------------------- |
| Números                   | ✅ carrega, 5 conexões da Haisan          |
| Relatórios                | ✅ carrega, prévia do executivo           |
| Acessos                   | ✅ carrega, "Rodrigo (consultor)" aparece |

**Atenção:** `descricao=` que sobrou nesses arquivos pertence a `EstadoVazio`,
não ao cabeçalho — conferido em Alertas.

## Card 8 — celular e acessibilidade (medido)

| Verificação                                       | Resultado                             |
| ------------------------------------------------- | ------------------------------------- |
| Elementos estourando a largura (360 px)           | **0**                                 |
| Botões na tela de Acessos                         | **51**                                |
| Botões **sem nome acessível**                     | **0**                                 |
| Links sem nome                                    | **0**                                 |
| Contraste da borda de campo (`--input` 0 0% 58%)  | **3:1** sobre branco                  |
| Tabelas rolam dentro do cartão                    | ✅ Caixa, Painel, Relatórios, Leads   |
| Foco visível                                      | ✅ `:focus-visible` com anel `--ring` |
| Barra de ícones com `aria-label` e `aria-current` | ✅                                    |

## Regressão final

| Rota                  | Status |
| --------------------- | ------ |
| `/crm/leads`          | 200    |
| `/whatsapp/conversas` | 200    |
| `/gestao/resumo`      | 200    |
| `/wa/sessao`          | 200    |
| `/atendimento/config` | 200    |
| `/inbox`              | 200    |
| `/alert-criteria`     | 200    |
| `/decisions`          | 200    |
| `/reports`            | 200    |

**9/9 em 200.**

## O que NÃO foi provado (honestidade)

1. **O teste da Anezia (CL-039)** — a spec diz que ela faz o teste final com o
   uso dela. Não substituo isso.
2. **O tema escuro** — fora do escopo da RN-200, valores intactos, **não
   testado**.
3. **As capturas de tela do antes** não foram arquivadas como imagem; o
   `inventario.md` registra os **números** e a descrição de cada elemento.
4. **`GraficoBarras`** foi criado conforme a RN-203 item 5, mas o gráfico do
   Painel continua em **linhas** (`LineChart`), que é o formato certo para série
   temporal e o que a tela já tinha. **Nenhuma tela usa o `GraficoBarras` ainda.**
