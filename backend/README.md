# ChArte Backend (Spring Boot 3.5 + Java 21)

Backend RESTful do projeto **ChArte**, desenvolvido com **Java 21**, **Spring Boot 3.5.16**, **Spring Security OAuth2 Resource Server (JWT Supabase)** e **Spring JDBC (PostgreSQL / Supabase)**.

---

## 1. Módulos e Endpoints Principais

### 1.1. Sistema de Pagamento Simulado (`/api/payments`)
Implementa uma máquina de estados completa no servidor (`PENDING`, `PROCESSING`, `APPROVED`, `DECLINED`, `CANCELLED`, `REFUNDED`), **100% simulada internamente** (`MockPaymentProvider`), sem comunicação com gateways financeiros reais e sem armazenamento de PAN completo ou CVV.

- `POST /api/payments/checkout` — Cria ou reutiliza uma transação `PENDING` para um pedido do cliente autenticado (`SELECT ... FOR UPDATE`). Retorna `404` se o pedido não existir, `403` se pertencer a outro cliente e `409` se já estiver pago.
- `POST /api/payments/{paymentId}/process` — Processa a simulação do pagamento (`pix`, `cartao_credito`, `boleto`). Cartões com final `0000` ou titular contendo `RECUSADO`/`DECLINE` simulam recusa (`DECLINED`); demais instrumentos válidos simulam aprovação (`APPROVED`) e atualizam `pedidos_principal` (`status_pedido = 'Pago'`, `status_comissao = 'Em Processo'`).
- `POST /api/payments/{paymentId}/cancel` — Cancela uma transação pendente (`CANCELLED`).
- `POST /api/payments/{paymentId}/refund` — Simula o reembolso de uma transação aprovada (`REFUNDED`), atualizando o pedido para `Reembolsado` / `Cancelada`.
- `GET /api/payments/{paymentId}` — Consulta os detalhes de uma transação (autorizado para o cliente ou artista do pedido).
- `GET /api/payments/order/{orderId}` — Lista todas as tentativas e transações vinculadas a um pedido.
- `GET /api/payments/history/customer` — Histórico completo de pagamentos do cliente autenticado.
- `GET /api/payments/history/artist` — Histórico completo de vendas e recebimentos simulados do artista autenticado.

### 1.2. Sistema de Seguidores (`/api/followers`)
Gerencia o relacionamento entre usuários e artistas na tabela `public.seguidores`.

- `POST /api/followers/{targetUserId}` — Segue um artista/usuário (bloqueia auto-seguimento com `400 Bad Request` e duplicidade com `409 Conflict`).
- `DELETE /api/followers/{targetUserId}` — Deixa de seguir um artista/usuário (`204 No Content`).
- `GET /api/followers/{targetUserId}/summary` — Retorna `followersCount`, `followingCount` e `followingByCurrentUser` (público para leitura; identifica o usuário logado se o Bearer token for enviado).
- `GET /api/followers/{targetUserId}/followers` — Lista os seguidores do perfil.
- `GET /api/followers/{targetUserId}/following` — Lista os perfis seguidos pelo usuário.
- `GET /api/followers/me/following-ids` — Retorna a lista de IDs seguidos pelo usuário autenticado.

### 1.3. Chat (`/api/chat`)
- `GET /api/chat/conversations` — Lista conversas do usuário autenticado.
- `POST /api/chat/conversations/{targetUserId}` — Inicia ou recupera conversa direta com outro usuário/artista.
- `GET /api/chat/conversations/{conversationId}/messages` — Lista mensagens da conversa (valida participação do usuário).
- `POST /api/chat/conversations/{conversationId}/messages` — Envia mensagem na conversa.

---

## 2. Segurança e Tratamento de Erros

- **`SecurityConfig`**: Valida tokens Bearer JWT emitidos pelo Supabase (`${SUPABASE_URL}/auth/v1`), configura CORS para o frontend Angular e protege os endpoints de escrita (`authenticated()`), permitindo leitura pública apenas do resumo e listas de seguidores (`GET /api/followers/**`).
- **`GlobalExceptionHandler`**: Padroniza respostas de erro HTTP (`400`, `401`, `403`, `404`, `409`, `500`) em JSON estruturado, sem vazar stack traces ou detalhes internos do banco.

---

## 3. Execução e Testes

```bash
# Executar a suíte completa de testes (JUnit 5 + MockMvc)
mvn -f backend/pom.xml test

# Iniciar o servidor Spring Boot em modo de desenvolvimento
mvn -f backend/pom.xml spring-boot:run
```
