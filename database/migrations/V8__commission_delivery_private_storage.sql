-- PREPARAÇÃO: não aplicar no Supabase sem autorização explícita.
-- Reutiliza pedidos_principal.referencias (text[]) para guardar o caminho da entrega.
-- O bucket uploads existente é público e não é adequado para arquivos finais privados.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comissoes-privadas',
  'comissoes-privadas',
  FALSE,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Commission participants can read deliveries" ON storage.objects;
DROP POLICY IF EXISTS "Commission delivery participants read guard" ON storage.objects;
CREATE POLICY "Commission participants can read deliveries"
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'comissoes-privadas'
  AND storage.extension(name) IN ('png', 'jpg', 'jpeg', 'webp')
  AND EXISTS (
    SELECT 1
    FROM public.pedidos_principal p
    JOIN public.artista a ON a.id_artista = p.id_artista
    JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
    JOIN public.usuario cliente ON cliente.id_usuario = p.id_cliente
    WHERE p.id_pedido::text = (storage.foldername(name))[1]
      AND artista_usuario.id_auth::text = (storage.foldername(name))[2]
      AND (artista_usuario.id_auth = auth.uid() OR cliente.id_auth = auth.uid())
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.referencias, ARRAY[]::text[])) AS refs(ref)
        WHERE ref = 'ENTREGA_ARQUIVO::' || name
      )
  )
);
-- Policy restritiva impede que permissões genéricas existentes abram este bucket.
CREATE POLICY "Commission delivery participants read guard"
ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  bucket_id <> 'comissoes-privadas'
  OR (
    storage.extension(name) IN ('png', 'jpg', 'jpeg', 'webp')
    AND EXISTS (
      SELECT 1
      FROM public.pedidos_principal p
      JOIN public.artista a ON a.id_artista = p.id_artista
      JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
      JOIN public.usuario cliente ON cliente.id_usuario = p.id_cliente
      WHERE p.id_pedido::text = (storage.foldername(name))[1]
        AND artista_usuario.id_auth::text = (storage.foldername(name))[2]
        AND (artista_usuario.id_auth = auth.uid() OR cliente.id_auth = auth.uid())
        AND EXISTS (
          SELECT 1 FROM unnest(COALESCE(p.referencias, ARRAY[]::text[])) AS refs(ref)
          WHERE ref = 'ENTREGA_ARQUIVO::' || name
        )
    )
  )
);

DROP POLICY IF EXISTS "Responsible artist can upload commission delivery" ON storage.objects;
DROP POLICY IF EXISTS "Responsible artist upload guard for commission delivery" ON storage.objects;
CREATE POLICY "Responsible artist can upload commission delivery"
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'comissoes-privadas'
  AND storage.extension(name) IN ('png', 'jpg', 'jpeg', 'webp')
  AND EXISTS (
    SELECT 1
    FROM public.pedidos_principal p
    JOIN public.artista a ON a.id_artista = p.id_artista
    JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
    WHERE p.id_pedido::text = (storage.foldername(name))[1]
      AND artista_usuario.id_auth = auth.uid()
      AND artista_usuario.id_auth::text = (storage.foldername(name))[2]
      AND CAST(p.status_comissao AS VARCHAR) IN ('Pendente', 'Em andamento')
      AND EXISTS (
        SELECT 1 FROM public.pagamentos pg
        WHERE pg.id_pedido = p.id_pedido
          AND (CAST(pg.status_pagamento AS VARCHAR) = 'Pago'
               OR UPPER(COALESCE(pg.gateway_status, '')) IN ('APPROVED', 'PAID', 'SIMULATED_PAID'))
      )
      AND NOT (
        COALESCE(p.titulo, '') LIKE 'Aquisição:%'
        OR COALESCE(p.prazo, '') = 'Entrega imediata após confirmação do pagamento'
        OR COALESCE(p.opcao_titulo, '') LIKE 'Obra Digital%'
        OR COALESCE(p.opcao_titulo, '') = 'Obra de Portfólio'
      )
  )
);
CREATE POLICY "Responsible artist upload guard for commission delivery"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id <> 'comissoes-privadas'
  OR (
    storage.extension(name) IN ('png', 'jpg', 'jpeg', 'webp')
    AND EXISTS (
      SELECT 1
      FROM public.pedidos_principal p
      JOIN public.artista a ON a.id_artista = p.id_artista
      JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
      WHERE p.id_pedido::text = (storage.foldername(name))[1]
        AND artista_usuario.id_auth = auth.uid()
        AND artista_usuario.id_auth::text = (storage.foldername(name))[2]
        AND CAST(p.status_comissao AS VARCHAR) IN ('Pendente', 'Em andamento')
        AND EXISTS (
          SELECT 1 FROM public.pagamentos pg
          WHERE pg.id_pedido = p.id_pedido
            AND (CAST(pg.status_pagamento AS VARCHAR) = 'Pago'
                 OR UPPER(COALESCE(pg.gateway_status, '')) IN ('APPROVED', 'PAID', 'SIMULATED_PAID'))
        )
        AND NOT (
          COALESCE(p.titulo, '') LIKE 'Aquisição:%'
          OR COALESCE(p.prazo, '') = 'Entrega imediata após confirmação do pagamento'
          OR COALESCE(p.opcao_titulo, '') LIKE 'Obra Digital%'
          OR COALESCE(p.opcao_titulo, '') = 'Obra de Portfólio'
        )
    )
  )
);

DROP POLICY IF EXISTS "No client update for commission deliveries" ON storage.objects;
CREATE POLICY "No client update for commission deliveries"
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id <> 'comissoes-privadas')
WITH CHECK (bucket_id <> 'comissoes-privadas');

DROP POLICY IF EXISTS "No client delete for commission deliveries" ON storage.objects;
DROP POLICY IF EXISTS "Responsible artist can clean orphan commission upload" ON storage.objects;
DROP POLICY IF EXISTS "Commission orphan cleanup guard" ON storage.objects;
CREATE POLICY "Responsible artist can clean orphan commission upload"
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'comissoes-privadas'
  AND EXISTS (
    SELECT 1
    FROM public.pedidos_principal p
    JOIN public.artista a ON a.id_artista = p.id_artista
    JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
    WHERE p.id_pedido::text = (storage.foldername(name))[1]
      AND artista_usuario.id_auth = auth.uid()
      AND artista_usuario.id_auth::text = (storage.foldername(name))[2]
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.referencias, ARRAY[]::text[])) AS refs(ref)
        WHERE ref = 'ENTREGA_ARQUIVO::' || name
      )
  )
);
CREATE POLICY "Commission orphan cleanup guard"
ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  bucket_id <> 'comissoes-privadas'
  OR EXISTS (
    SELECT 1
    FROM public.pedidos_principal p
    JOIN public.artista a ON a.id_artista = p.id_artista
    JOIN public.usuario artista_usuario ON artista_usuario.id_usuario = a.id_usuario
    WHERE p.id_pedido::text = (storage.foldername(name))[1]
      AND artista_usuario.id_auth = auth.uid()
      AND artista_usuario.id_auth::text = (storage.foldername(name))[2]
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.referencias, ARRAY[]::text[])) AS refs(ref)
        WHERE ref = 'ENTREGA_ARQUIVO::' || name
      )
  )
);
