# ChArte — Plataforma de Comissões e Descoberta de Arte Digital

O **ChArte** é uma plataforma Full Stack acadêmica e profissional para descoberta de artistas visuais, contratação de comissões artísticas personalizadas, aquisição de artes digitais, interação via chat e acompanhamento de artistas favoritos.

---

## 1. Tecnologias Utilizadas

| Camada | Tecnologias |
| :--- | :--- |
| **Frontend** | Angular 21.2 (Standalone Components), TypeScript 5.9, RxJS 7.8, Angular Router, CSS3 Responsivo |
| **Backend** | Java 21, Spring Boot 3.5.16, Spring Web, Spring JDBC, Spring Security (OAuth2 Resource Server JWT), Bean Validation |
| **Banco de Dados & Auth** | PostgreSQL 15+ / Supabase (Supabase Auth, Supabase Storage, Row Level Security - RLS) |
| **Testes Automatizados** | JUnit 5, Spring Boot Test, MockMvc (Backend) e Vitest + Angular TestBed (Frontend) |

---

## 2. Arquitetura do Sistema

```text
ChArte/
├── src/                                  # Frontend Angular 21
│   ├── app/
│   │   ├── components/                   # Componentes reutilizáveis (SearchBar, SubMenu, PinCard, PinCardModal, Sidebar, Chat, Modais)
│   │   ├── core/supabase/                # Cliente Supabase centralizado (supabase.client.ts)
│   │   ├── guards/                       # Guards de rota (artistAreaGuard)
│   │   ├── interceptors/                 # Interceptor HTTP JWT (auth.interceptor.ts)
│   │   └── pages/                        # Páginas (Home, Category, Styles, ArtistProfile, FavoritesPage/Carrinho, OrderDetail/Checkout, ArtistArea)
│   └── services/                         # Serviços de domínio (PaymentService, FollowersService, ArtistAreaService, PerfilService, ChatService, AuthService, CarrinhoService, FavoritesService)
├── backend/                              # Backend Spring Boot 3.5 (Java 21)
│   ├── src/main/java/br/com/charte/backend/
│   │   ├── chat/                         # Endpoints REST e regras de mensagens (/api/chat)
│   │   ├── common/                       # Tratamento global de erros (GlobalExceptionHandler) e resolução de usuário JWT (AuthenticatedUserService)
│   │   ├── config/                       # Segurança OAuth2 JWT + CORS (SecurityConfig)
│   │   ├── follower/                     # Sistema de Seguidores (/api/followers)
│   │   └── payment/                      # Sistema de Pagamento Simulado (/api/payments)
│   └── src/test/java/                    # Suíte de testes unitários e de integração do backend
└── database/
    └── migrations/                       # Scripts SQL versionados e idempotentes (V1 a V4)
```

---

## 3. Pré-requisitos

- **Node.js** 20+ e **npm** 10+
- **Java JDK** 21+
- **Maven** 3.8+
- Instância **PostgreSQL / Supabase** (ou execução em modo híbrido com fallback inteligente no frontend)

---

## 4. Configuração das Variáveis de Ambiente

1. Copie o arquivo de exemplo na raiz do projeto:

```bash
cp .env.example .env
```

2. Preencha as variáveis no arquivo `.env` (nunca versione chaves privadas ou `service_role` no Git):

```dotenv
# Supabase (Servidor)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_JDBC_URL=jdbc:postgresql://db.seu-projeto.supabase.co:5432/postgres?sslmode=require
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=sua-senha-segura

# Configurações do Backend e Simulação de Pagamentos
SPRING_PROFILES_ACTIVE=dev
PAYMENT_PROVIDER=mock
APP_CORS_ALLOWED_ORIGINS=http://localhost:4200
MOCK_PAYMENT_SIMULATION_ENABLED=true
MOCK_PAYMENT_SIMULATION_TOKEN=dev-local-token
```

3. No frontend, as configurações públicas (`url` e `anonKey` do Supabase) ficam em `src/environments/environment.ts`.

---

## 5. Configuração do Banco de Dados e Supabase

Os scripts SQL versionados encontram-se em `database/migrations/` e também são carregados de forma idempotente pelo backend em `backend/src/main/resources/schema.sql`:

1. `database/migrations/V1__schema_base.sql` — Tabelas base (`usuario`, `artista`, `publicacao`, `opcoes_comissao`, `pedidos_principal`, `avaliacoes`, `conversas`, `participante_conversa`, `mensagens`, `pasta`, `salva`).
2. `database/migrations/V2__sistema_pagamento_simulado.sql` — Tabela `pagamentos`, colunas de rastreamento de simulação (`gateway_payment_id`, `gateway_status`, `codigo_pix`, `detalhes_simulacao`) e índices.
3. `database/migrations/V3__sistema_seguidores.sql` — Tabela `seguidores` com chaves estrangeiras `ON DELETE CASCADE`, restrição de unicidade `UNIQUE (id_seguidor, id_seguindo)` e constraint `CHECK (id_seguidor <> id_seguindo)` contra auto-seguimento.
4. `database/migrations/V4__rls_policies.sql` — Políticas de Row Level Security (RLS) no Supabase garantindo que apenas usuários autenticados operem em seus próprios recursos.

