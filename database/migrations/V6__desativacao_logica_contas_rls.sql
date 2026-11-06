-- Additive account-deactivation support. Review and authorize before applying remotely.
-- No user, order, payment, movement, review, follower, portfolio, or auth row is deleted here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='status_conta_enum'
  ) THEN
    CREATE TYPE public.status_conta_enum AS ENUM ('Ativo', 'Inativo', 'Bloqueado');
  END IF;
END $$;

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS status_conta public.status_conta_enum NOT NULL DEFAULT 'Ativo';

CREATE OR REPLACE FUNCTION public.charte_current_account_active()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario u
    WHERE u.id_auth = auth.uid() AND u.status_conta = 'Ativo'
  );
$$;
REVOKE ALL ON FUNCTION public.charte_current_account_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charte_current_account_active() TO authenticated;

-- Authenticated sessions for inactive/blocked users cannot read or write application tables.
-- The controlled backend account-deactivation transaction bypasses end-user RLS.
DO $$
DECLARE current_table TEXT;
BEGIN
  FOR current_table IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename <> 'flyway_schema_history'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=current_table
        AND policyname='Conta ativa obrigatoria'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.charte_current_account_active()) WITH CHECK (public.charte_current_account_active())',
        'Conta ativa obrigatoria', current_table
      );
    END IF;
  END LOOP;
END $$;

-- Restrictive read policies hide inactive accounts and their public content while retaining rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='usuario' AND policyname='Ocultar usuario inativo') THEN
    CREATE POLICY "Ocultar usuario inativo" ON public.usuario AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (status_conta='Ativo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='artista' AND policyname='Ocultar artista inativo') THEN
    CREATE POLICY "Ocultar artista inativo" ON public.artista AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.usuario u WHERE u.id_usuario=artista.id_usuario AND u.status_conta='Ativo')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='portifolio' AND policyname='Ocultar portfolio de artista inativo') THEN
    CREATE POLICY "Ocultar portfolio de artista inativo" ON public.portifolio AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.artista a JOIN public.usuario u ON u.id_usuario=a.id_usuario WHERE a.id_artista=portifolio.id_artista AND u.status_conta='Ativo')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='opcao_comissao')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='opcao_comissao' AND policyname='Ocultar opcoes de artista inativo') THEN
    CREATE POLICY "Ocultar opcoes de artista inativo" ON public.opcao_comissao AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.artista a JOIN public.usuario u ON u.id_usuario=a.id_usuario WHERE a.id_artista=opcao_comissao.id_artista AND u.status_conta='Ativo')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='diretriz_comissao')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='diretriz_comissao' AND policyname='Ocultar diretrizes de artista inativo') THEN
    CREATE POLICY "Ocultar diretrizes de artista inativo" ON public.diretriz_comissao AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.artista a JOIN public.usuario u ON u.id_usuario=a.id_usuario WHERE a.id_artista=diretriz_comissao.id_artista AND u.status_conta='Ativo')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='privacidade_artista')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacidade_artista' AND policyname='Ocultar privacidade de usuario inativo') THEN
    CREATE POLICY "Ocultar privacidade de usuario inativo" ON public.privacidade_artista AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.usuario u WHERE u.id_usuario=privacidade_artista.id_usuario AND u.status_conta='Ativo')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='redes_sociais')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='redes_sociais' AND policyname='Ocultar redes de usuario inativo') THEN
    CREATE POLICY "Ocultar redes de usuario inativo" ON public.redes_sociais AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.usuario u WHERE u.id_usuario=redes_sociais.id_usuario AND u.status_conta='Ativo')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='seguidores')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='seguidores' AND policyname='Ocultar relacoes com usuarios inativos') THEN
    CREATE POLICY "Ocultar relacoes com usuarios inativos" ON public.seguidores AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.usuario u WHERE u.id_usuario=seguidores.id_seguidor AND u.status_conta='Ativo')
      AND EXISTS (SELECT 1 FROM public.usuario u WHERE u.id_usuario=seguidores.id_seguindo AND u.status_conta='Ativo')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='review')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='review' AND policyname='Ocultar reviews de contas inativas') THEN
    CREATE POLICY "Ocultar reviews de contas inativas" ON public.review AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (
      EXISTS (SELECT 1 FROM public.usuario cliente WHERE cliente.id_usuario=review.id_cliente AND cliente.status_conta='Ativo')
      AND EXISTS (SELECT 1 FROM public.artista a JOIN public.usuario artista ON artista.id_usuario=a.id_usuario WHERE a.id_artista=review.id_artista AND artista.status_conta='Ativo')
    );
  END IF;
END $$;
