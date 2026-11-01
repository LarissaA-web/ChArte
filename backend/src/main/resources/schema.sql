-- Esquema do banco de dados do ChArte (Pagamentos Simulados, Seguidores, Pedidos e Chat)
-- Compatível com PostgreSQL / Supabase. Executado de forma idempotente na inicialização.

CREATE TABLE IF NOT EXISTS public.usuario (
    id_usuario SERIAL PRIMARY KEY,
    id_auth UUID NOT NULL UNIQUE,
    nome_usuario VARCHAR(100) NOT NULL UNIQUE,
    nome VARCHAR(200) NOT NULL,
    tipo_usuario VARCHAR(50) NOT NULL DEFAULT 'Cliente',
    foto_perfil TEXT,
    banner_perfil TEXT,
    bio TEXT
);

CREATE TABLE IF NOT EXISTS public.artista (
    id_artista SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    nome_artistico VARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.pedidos_principal (
    id_pedido SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL REFERENCES public.usuario(id_usuario),
    id_artista INTEGER REFERENCES public.artista(id_artista),
    valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status_pedido VARCHAR(50) NOT NULL DEFAULT 'Pendente',
    status_comissao VARCHAR(50) NOT NULL DEFAULT 'Solicitada',
    data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
    titulo VARCHAR(200) NOT NULL DEFAULT 'Pedido sem título',
    descricao TEXT DEFAULT '',
    referencias TEXT[] DEFAULT '{}',
    prazo VARCHAR(100) DEFAULT '',
    opcao_titulo VARCHAR(200) DEFAULT '',
    proposta_valor NUMERIC(12,2),
    proposta_prazo VARCHAR(100),
    concluida_em TIMESTAMP,
    arquivo_entrega TEXT,
    observacao_entrega TEXT
);

ALTER TABLE public.pedidos_principal ADD COLUMN IF NOT EXISTS arquivo_entrega TEXT;
ALTER TABLE public.pedidos_principal ADD COLUMN IF NOT EXISTS observacao_entrega TEXT;

CREATE TABLE IF NOT EXISTS public.pagamentos (
    id_pagamento SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES public.pedidos_principal(id_pedido),
    metodo VARCHAR(100) NOT NULL DEFAULT 'Pix',
    valor NUMERIC(12,2) NOT NULL DEFAULT 0,
    status_pagamento VARCHAR(50) NOT NULL DEFAULT 'Pendente',
    gateway_payment_id VARCHAR(255) NOT NULL UNIQUE,
    checkout_url TEXT,
    gateway_status VARCHAR(100) DEFAULT 'PENDING',
    codigo_pix TEXT,
    detalhes_simulacao TEXT,
    data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
    data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(255);
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS gateway_status VARCHAR(100) DEFAULT 'PENDING';
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS codigo_pix TEXT;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS detalhes_simulacao TEXT;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.seguidores (
    id SERIAL PRIMARY KEY,
    id_seguidor INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    id_seguindo INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.seguidores ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.conversas (
    id_conversa SERIAL PRIMARY KEY,
    data_criacao TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.participante_conversa (
    id_conversa INTEGER NOT NULL REFERENCES public.conversas(id_conversa) ON DELETE CASCADE,
    id_participante INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    data_entrada TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id_conversa, id_participante)
);

CREATE TABLE IF NOT EXISTS public.mensagens (
    id_mensagem SERIAL PRIMARY KEY,
    id_conversa INTEGER NOT NULL REFERENCES public.conversas(id_conversa) ON DELETE CASCADE,
    id_remetente INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    conteudo VARCHAR(1000) NOT NULL,
    visualizacao VARCHAR(50) NOT NULL DEFAULT 'Enviada',
    data_envio TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_id_pedido ON public.pagamentos(id_pedido);
CREATE INDEX IF NOT EXISTS idx_pagamentos_gateway_payment_id ON public.pagamentos(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_principal_id_cliente ON public.pedidos_principal(id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedidos_principal_id_artista ON public.pedidos_principal(id_artista);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seguidores_unique_relacao ON public.seguidores(id_seguidor, id_seguindo);
CREATE INDEX IF NOT EXISTS idx_seguidores_id_seguidor ON public.seguidores(id_seguidor);
CREATE INDEX IF NOT EXISTS idx_seguidores_id_seguindo ON public.seguidores(id_seguindo);
