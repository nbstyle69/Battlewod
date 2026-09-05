/**
 * Historique d'entraînement — deux points d'entrée vers `WodHistory` :
 * l'entrée « Mes entraînements » du Profil et le lien « Voir mon historique »
 * affiché après l'enregistrement d'un score (WodGeneratorCard).
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const profile = read('screens/profile/ProfileScreen.tsx');
const card = read('components/WodGeneratorCard.tsx');
const nav = read('navigation/index.tsx');
const fr = JSON.parse(read('i18n/locales/fr.json'));
const en = JSON.parse(read('i18n/locales/en.json'));

describe('Profil → « Mes entraînements » → WodHistory', () => {
  it("l'entrée existe et navigue vers WodHistory", () => {
    const block = profile.slice(profile.indexOf('testID="profile-my-trainings"') - 400, profile.indexOf('testID="profile-my-trainings"'));
    expect(block).toMatch(/navigation\.navigate\('WodHistory' as never\)/);
    expect(profile).toContain("t('profile.myTrainings')");
    expect(fr.profile.myTrainings).toBe('Mes entraînements');
    expect(en.profile.myTrainings).toBeTruthy();
  });

  it('WodHistory est enregistré dans la pile profil gérant (BOProfileStack) comme dans HomeStack', () => {
    expect(nav).toMatch(/<BOProfileStack\.Screen name="WodHistory" component=\{WodHistoryScreen\} \/>/);
    expect(nav).toMatch(/<HomeStack\.Screen name="WodHistory"\s+component=\{WodHistoryScreen\} \/>/);
    const boParams = nav.slice(nav.indexOf('export type BOProfileStackParamList'), nav.indexOf('export type BODashboardStackParamList'));
    expect(boParams).toContain('WodHistory: undefined;');
  });
});

describe('Après un score → « Voir mon historique » → WodHistory', () => {
  it('la confirmation de submitScore propose le lien vers WodHistory', () => {
    const fn = card.slice(card.indexOf('async function submitScore()'), card.indexOf('function openScoreModal('));
    expect(fn).toContain("i18n.t('wodGenerator.scoreSavedTitle')");
    expect(fn).toMatch(/text: i18n\.t\('wodGenerator\.seeMyHistory'\), onPress: \(\) => navigation\.navigate\('WodHistory'\)/);
    expect(fr.wodGenerator.seeMyHistory).toBe('Voir mon historique');
    expect(en.wodGenerator.seeMyHistory).toBeTruthy();
  });
});
