# Análise — Padronizar a base visual e a navegação do sistema (SPEC-2-007, CA-2-16)

Data: 15/10/2026 · Executor: Mikael (plugin do cliente) · Estado: aguardando_autorizacao

## Objetivo e resultado observável

Todas as telas existentes (Painel, Critérios, Decisões, Relatórios, Caixa) passam a usar UMA base
visual (tokens de cor, tipografia, espaço, raio e sombra) e UM cabeçalho com navegação só para
módulos existentes. A versão real do Skip aparece no rodapé (sai o "v1.0.0" fixo). O selo
"DEMONSTRAÇÃO" aparece em todas as telas quando o modo está ativo. Nenhuma regra, dado, rota, job
ou cálculo muda — só apresentação (SPEC-2-007, decisão 1).

## Estado atual (inventário técnico, versão viva v0.0.119 / ref 0082c51)

Arquivos de interface existentes (lista completa do working tree do Skip):

- `src/App.tsx` — rotas: / (Index→Painel), /criterios, /decisoes, /relatorios, /caixa, \* NotFound
- `src/components/Layout.tsx` — menu atual: Painel, Critérios, Decisões, Relatórios, Caixa
- `src/pages/`: Painel.tsx, Criterios.tsx, Decisoes.tsx, Relatorios.tsx, Caixa.tsx, Index.tsx, NotFound.tsx
- `src/components/ui/*` — shadcn (NÃO EDITAR, por regra do mapa)
- `src/main.css` + `tailwind.config.ts` — tema atual (a base de tokens nasce aqui)
- `src/lib/marketing/erros-custom.ts` — leitor de erros (contrato {ok:false, erro, campos, detalhe})

Estado visual atual (da SPEC, capturas de 07/10): cabeçalho "SISTEMA MARKETING" com link "Painel" e
selo `v1.0.0` fixo; faixas de status empilhadas por fonte; linha técnica "33 registros carregados do
PocketBase (origem api/csv)"; filtros sem rótulo com texto cortado; percentuais com ponto decimal;
"RN-05" exposto. O card CA-2-16 NÃO corrige o painel (é o próximo card, CA-2-17) — aqui só tokens,
componentes base, cabeçalho, rodapé e selo de demonstração em todas as telas.

## Plano de implementação (só arquivos de interface)

1. **Tokens** em `src/main.css` + `tailwind.config.ts` (variáveis CSS):
   - primária: roxo atual (logo/foco); semânticas: verde ok / âmbar atenção / vermelho erro / cinza neutro
   - cores fixas por fonte: Meta Ads, Google Ads, Meta orgânico
   - tipografia, espaço, raio e sombra padronizados (uma origem só)
2. **Componentes base** (`src/components/base/`): Botão, Campo, Seletor, Cartão, Chip, FaixaAviso,
   Tabela, CabecalhoPagina (título + 1 linha de descrição + ações à direita), Estados (Carregando
   esqueleto / Vazio / Erro com "Tentar de novo" / Indisponível "—"). shadcn continua por baixo.
3. **Cabeçalho/Layout**: logo + "Sistema Marketing" + navegação só para módulos existentes
   (Painel, Critérios, Decisões, Relatórios, Caixa) + selo DEMONSTRAÇÃO quando ativo; menu do
   usuário fica para quando a SPEC-2-005 o pedir (contas reais já existem — avaliar no card).
4. **Rodapé**: versão real do Skip em texto pequeno (lida da build, não fixa).
5. **Aplicar** os componentes base nas 5 telas existentes SEM mudar campos, validações, estados
   lógicos ou permissões (a tela de critérios mantém tudo — CA-2-18 é que padroniza estados).

## Matriz critério → prova (CA-2-16)

| Critério                             | Prova                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| Tokens únicos                        | capturas + diff mostrando cores/espaços vindos só das variáveis |
| Componentes base em todas as telas   | lista de telas × componentes usados                             |
| Navegação só para módulos existentes | clique em cada link do cabeçalho (nenhum quebrado)              |
| Versão real no rodapé                | captura do rodapé com a versão publicada                        |
| Selo DEMONSTRAÇÃO em todas as telas  | captura das 5 telas com o modo ativo                            |
| Padrão de cabeçalho de página        | captura de cada página com título/descrição/ações               |
| Números iguais                       | conferência outubro/2026 real e agosto/2026 demo antes × depois |

## Riscos e limites

- **Regressão de números**: qualquer divergência = PARAR e registrar (regra da SPEC). Mitigação:
  capturar os valores antes (inventário) e conferir depois com os mesmos filtros.
- **Tela de critérios**: não mudar campos/validações/permissões — só a pele.
- **Inventário com capturas antes (360/768/1440, real e demo)**: passo 1 obrigatório da SPEC,
  salvo em `05_entregas/spec-2-007/inventario.md`.
- Sem migração, sem rota nova, sem hook — QA do Skip continua provando build/estática.

## Teste humano

José (e Anézia no uso diário) conferem: navegação, rodapé com versão, selo de demonstração em
todas as telas e aparência padronizada — sem mudança de números.

## Próximo passo

`aguardar autorização para implementar`.
