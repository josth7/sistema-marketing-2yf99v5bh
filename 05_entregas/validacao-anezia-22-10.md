# Guia — Validação das regras pela Anézia (ANTECIPADA — pode ser hoje)

**Objetivo:** a Anézia confere as 4 regras de alerta aprovadas pelo dono em 16/10 e valida (ou pede ajuste). Nada de código pendente — é conferência de negócio. O dono autorizou antecipar: **não precisa esperar 22/10**.

## Como ela entra

1. Abrir **https://sistema-marketing-1f51e.goskip.app**
2. Logar com **anezia@haisan.com.br** + senha temporária (o Josth tem as senhas entregues em 15/10)
3. Menu **Critérios** — as 4 regras aparecem com estado **aprovada**

## As 4 regras (ata completa em criterios-alerta-aprovados.md)

| #   | O que vigia                 | Canal      | Dispara quando                                        | Calendário |
| --- | --------------------------- | ---------- | ----------------------------------------------------- | ---------- |
| 1   | Resultados (leads)          | Meta Ads   | **caem ≥ 20%** vs quinzena anterior (base ≥ 10)       | quinzenal  |
| 2   | Gasto                       | Meta Ads   | **sobe ≥ 30%** vs mês anterior (base ≥ R$ 100)        | mensal     |
| 3   | Custo por resultado (leads) | Meta Ads   | **sobe ≥ 25%** vs mês anterior (base ≥ 10 resultados) | mensal     |
| 4   | Cliques                     | Google Ads | **caem ≥ 30%** vs quinzena anterior (base ≥ 50)       | quinzenal  |

Responsável de todas: Anézia. Aprovadas pelo dono em 16/10.

## O que conferir (3 perguntas)

1. **Os limiares fazem sentido para a operação?** (20% / 30% / 25% / 30%)
2. **A base mínima está certa?** (evita alerta por causa de número pequeno)
3. **O calendário está certo?** (quinzenal = compara 1–15 com 16–fim; mensal = mês com mês)

## Se precisar mudar algo

Editar a regra na tela cria uma **nova versão em rascunho** — a prova da versão antiga fica intacta. Como quem editou não pode aprovar a si mesma, a nova versão é aprovada pelo **dono** (josth7@icloud.com). O alerta passa a valer na versão nova aprovada.

## O que NÃO precisa fazer

- Não ativa nem desativa job — os 3 já estão ativos desde 16/10
- Não define destinatários do relatório — já confirmados (3 e-mails)
- Não cadastra nada novo — só valida as 4 existentes

## Quando os alertas começam

Primeiros alertas reais **a partir de 01/11** (outubro fecha e o sistema compara a quinzena/mês com o período anterior). Hoje a fila /alertas está vazia de alertas reais porque os dados reais começam 30/09 — sem período anterior completo o sistema não inventa alerta.

---

## Mensagem pronta para o WhatsApp (o Josth envia)

> Anézia, as 4 regras de alerta que definimos já estão no sistema e aprovadas. Dá uma olhada até dia 22: entra em sistema-marketing-1f51e.goskip.app, loga com anezia@haisan.com.br e a senha que te passo, abre o menu Critérios e confere os limiares (resultados −20%, gasto +30%, custo por resultado +25%, cliques Google −30%). Se algo precisar mudar, me diz que ajusto. A partir de 1º de novembro os alertas começam a sair sozinhos.
