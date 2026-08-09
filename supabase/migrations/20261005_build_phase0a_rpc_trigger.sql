-- ═══════════════════════════════════════════════════════════════════════════
-- PAQUET BUILD — PHASE 0-A : fondation serveur (RPC + trigger d'inscription)
-- Sans dépendance à un build : ces objets sont inoffensifs pour l'app installée
-- et préparent les patchs app de la Phase 1. Idempotente.
--
-- 0.1/0.2 — RPC pour remplacer les select('*')/lectures de colonnes restreintes
--           du back-office (préparent 3B2, qui révoquera email/invite_code).
-- 0.3     — Trigger handle_new_user COEXISTENCE-SAFE : ne crée le profil QUE si
--           l'inscription porte le pseudo en métadonnée (signal envoyé
--           uniquement par la NOUVELLE app). L'app installée s'inscrit sans
--           métadonnée → trigger inerte → elle insère son profil comme
--           aujourd'hui. Aucune collision, aucun armement différé.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0.1 — emails des membres d'une box, réservé aux gestionnaires ─────────
CREATE OR REPLACE FUNCTION public.get_box_member_emails(p_box_id uuid)
RETURNS TABLE(member_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT m.member_id, p.email
  FROM public.box_members m
  JOIN public.profiles p ON p.id = m.member_id
  WHERE m.box_id = p_box_id
    AND public.is_box_admin(p_box_id);   -- garde : sinon 0 ligne
$function$;
REVOKE ALL ON FUNCTION public.get_box_member_emails(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_box_member_emails(uuid) TO authenticated, service_role;

-- ─── 0.2 — code d'invitation de MA box, réservé aux gestionnaires ─────────
CREATE OR REPLACE FUNCTION public.get_my_box_invite_code(p_box_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT b.invite_code
  FROM public.boxes b
  WHERE b.id = p_box_id
    AND public.is_box_admin(p_box_id);
$function$;
REVOKE ALL ON FUNCTION public.get_my_box_invite_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_box_invite_code(uuid) TO authenticated, service_role;

-- ─── 0.3 — création de profil côté serveur, coexistence-safe ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_username text;
  v_try      text;
  v_suffix   int := 0;
BEGIN
  -- Ne rien faire si l'inscription ne porte pas de pseudo en métadonnée :
  -- c'est l'app INSTALLÉE (elle insère son profil elle-même). Coexistence.
  IF NEW.raw_user_meta_data ? 'username' IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_username := NEW.raw_user_meta_data->>'username';
  v_try := v_username;

  -- Unicité du pseudo : si collision, on suffixe (robustesse ; l'app
  -- pré-résout déjà, ceci couvre une course entre 2 inscriptions).
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_try)) LOOP
    v_suffix := v_suffix + 1;
    v_try := v_username || v_suffix::text;
    EXIT WHEN v_suffix > 50;
  END LOOP;

  INSERT INTO public.profiles (id, email, username, level, role, gender, elo, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    v_try,
    COALESCE(NEW.raw_user_meta_data->>'level', 'Intermédiaire'),
    'member',
    NULLIF(NEW.raw_user_meta_data->>'gender', ''),
    1000,
    upper(substr(md5(random()::text || NEW.id::text), 1, 6))
  )
  ON CONFLICT (id) DO NOTHING;   -- filet si l'app insère aussi (ne double pas)

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
