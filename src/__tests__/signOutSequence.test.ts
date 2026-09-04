import fs from 'fs';
import path from 'path';
import { runSignOutSequence } from '../lib/signOutSequence';

describe('ordre de déconnexion : jeton push effacé AVANT le logout', () => {
  it('appelle removePushToken puis signOut, dans cet ordre, en attendant le premier', async () => {
    const calls: string[] = [];
    let resolveRemove!: () => void;
    const remove = jest.fn(() => new Promise<void>(res => { resolveRemove = res; })
      .then(() => { calls.push('removePushToken'); }));
    const signOut = jest.fn(async () => { calls.push('signOut'); });
    const onErr = jest.fn();

    const run = runSignOutSequence({ removePushToken: remove, signOut, onRemovePushError: onErr });
    await Promise.resolve();
    expect(signOut).not.toHaveBeenCalled();
    resolveRemove();
    await run;

    expect(calls).toEqual(['removePushToken', 'signOut']);
    expect(onErr).not.toHaveBeenCalled();
  });

  it("remonte l'échec d'effacement (Sentry) sans empêcher le logout", async () => {
    const boom = new Error('permission denied for table push_tokens');
    const signOut = jest.fn(async () => {});
    const onErr = jest.fn();
    await runSignOutSequence({ removePushToken: async () => { throw boom; }, signOut, onRemovePushError: onErr });
    expect(onErr).toHaveBeenCalledWith(boom);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('sans utilisateur, se contente du logout', async () => {
    const signOut = jest.fn(async () => {});
    await runSignOutSequence({ removePushToken: null, signOut, onRemovePushError: jest.fn() });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('AuthContext.signOut passe par la séquence et removePushToken propage son erreur', () => {
    const ctx = fs.readFileSync(path.join(__dirname, '..', 'context', 'AuthContext.tsx'), 'utf8');
    const notif = fs.readFileSync(path.join(__dirname, '..', 'services', 'notifications.ts'), 'utf8');
    expect(ctx).toMatch(/await runSignOutSequence\(\{[\s\S]*?removePushToken[\s\S]*?signOut: \(\) => supabase\.auth\.signOut\(\)/);
    expect(ctx).not.toMatch(/removePushToken\(user\.id\)\.catch\(e => captureError\(e, \{ action: 'removePushSignOut' \}\)\)/);
    const body = notif.slice(notif.indexOf('export async function removePushToken'));
    expect(body.slice(0, body.indexOf('\n}\n'))).toContain('if (error) throw error;');
  });
});
