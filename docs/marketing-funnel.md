# Funil de marketing (Stripe → n8n → MailerLite)

Acompanha o ciclo de vida do utilizador — **signup, abandono de carrinho, trial e
cancelamento/win-back** — sem acoplar lógica de email ao produto.

## Arquitetura

```
Backend (Express)                     n8n                         MailerLite
─────────────────                     ───                         ──────────
auth.register ─┐
billing.checkout ─┤  POST              Webhook /evidentia-funnel
Stripe webhook ─┘  N8N_WEBHOOK_URL ──► Code (evento → grupo) ──►   upsert subscritor
                   (event, email,      IF (tem email+grupo?)       + atribui ao grupo
                    name, plan, ...)    HTTP → MailerLite API              │
                                                                           ▼
                                                            Automação por grupo
                                                            (delays + emails)
```

- **Backend = emissor fino.** `src/lib/marketing.ts` faz `emitFunnelEvent(event, payload)`.
  No-op gracioso se `N8N_WEBHOOK_URL` não estiver definido (mesmo padrão do Stripe).
  Nunca lança erro para o pedido do utilizador — uma falha de marketing não pode partir
  um signup ou um webhook Stripe.
- **n8n = router + sincronização.** Recebe o evento, faz upsert do subscritor no MailerLite
  e atribui-o ao grupo da etapa.
- **MailerLite = motor de email.** Cada grupo tem uma automação (gatilho = entrada no grupo)
  que trata dos delays e do envio. Editar copy/timing não exige redeploy.

## Eventos do funil

| Evento | Origem no backend | Grupo MailerLite | Automação |
|---|---|---|---|
| `signup` | `auth.ts` registo | Evidentia · Signups | Boas-vindas + ativação |
| `checkout_started` | `billing.ts` checkout | Evidentia · Checkout iniciado | (segmentação; sem email) |
| `checkout_abandoned` | Stripe `checkout.session.expired` | Evidentia · Checkout abandonado | Nudge 1h + 2d |
| `trial_started` | Stripe `checkout.session.completed` | Evidentia · Trial ativo | Onboarding (dia 0 + dia 3) |
| `trial_will_end` | Stripe `customer.subscription.trial_will_end` | Evidentia · Trial a terminar | Lembrete (3 dias antes) |
| `trial_canceled` | Stripe `subscription.updated` (`cancel_at_period_end`) | Evidentia · Cancelado (win-back) | Win-back / reinscrição |
| `subscription_active` | Stripe `subscription.updated` → `active` | Evidentia · Cliente pago | Boas-vindas pago |
| `payment_failed` | Stripe `invoice.payment_failed` | Evidentia · Pagamento falhou | Dunning (dia 0 + dia 2) |
| `subscription_canceled` | Stripe `customer.subscription.deleted` | Evidentia · Cancelado (win-back) | Win-back / reinscrição |

## Reset de password (transacional)

Fluxo self-service, integrado no mesmo webhook:

1. `POST /api/auth/forgot-password` `{ email }` — devolve sempre 200 (não revela se a
   conta existe). Se existir, gera um token, guarda só o **hash SHA-256 + expiry (1h)** em
   `users.password_reset_token_hash` / `password_reset_expires` e emite o evento
   **`password_reset`** com `resetUrl = {FRONTEND_URL}/reset-password?token=<raw>`.
2. n8n recebe `password_reset` → **Ramo 3** → envia o email (Gmail) ao **próprio utilizador**
   com o link (não passa pelo MailerLite nem alerta o admin).
3. `POST /api/auth/reset-password` `{ token, password }` — valida o hash + expiry, define a
   nova password (bcrypt) e limpa o token (uso único).

Frontend: link "Esqueceste-te da password?" no login → `/forgot-password` → `/reset-password?token=`.

> Como é transacional, **depende do n8n estar ativo e do `N8N_WEBHOOK_URL` definido**. Se o
> funil estiver desligado, o pedido devolve 200 mas o email não sai. Correr a migration `007`.

## Identidade de envio (Dental Biz Hub)

EvidentiaDental é um produto da holding **Dental Biz Hub**. Por isso:

| | Valor |
|---|---|
| **De (From)** | `evidentia@dentalbizhub.com` |
| **Nome do remetente** | `EvidentiaDental · Dental Biz Hub` |
| **Reply-to** | `evidentia@dentalbizhub.com` |
| **Assinatura no corpo** | co-marca: `Equipa EvidentiaDental — Dental Biz Hub` |
| **App / login (links CTA)** | continua em `evidentiadental.vercel.app` — os links dos emails apontam para lá de propósito |

**Onde se configura:**
- **MailerLite (emails ao cliente):** verificar o domínio `dentalbizhub.com` no MailerLite
  (SPF/DKIM no DNS) e, em cada automação, definir o sender `evidentia@dentalbizhub.com` com
  o nome `EvidentiaDental · Dental Biz Hub`. As 7 automações estão em rascunho — ao desenhar
  cada email no editor, ajustar o rodapé para a co-marca. Os links CTA continuam em
  `evidentiadental.vercel.app` (é onde o cliente faz login).
