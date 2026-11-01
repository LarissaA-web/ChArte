-- ============================================================================
-- MIGRAÇÃO V3: SISTEMA DE SEGUIDORES
-- Estrutura relacional para relacionamentos entre usuários e artistas
-- Regras:
-- 1. Um usuário não pode seguir a si mesmo (ck_seguidores_nao_auto_seguir)
-- 2. Uma relação não pode ser duplicada (idx_seguidores_unique_relacao)
-- 3. Exclusão de conta limpa relações automaticamente (ON DELETE CASCADE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seguidores (
    id SERIAL PRIMARY KEY,
    id_seguidor INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    id_seguindo INTEGER NOT NULL REFERENCES public.usuario(id_usuario) ON DELETE CASCADE,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_seguidores_nao_auto_seguir CHECK (id_seguidor <> id_seguindo)
);

-- Adiciona coluna data_criacao caso a tabela já existisse sem ela
ALTER TABLE public.seguidores ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- Remove eventuais registros inválidos de auto-seguimento ou duplicados antes de criar o índice único
DELETE FROM public.seguidores WHERE id_seguidor = id_seguindo;
DELETE FROM public.seguidores a USING public.seguidores b
WHERE a.id > b.id
  AND a.id_seguidor = b.id_seguidor
  AND a.id_seguindo = b.id_seguindo;

-- Restrição de unicidade e índices de busca
CREATE UNIQUE INDEX IF NOT EXISTS idx_seguidores_unique_relacao ON public.seguidores(id_seguidor, id_seguindo);
CREATE INDEX IF NOT EXISTS idx_seguidores_id_seguidor ON public.seguidores(id_seguidor);
CREATE INDEX IF NOT EXISTS idx_seguidores_id_seguindo ON public.seguidores(id_seguindo);

