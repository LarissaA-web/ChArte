-- ============================================================================
-- MIGRAÇÃO V4: POLÍTICAS DE ROW LEVEL SECURITY (RLS) PARA SUPABASE
-- Garante que cada usuário acesse e modifique apenas dados autorizados
-- ============================================================================

-- 1. SEGUIDORES
ALTER TABLE public.seguidores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica de seguidores" ON public.seguidores;
CREATE POLICY "Leitura publica de seguidores"
ON public.seguidores FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Usuario autenticado pode seguir" ON public.seguidores;
CREATE POLICY "Usuario autenticado pode seguir"
ON public.seguidores FOR INSERT
TO authenticated
WITH CHECK (
    id_seguidor <> id_seguindo
    AND EXISTS (
        SELECT 1 FROM public.usuario u
        WHERE u.id_usuario = seguidores.id_seguidor
          AND u.id_auth = auth.uid()
    )
);

DROP POLICY IF EXISTS "Usuario autenticado pode deixar de seguir" ON public.seguidores;
CREATE POLICY "Usuario autenticado pode deixar de seguir"
ON public.seguidores FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.usuario u
        WHERE u.id_usuario = seguidores.id_seguidor
          AND u.id_auth = auth.uid()
    )
);

-- 2. PAGAMENTOS
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cliente ou artista consulta pagamentos do pedido" ON public.pagamentos;
CREATE POLICY "Cliente ou artista consulta pagamentos do pedido"
ON public.pagamentos FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pedidos_principal p
        JOIN public.usuario u ON u.id_usuario = p.id_cliente
        WHERE p.id_pedido = pagamentos.id_pedido
          AND u.id_auth = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.pedidos_principal p
        JOIN public.artista a ON a.id_artista = p.id_artista
        JOIN public.usuario u ON u.id_usuario = a.id_usuario
        WHERE p.id_pedido = pagamentos.id_pedido
          AND u.id_auth = auth.uid()
    )
);

DROP POLICY IF EXISTS "Cliente pode registrar tentativa de pagamento" ON public.pagamentos;
CREATE POLICY "Cliente pode registrar tentativa de pagamento"
ON public.pagamentos FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.pedidos_principal p
        JOIN public.usuario u ON u.id_usuario = p.id_cliente
        WHERE p.id_pedido = pagamentos.id_pedido
          AND u.id_auth = auth.uid()
    )
);

DROP POLICY IF EXISTS "Cliente pode atualizar pagamento simulado do proprio pedido" ON public.pagamentos;
CREATE POLICY "Cliente pode atualizar pagamento simulado do proprio pedido"
ON public.pagamentos FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pedidos_principal p
        JOIN public.usuario u ON u.id_usuario = p.id_cliente
        WHERE p.id_pedido = pagamentos.id_pedido
          AND u.id_auth = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.pedidos_principal p
        JOIN public.usuario u ON u.id_usuario = p.id_cliente
        WHERE p.id_pedido = pagamentos.id_pedido
          AND u.id_auth = auth.uid()
    )
);

-- 3. PEDIDOS_PRINCIPAL (Permite que cliente aprove proposta ou cancele pedido antes da produção)
DROP POLICY IF EXISTS "Cliente pode aprovar proposta ou cancelar pedido" ON public.pedidos_principal;
CREATE POLICY "Cliente pode aprovar proposta ou cancelar pedido"
ON public.pedidos_principal FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.usuario u
        WHERE u.id_usuario = pedidos_principal.id_cliente
          AND u.id_auth = auth.uid()
          AND pedidos_principal.status_comissao IN ('Solicitada', 'Aguardando aprovação do cliente', 'Pendente')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.usuario u
        WHERE u.id_usuario = pedidos_principal.id_cliente
          AND u.id_auth = auth.uid()
    )
    AND status_comissao IN ('Pendente', 'Recusada', 'Cancelada', 'Em andamento')
);

-- 4. REDES SOCIAIS (Permite leitura pública para exibição no perfil do artista)
DROP POLICY IF EXISTS "Leitura publica de redes sociais" ON public.redes_sociais;
CREATE POLICY "Leitura publica de redes sociais"
ON public.redes_sociais FOR SELECT
TO anon, authenticated
USING (true);

-- 5. REVIEW
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica de avaliacoes" ON public.review;
CREATE POLICY "Leitura publica de avaliacoes"
ON public.review FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Cliente pode avaliar pedido" ON public.review;
CREATE POLICY "Cliente pode avaliar pedido"
ON public.review FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.usuario u
        WHERE u.id_usuario = review.id_cliente
          AND u.id_auth = auth.uid()
    )
);

