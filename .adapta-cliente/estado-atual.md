# Estado atual — Sistema Marketing (plugin do cliente)

- task_ativa: alertas por critério + fila de análise (SPEC-2-002, CA-2-06/07, f7591165, !27/10)
- etapa_nova_task: aguardando_teste_humano
- skip_versao: v0.0.139 (publicada 16/10) — implementação v0.0.137 + fix histórico v0.0.138
- skip_publicacao: produção https://sistema-marketing-1f51e.goskip.app (ref 41e8f63 → v0.0.139)
- fase: 2 — 12/12 cards de código concluídos; este card é da esteira de dados (SPEC-2-002)
- implementado: migração 0029 (alerts + alertas_fixtures isoladas + grant manage_alerts de teste + cron PAUSADO), hook alertas.js (cron 09:15 UTC pausado + tick de teste + GET fila + PATCH transições com guards read/manage_alerts), serviço alertas.ts + página /alertas (login na própria página, transições Iniciar análise/Registrar decisão/Encerrar com justificativa), menu Alertas, versão v0.0.139
- provas: CA-2-06 (−25% exato, −20% inclusivo cruza, −19% não cruza), CA-2-07 (replay 3× 0 duplicatas, cobertura desigual, base < mínima, base ausente, draft não dispara), transições 200/422/409, 403 sem manage_alerts, 401 sem login, histórico preservado (fix v0.0.138 provado)
- achado corrigido: PATCH reescrevia history (json JSVM volta parseado) — fix + reprovação v0.0.138
- pendente_github: sim — espelho do código + changelog + fase.md no fechamento (após teste humano)
- teste_humano: pendente — Josth confere a tela /alertas (login criterios.fixture.aprovador@haisan.com.br / Fixture@2026; fila com 2 alertas fixture: −25% e −20%)
- gate: cron PAUSADO (CL-003) — ativação real só no workshop com Anézia (22/10)
- proxima_acao: teste humano do dono; fechamento (GitHub + changelog + fase.md) após "funcionou"
- atualizado_em: 2026-10-16T11:50:00Z
