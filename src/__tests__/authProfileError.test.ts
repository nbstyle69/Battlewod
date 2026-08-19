/**
 * Garde structurelle : le chemin de connexion ne doit plus avaler d'erreur.
 *
 * `supabase.rpc()` ne lève pas — il rend `{ data, error }`. `fetchProfile` ne
 * déstructurait que `data` : un refus laissait `user` à `null`, l'app
 * réaffichait l'écran de connexion, et il n'en restait aucune trace, ni à
 * l'écran ni dans Sentry. C'est cette famille de panne qui a rendu l'incident
 * du bundle sans clés Supabase indiscernable d'un mot de passe erroné — et le
 * bundle embarqué (build 44), qui lisait encore `full_name`/`gender`/
 * `personal_records` en colonnes, échouait exactement de la même façon (42501).
 *
 * Ce test relit le source : l'appel doit déstructurer son `error`, le propager,
 * et l'état doit être exposé au rendu pour être visible par l'utilisateur.
 */
import fs from 'fs';
import path from 'path';

const AUTH_CONTEXT = path.join(__dirname, '..', 'context', 'AuthContext.tsx');
const LOGIN_SCREEN = path.join(__dirname, '..', 'screens', 'auth', 'LoginScreen.tsx');

const authContext = fs.readFileSync(AUTH_CONTEXT, 'utf8');
const loginScreen = fs.readFileSync(LOGIN_SCREEN, 'utf8');

describe('erreur de chargement du profil (chemin de connexion)', () => {
  it('trouve bien les sources (le test doit pouvoir échouer)', () => {
    expect(authContext).toContain('get_my_profile');
    expect(loginScreen).toContain('useAuth');
  });

  it("déstructure l'error de get_my_profile", () => {
    const call = authContext.match(/const \{[^}]*\} = await supabase\.rpc\('get_my_profile'\)/);
    expect(call).not.toBeNull();
    expect(call![0]).toMatch(/error/);
  });

  it('propage ce refus au lieu de le laisser passer pour un profil vide', () => {
    expect(authContext).toMatch(/if \(rpcError\) throw rpcError;/);
  });

  it('refuse une session sans ligne de profil (état incohérent, pas vide ordinaire)', () => {
    expect(authContext).toMatch(/if \(!data\) \{/);
    expect(authContext).toMatch(/get_my_profile n'a rendu aucune ligne/);
  });

  it("expose l'échec au rendu (profileError dans le contexte)", () => {
    expect(authContext).toMatch(/profileError: string \| null;/);
    expect(authContext).toMatch(/setProfileError\(e instanceof Error \? e\.message : String\(e\)\)/);
    expect(authContext).toMatch(/profileError, switchBox/);
  });

  it("l'écran de connexion affiche le message plutôt que de se réafficher nu", () => {
    expect(loginScreen).toMatch(/const \{ signIn, profileError \} = useAuth\(\)/);
    expect(loginScreen).toMatch(/\{profileError && \(/);
    expect(loginScreen).toContain("t('auth.profileLoadFailed')");
  });
});
