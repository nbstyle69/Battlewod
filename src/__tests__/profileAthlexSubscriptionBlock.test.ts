/**
 * Bloc « Abonnement AthleX » du profil gérant (#241). Chemin : onglet Profil
 * (barre gérant) → écran Profil → onglet interne « Compte » → carte après
 * « Mes amis », avant « Mes entraînements ». Visible pour tout gérant, avec
 * ou sans box, avec ou sans abonnement ; sans abonnement il dit « Aucun
 * abonnement actif » et propose le bouton vers BOSubscription.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const profile = read('screens/profile/ProfileScreen.tsx');
const fr = JSON.parse(read('i18n/locales/fr.json'));
const en = JSON.parse(read('i18n/locales/en.json'));

const start = profile.indexOf('{/* ── Abonnement AthleX (gérant) ─────────── */}');
const end = profile.indexOf('{/* ── Mes entraînements');
const block = profile.slice(start, end);

describe('Bloc « Abonnement AthleX » — position et condition', () => {
  it("est dans l'onglet Compte, entre « Mes amis » et « Mes entraînements »", () => {
    const account = profile.indexOf("TAB_KEYS[activeTab] === 'account'");
    const friends = profile.indexOf('{/* ── Mes amis');
    expect(account).toBeGreaterThan(-1);
    expect(friends).toBeGreaterThan(account);
    expect(start).toBeGreaterThan(friends);
    expect(end).toBeGreaterThan(start);
  });

  it("n'est conditionné qu'au rôle gérant : ni currentBox ni abonnement (mutation inverse : `isOwnerAdmin && currentBox` rouge)", () => {
    expect(block).toContain('{isOwnerAdmin && (');
    expect(block).not.toMatch(/isOwnerAdmin && currentBox/);
    expect(block).not.toMatch(/hasAthlexSub && \(\s*<TouchableOpacity/);
    const query = profile.slice(profile.indexOf("['owner-subscription'"), profile.indexOf('const isMulti'));
    expect(query).toContain('{ enabled: !!user && isOwnerAdmin }');
  });

  it('ouvre BOSubscription dans les deux états', () => {
    expect(block).toContain("navigation.getParent()?.navigate('BODashboard', { screen: 'BOSubscription' })");
  });
});

describe('Bloc « Abonnement AthleX » — deux états', () => {
  it('avec abonnement : formule + statut + bouton « Gérer »', () => {
    expect(profile).toContain('const hasAthlexSub = !!boxSubscription || isMulti;');
    expect(block).toMatch(/hasAthlexSub \? \([\s\S]*?\{athlexPlanLabel\}[\s\S]*?\{athlexStatus\.text\}/);
    expect(block).toContain("hasAthlexSub ? t('profile.athlexSub.manage') : t('profile.athlexSub.subscribe')");
    expect(fr.profile.athlexSub.manage).toBe('Gérer');
  });

  it('sans abonnement : « Aucun abonnement actif » + bouton vers BOSubscription', () => {
    expect(block).toContain("<Text style={S.themeLabel}>{t('profile.athlexSub.none')}</Text>");
    expect(block).toContain("testID={hasAthlexSub ? 'profile-athlex-sub' : 'profile-athlex-sub-empty'}");
    expect(fr.profile.athlexSub.none).toBe('Aucun abonnement actif');
    expect(en.profile.athlexSub.none).toBe('No active subscription');
    expect(fr.profile.athlexSub.subscribe).toBe("S'abonner");
    expect(en.profile.athlexSub.subscribe).toBe('Subscribe');
  });
});
