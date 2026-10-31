# ChArte Backend

Backend Java independente do Angular. Usa Java 21, Maven, Spring Boot 3.5.16, Spring Security Resource Server para JWT Supabase e PostgreSQL JDBC para o banco Supabase.

## Pagamentos simulados

O backend expõe `POST /api/payments/checkout` e `GET /api/payments/{paymentId}`, mantendo os formatos usados por `src/services/payment.service.ts`. O checkout usa `pedidos_principal` e `pagamentos`; as referências do Angular confirmam os nomes das colunas usadas. A aplicação consulta o usuário pelo `sub` do JWT e `usuario.id_auth`, valida `pedidos_principal.id_cliente` e trava o pedido durante a criação para que requisições concorrentes reutilizem o mesmo pagamento.

O status persistido usa `Pendente`, `Pago` e `Cancelado` e é convertido para `pending`, `paid` e `failed`. O identificador de pagamento é persistido em `gateway_payment_id`. O mock não contata instituição financeira. Um `paid` habilitado em desenvolvimento é rotulado como simulação e nunca representa dinheiro recebido.

O mecanismo de desenvolvimento é `POST /api/payments/dev/{paymentId}/status`, autenticado por JWT e pelo cabeçalho `X-Dev-Payment-Token`. Ele exige `MOCK_PAYMENT_SIMULATION_ENABLED=true` e um `MOCK_PAYMENT_SIMULATION_TOKEN` não vazio, ambos somente no servidor. A rota só existe com o perfil `dev` ativo e `prod` ausente. `paid` é sempre recusado nesta etapa, mesmo se a consulta a `pg_trigger` não encontrar a função: visibilidade de catálogo não prova que o mock está fora do fluxo financeiro. `pending` e `failed` continuam simuláveis.

O repositório não contém DDL nem corpo de `fn_criar_comissao()`, e não havia credenciais de banco disponíveis para inspecionar o Supabase conectado. Por isso, não é possível confirmar constraints, tipos, RLS ou a implementação do trigger nesta revisão. Nenhuma tabela, trigger ou dado foi alterado. Nenhuma chave `service_role` é usada.

O `SELECT ... FOR UPDATE` no pedido serializa checkouts concorrentes que passam por este serviço e consultam o mesmo pedido na mesma base PostgreSQL. Não há constraint única confirmada em `pagamentos.id_pedido`; portanto, isso não impede inserções duplicadas por outros clientes/caminhos nem prova que já não existam duplicatas. Uma garantia durável no banco depende de revisar os dados e o esquema conectados antes de propor índice/constraint.

## Requisitos e execução

- Java 21+
- Maven 3.6.3+
- `cp .env.example .env` e preencha as variáveis locais fora do Git.
- `mvn test`
- `mvn spring-boot:run`

O backend valida tokens Bearer usando o issuer `${SUPABASE_URL}/auth/v1` e as chaves públicas publicadas pelo Supabase. Ele não usa `service_role` para autenticar pessoas. A conexão JDBC é configurada por `SUPABASE_JDBC_URL`, `SUPABASE_DB_USER` e `SUPABASE_DB_PASSWORD`; não configure uma URL REST nessa variável. Para criar essas credenciais, use as credenciais de conexão disponibilizadas pelo painel Supabase e mantenha-as apenas no ambiente do servidor.

O perfil `dev` é padrão local e habilita `PAYMENT_PROVIDER=mock`. Nenhum gateway real está integrado. A URL retornada é somente um checkout demonstrativo.

## Próxima etapa

O banco conectado deve ter os campos referenciados pelo backend e os valores aceitos pelas constraints de `pagamentos.metodo` e `status_pagamento`. A implementação futura de gateway pode substituir `PaymentProvider`, com verificação de assinatura de webhook, mantendo autorização e idempotência no servidor.
