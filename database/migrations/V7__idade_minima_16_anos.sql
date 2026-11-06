-- Enforce a minimum age of 16 at profile creation and across authenticated access.
-- Review before applying to Supabase; this file is not executed by the application.

CREATE OR REPLACE FUNCTION public.charte_birthdate_cutoff_16()
RETURNS DATE
LANGUAGE SQL
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT (((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::DATE - INTERVAL '16 years')::DATE);
$$;

CREATE OR REPLACE FUNCTION public.charte_current_user_age_is_valid()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario u
    WHERE u.id_auth = auth.uid()
      AND u.data_nascimento IS NOT NULL
      AND u.data_nascimento <= public.charte_birthdate_cutoff_16()
  );
$$;

REVOKE ALL ON FUNCTION public.charte_birthdate_cutoff_16() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.charte_current_user_age_is_valid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charte_current_user_age_is_valid() TO authenticated;

CREATE OR REPLACE FUNCTION public.charte_validate_birthdate_16()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND auth.uid() IS NOT NULL
     AND NEW.data_nascimento IS DISTINCT FROM OLD.data_nascimento THEN
    RAISE EXCEPTION 'A data de nascimento não pode ser alterada pelo usuário.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.data_nascimento IS NULL
     OR NEW.data_nascimento > public.charte_birthdate_cutoff_16() THEN
    RAISE EXCEPTION 'O cadastro exige idade mínima de 16 anos.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.charte_validate_birthdate_16() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.usuario'::regclass
      AND tgname = 'trg_charte_validate_birthdate_16'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_charte_validate_birthdate_16
      BEFORE INSERT OR UPDATE OF data_nascimento ON public.usuario
      FOR EACH ROW EXECUTE FUNCTION public.charte_validate_birthdate_16();
  END IF;
END
$$;

ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuario'
      AND policyname = 'Idade minima em insercao de usuario'
  ) THEN
    CREATE POLICY "Idade minima em insercao de usuario"
      ON public.usuario AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.charte_current_user_age_is_valid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuario'
      AND policyname = 'Idade minima em atualizacao de usuario'
  ) THEN
    CREATE POLICY "Idade minima em atualizacao de usuario"
      ON public.usuario AS RESTRICTIVE FOR UPDATE TO authenticated
      USING (public.charte_current_user_age_is_valid())
      WITH CHECK (public.charte_current_user_age_is_valid());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'usuario'
      AND policyname = 'Idade minima em exclusao de usuario'
  ) THEN
    CREATE POLICY "Idade minima em exclusao de usuario"
      ON public.usuario AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.charte_current_user_age_is_valid());
  END IF;
END
$$;

-- Block authenticated access to application tables for underage accounts,
-- while leaving public/anonymous browsing policies unchanged.
DO $$
DECLARE current_table TEXT;
BEGIN
  FOR current_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND c.relname NOT IN ('usuario', 'flyway_schema_history')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = current_table
        AND p.policyname = 'Idade minima de 16 anos'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.charte_current_user_age_is_valid()) WITH CHECK (public.charte_current_user_age_is_valid())',
        'Idade minima de 16 anos', current_table
      );
    END IF;
  END LOOP;
END
$$;