- **Alerta admin (n8n/Gmail):** o nó já tem `senderName` e `reply-to` =
  `evidentia@dentalbizhub.com`. Para o **From** sair mesmo dessa caixa, a credencial Gmail
  OAuth2 do n8n tem de ser da conta `@dentalbizhub.com` (Google Workspace) ou ter um alias
  *send-as* configurado; caso contrário sai da conta autenticada mas com reply-to correto.

## Alertas internos para o admin (para ti)

O workflow n8n tem um **segundo ramo** que te envia um email (via Gmail, para
`leomachadopt@gmail.com`) quando acontece:

- `trial_started` → **"Novo trial assinado"**
- `subscription_active` → **"Pagamento recebido"** (trial converteu em pago / cobrança ok)
- `checkout_abandoned` → **"Carrinho abandonado"**

> **Porque é que não recebeste nada ao assinar um trial?** O Stripe só te envia email
> quando há uma **cobrança real**; um trial não cobra nada, por isso o Stripe fica em
> silêncio no início do trial — é esperado. Estes alertas resolvem isso. Mas só disparam
> depois de o funil estar **ativo** (ver passos de configuração): o workflow estava
> `inativo` e com 0 execuções, logo nenhum evento chegou ainda.

### Notas de desenho

- **Abandono de carrinho** assenta no `checkout.session.expired` do Stripe: o Stripe só
  expira sessões **não concluídas**, por isso o sinal já é limpo — não há risco de enviar o
  nudge a quem converteu. (A sessão expira por defeito ~24h depois.)
- **Trial com cartão à cabeça:** como o cartão é capturado no checkout, o trial converte
  sozinho. Por isso o foco é (a) `trial_will_end` para reforçar valor antes do fim e
  (b) `trial_canceled`/`subscription_canceled` → sequência de **reinscrição**.
- `trial_canceled` e `subscription_canceled` partilham o grupo de win-back de propósito.

## Passos de configuração (uma vez)

### 1. Stripe — ativar eventos no webhook
No Dashboard → Developers → Webhooks → o endpoint `…/api/billing/webhook`, garantir que
estes eventos estão selecionados (os 3 últimos são novos):

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- **`checkout.session.expired`**  ← novo (abandono de carrinho)
- **`customer.subscription.trial_will_end`**  ← novo (lembrete de trial)
- **`invoice.payment_failed`**  ← novo (dunning)

### 2. Backend — variáveis de ambiente
```
FRONTEND_URL=https://evidentiadental.vercel.app          # fonte de verdade dos links (reset, Stripe success/cancel)
N8N_WEBHOOK_URL=https://dentalkpi.app.n8n.cloud/webhook/evidentia-funnel
N8N_WEBHOOK_SECRET=<gera com: openssl rand -base64 24>   # opcional mas recomendado
```
`FRONTEND_URL` é o que define o domínio nos emails de reset de password e nos
success/cancel URLs do Stripe Checkout. **Tem de ser `https://evidentiadental.vercel.app`**
em produção (o default é localhost para dev).

Correr as migrations: `cd backend && npm run migrate` (006 `plan_interval` + 007 reset de password).

### 3. n8n — workflow `EvidentiaDental · Funil (MailerLite)`
Workflow: https://dentalkpi.app.n8n.cloud/workflow/p3ig6nbTNGDQFXYF

1. **Credencial MailerLite** (obrigatório): criar uma credencial *Header Auth*
   chamada `MailerLite API` com `Name = Authorization` e
   `Value = Bearer <MAILERLITE_API_TOKEN>` (token em MailerLite → Integrations → API).
   Associá-la ao nó *MailerLite · upsert subscritor*.
2. **Segurança do webhook** (recomendado): no nó *Funil EvidentiaDental*, mudar
   Authentication para *Header Auth* com `Name = x-evidentia-secret` e o mesmo valor de
   `N8N_WEBHOOK_SECRET`. O backend já envia esse header.
3. Copiar o **Production URL** do webhook para `N8N_WEBHOOK_URL` (passo 2).
4. **Ativar** o workflow.

### 4. MailerLite — automações
As 7 automações foram criadas como **rascunho** (em https://dashboard.mailerlite.com/automations):
- Evidentia · Boas-vindas + ativação
- Evidentia · Checkout abandonado
- Evidentia · Trial ativo (onboarding)
- Evidentia · Trial a terminar (3 dias)
- Evidentia · Win-back / reinscrição
- Evidentia · Pagamento falhou (dunning)
- Evidentia · Cliente pago (boas-vindas)

Para cada uma: rever a copy no editor visual, definir o **remetente/domínio verificado**
e **ativar**. Campos personalizados usados: `ev_plan`, `ev_subscription_status`,
`ev_trial_ends_at`, `ev_stripe_customer_id`, `ev_funnel_stage`.

> Os links nos emails apontam para `https://evidentiadental.vercel.app` — ajustar ao domínio real.

## Teste end-to-end

1. Com `N8N_WEBHOOK_URL` definido e o workflow ativo, registar um utilizador de teste →
   confirmar que aparece no grupo *Evidentia · Signups* e que a automação de boas-vindas dispara.
2. Iniciar um checkout e abandoná-lo (fechar o Stripe) → ~24h depois (ou usar o
   Stripe CLI `stripe trigger checkout.session.expired`) confirmar *Checkout abandonado*.
3. `stripe trigger customer.subscription.trial_will_end` e `invoice.payment_failed` para
   validar os ramos de trial e dunning sem esperar pelo ciclo real.
