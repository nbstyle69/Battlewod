import fs from 'fs';
import path from 'path';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }] }));

import i18n from '../i18n';

const SRC = fs.readFileSync(path.join(__dirname, '../screens/messages/MessagesScreen.tsx'), 'utf8');
const MIG = fs.readFileSync(
  path.join(__dirname, '../../supabase/migrations/20261130_group_messages_sender_set_null.sql'),
  'utf8',
);
const load = SRC.slice(SRC.indexOf("from('group_messages')"), SRC.indexOf('// 5. Merge + tri chronologique'));

// group_messages.sender_id devient NULL quand l'expéditeur supprime son compte
// (clé étrangère ON DELETE SET NULL). L'écran doit l'afficher, pas le perdre.
describe('MessagesScreen — expéditeur supprimé (sender_id NULL)', () => {
  it('la migration pose la clé vers profiles en ON DELETE SET NULL et rend la colonne nullable', () => {
    expect(MIG).toMatch(/ALTER COLUMN sender_id DROP NOT NULL/);
    expect(MIG).toMatch(/FOREIGN KEY \(sender_id\) REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
    expect(MIG).not.toMatch(/ON DELETE CASCADE/);
  });

  it("n'interroge pas `profiles` avec un identifiant NULL", () => {
    expect(load).toMatch(/\.filter\(\(id: string \| null\) => id !== null\)/);
  });

  it("affiche « Compte supprimé » pour un sender_id NULL, dans la langue courante", async () => {
    expect(load).toMatch(/m\.sender_id === null\s*\?\s*\{ username: i18n\.t\('messages\.deletedAccount'\) \}/);
    await i18n.changeLanguage('fr');
    expect(i18n.t('messages.deletedAccount')).toBe('Compte supprimé');
    await i18n.changeLanguage('en');
    expect(i18n.t('messages.deletedAccount')).toBe('Deleted account');
  });

  it("un message d'expéditeur supprimé n'est ni filtré comme bloqué ni signalable", () => {
    expect(SRC).toMatch(/m\.sender_id === 'admin' \|\| m\.sender_id === null \|\| !blockedSet\.has\(m\.sender_id\)/);
    expect(SRC).toMatch(/msg\.sender_id !== 'admin' && msg\.sender_id !== null && !msg\.id\.startsWith\('temp-'\)/);
  });
});