Para aplicar manualmente no SQL Editor do Supabase, execute os arquivos `V1` a `V4` em ordem.

---

## 6. Como Executar o Projeto

### 6.1. Executar o Backend (Spring Boot)

```bash
mvn -f backend/pom.xml spring-boot:run
```

O servidor iniciará em `http://localhost:8080`.

### 6.2. Executar o Frontend (Angular)

Em outro terminal, instale as dependências (se necessário) e inicie o servidor de desenvolvimento (que já utiliza `proxy.conf.json` para redirecionar `/api` e `/checkout` ao backend na porta `8080`):

```bash
npm install
npm start
```

Acesse no navegador: `http://localhost:4200`.

---

## 7. Como Testar o Sistema de Pagamento Simulado

> **IMPORTANTE:** O sistema utiliza **exclusivamente simulação interna (`MockPaymentProvider`)**. Não há integração com Stripe, Mercado Pago, PayPal ou instituições financeiras reais, e nenhum número completo de cartão ou CVV é armazenado.

### Fluxo Completo de Compra e Contratação
1. **Pela Vitrine de Artes (`PinCardModal`) ou Perfil do Artista**:
   - Clique em uma publicação e selecione **`+ Carrinho`** ou **`Comprar`**, ou clique em **`Formulário`** no perfil de um artista para solicitar uma comissão personalizada.
2. **Pelo Carrinho / Central de Pedidos (`/carrinho`)**:
   - Na aba **Carrinho**, confira os itens e clique em **Contratar e Ir para Checkout** (ou finalize todos os itens do carrinho).
   - Caso seja uma comissão sob orçamento, o artista pode aceitar/enviar proposta em **`/artista`** e o cliente avança para o pagamento.
3. **Na Tela de Checkout Simulado (`/pedido/:id` ou `/checkout/:id`)**:
   - Selecione a modalidade desejada:
     - **PIX Simulado**: gera um código Copia e Cola fictício (`00020126580014BR.GOV.BCB.PIX2536CHARTE-PIX-SIMULADO...`) e QR Code demonstrativo.
     - **Cartão de Crédito Simulado**: use os botões rápidos de preenchimento na própria tela:
       - **Simular Cartão Aprovado (Final `4242`)**: aprova a transação (`APPROVED`), atualiza o pedido para `Pago` e a comissão para `Em Processo`.
       - **Simular Cartão Recusado (Final `0000`)**: recusa a transação (`DECLINED`), mantendo o pedido disponível para nova tentativa.
     - **Boleto / Transferência Simulada**: simula compensação instantânea.
4. **Comprovante, Reembolso e Histórico**:
   - Após a aprovação, visualize o comprovante detalhado e, se desejar, teste a **Simulação de Estorno (`REFUNDED`)**.
   - Consulte o **Histórico de Pagamentos do Cliente** em `/carrinho?aba=pagamentos` (com filtros por status: Aprovados, Pendentes, Recusados, Cancelados/Reembolsados).
   - Consulte o **Histórico de Vendas do Artista** em `/artista` na seção **Vendas e Pagamentos (Simulação)**.

---

## 8. Como Testar o Sistema de Seguidores

1. Faça login na plataforma (menu superior direito -> Entrar / Cadastrar).
2. Acesse o perfil público de um artista (`/perfil/:username`) ou abra o modal de qualquer arte (`PinCardModal`).
3. Clique no botão **`+ Seguir`**:
   - O botão alterna imediatamente para **`✓ Seguindo`** sem recarregar a página.
   - O contador de **Seguidores** é atualizado em tempo real.
   - Regras garantidas: usuários não autenticados são solicitados a fazer login (`401`), um usuário não pode seguir a si mesmo (`400`) e relações duplicadas são bloqueadas (`409`).
4. Clique nos contadores **Seguidores** ou **Seguindo** na barra lateral do perfil para abrir o modal com a lista detalhada de usuários.
5. Acesse `/carrinho?aba=seguindo` (aba **Artistas Seguidos**) para gerenciar todos os artistas que você acompanha.

---

## 9. Execução dos Testes Automatizados e Build

### Backend (JUnit 5 + MockMvc)
```bash
mvn -f backend/pom.xml test
```

### Frontend (Vitest + Angular TestBed)
```bash
npx ng test --watch=false
```

### Build de Produção do Frontend
```bash
npm run build
```
