# ArteCheck AI — Guia de Deploy em Produção

Documento operacional para implantação do ArteCheck AI em ambientes de produção (Cloud Run, AWS ECS, VPS, Kubernetes ou Docker).

---

## 1. Variáveis de Ambiente Obrigatórias e Opcionais

Configure as seguintes variáveis no servidor de produção (ou no Secret Manager):

| Variável | Tipo | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Obrigatório | Modo de execução da aplicação | `production` |
| `PORT` | Opcional | Porta HTTP (padrão: 3000) | `3000` |
| `APP_URL` | Recomendado | URL pública canônica da aplicação frontend | `https://app.artecheck.com.br` |
| `API_URL` | Recomendado | URL pública da API backend | `https://app.artecheck.com.br` |
| `VITE_SUPABASE_URL` | Obrigatório (SaaS) | URL do projeto Supabase | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Obrigatório (SaaS) | Chave pública anônima do Supabase | `eyJh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Chave privada Service Role (apenas backend) | `eyJh...` |
| `BILLING_PROVIDER` | Recomendado | Provedor de pagamento ativo | `mercadopago` |
| `MERCADOPAGO_ACCESS_TOKEN` | Servidor | Access Token do Mercado Pago | `APP_USR-...` |
| `MERCADOPAGO_WEBHOOK_SECRET` | Servidor | Chave secreta de validação do webhook | `sec_...` |
| `MERCADOPAGO_WEBHOOK_URL` | Opcional | URL explícita do webhook (se diferente de APP_URL) | `https://app.artecheck.com.br/api/billing/webhook/mercadopago` |
| `GEMINI_API_KEY` | Opcional | Chave para o assistente de IA explicativo | `AIzaSy...` |

> ⚠️ **Regra Crítica de Segurança**: As variáveis `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` **NUNCA** devem receber o prefixo `VITE_` e devem residir exclusivamente no backend.

---

## 2. Comandos de Build e Execução

### Instalação de Dependências
```bash
npm ci
```

### Build do Frontend (Vite)
```bash
npm run build
```

### Inicialização do Servidor de Produção (Express + Static Dist)
```bash
npm start
# ou diretamente:
NODE_ENV=production node dist-server/server.js # ou tsx/node conforme pipeline
```

---

## 3. Healthcheck

O endpoint de verificação de integridade está disponível em:

```http
GET /api/health
```

**Resposta esperada (HTTP 200 OK):**
```json
{
  "status": "ok",
  "service": "ArteCheck AI Engine",
  "timestamp": "2026-08-15T21:40:00.000Z",
  "uptimeSeconds": 142.5
}
```

Configuração de probe (Kubernetes / Cloud Run):
- **Path**: `/api/health`
- **Initial Delay**: 5s
- **Period**: 10s
- **Timeout**: 3s

---

## 4. Configuração de Redirecionamento no Supabase Auth

No painel do Supabase (`Authentication` -> `URL Configuration`):
1. **Site URL**: `https://app.artecheck.com.br` (ou seu domínio de produção).
2. **Redirect URLs**:
   - `https://app.artecheck.com.br/**`
   - `https://app.artecheck.com.br/?billing=success`
   - `https://app.artecheck.com.br/?billing=failure`
   - `https://app.artecheck.com.br/?billing=pending`

---

## 5. Configuração do Webhook no Mercado Pago

No painel de desenvolvedor do Mercado Pago (`Suas integrações` -> `Notificações Webhooks`):
1. **URL de Notificação**: `https://app.artecheck.com.br/api/billing/webhook/mercadopago`
2. **Eventos a escutar**:
   - `Assinaturas / Preapprovals` (`subscription_preapproval`)
   - `Pagamentos autorizados` (`subscription_authorized_payment`)
3. **Secret do Webhook**: Copie a chave secreta gerada e insira na variável de ambiente `MERCADOPAGO_WEBHOOK_SECRET`.

---

## 6. Checklist Pré-Lançamento em Produção

- [x] Motor de inspeção PDF executa sem gravação em disco (processamento em memória).
- [x] Frontend compilado e servido via bundle estático do Express em modo produção.
- [x] Webhook do Mercado Pago valida assinatura HMAC-SHA256 e consulta API oficial antes de atualizar banco.
- [x] Quotas e limites do billing calculados no backend com isolamento por período/ciclo.
- [x] RLS do Supabase habilitado em todas as tabelas com políticas restritivas.
- [x] Variáveis sensíveis e service role isoladas no backend.
- [x] Healthcheck `/api/health` operacional para balanceador de carga.
