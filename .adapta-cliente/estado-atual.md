# Estado atual — Sistema Marketing (plugin do cliente)

- task_ativa: lembrete de decisão (SPEC-2-003, CA-2-09, a434ca96, !29/10)
- etapa_nova_task: aguardando_teste_humano
- skip_versao: v0.0.145 (ab96e02), publicada 2026-10-16T12:15:09Z
- skip_publicacao: publicada:ab96e02 em 2026-10-16T12:15:09Z
- fase: 2 — 12/12 originais + CA-2-19 concluídos; a434ca96 em teste humano; restam workshop (22/10) e demonstração (03/11)
- implementado: migração 0030 (inbox multi-tipo: tipo/decision_id/dedupe_key) + 0031 (cron lembrete_revisao PAUSADO — gate destinatários reais) + 0032 (report_id opcional) + 0033 (índice UNIQUE parcial); hook lembretes.js (cron 09:30 UTC pausado + tick de teste + cessação por reagendamento/encerramento com dedupe_key decision+revision+data+user); caixa.js estendida (item lembrete traz decisão); página /caixa renderiza "Revisão vencida" + "Abrir decisão"
- provas: 401; lembrete criado com decisão na caixa; replay 0 duplicatas; 2ª decisão → 2º lembrete; cessação por reagendamento (cancelled preservado) e por encerramento; novo lembrete na data nova; 11 lembretes de decisões fixture antigas vencidas (correto)
- achados corrigidos: 0032 (report_id required — mutação direta não persiste; migração aplicada não re-executa) e 0033 (UNIQUE parcial p/ lembretes do mesmo usuário)
- pendente_github: sim — espelho do código + changelog + fase.md no fechamento (após teste humano)
- teste_humano: pendente — Josth confere a caixa /caixa (lembrete fixture "Revisar criativos" na conta criterios.fixture.aprovador@haisan.com.br / Fixture@2026)
- gate: cron PAUSADO (destinatários reais pendentes do workshop 22/10)
- proxima_acao: teste humano do dono; fechamento (GitHub + changelog + fase.md) após "funcionou"
- atualizado_em: 2026-10-16T12:20:00Z
