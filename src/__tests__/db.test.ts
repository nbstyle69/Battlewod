import { readRows, writeOk } from '../lib/db';

const captured: any[] = [];
jest.mock('../lib/sentry', () => ({
  captureError: (e: unknown, ctx: unknown) => { captured.push({ e, ctx }); },
}));

beforeEach(() => { captured.length = 0; });

describe('readRows', () => {
  it('renvoie les données et ne remonte rien quand error est null', async () => {
    const out = await readRows(Promise.resolve({ data: [1, 2], error: null }), { screen: 'S', action: 'a' });
    expect(out).toEqual([1, 2]);
    expect(captured).toHaveLength(0);
  });
  it('remonte l’erreur à Sentry mais NE lève PAS et renvoie null', async () => {
    const out = await readRows(Promise.resolve({ data: null, error: { code: '42501' } }), { screen: 'S', action: 'a' });
    expect(out).toBeNull();
    expect(captured).toHaveLength(1);
    expect(captured[0].ctx).toEqual({ screen: 'S', action: 'a' });
  });
  it('renvoie null (pas undefined) quand data est absent', async () => {
    const out = await readRows(Promise.resolve({ data: undefined as any, error: null }), { screen: 'S', action: 'a' });
    expect(out).toBeNull();
  });
});

describe('writeOk', () => {
  it('true si pas d’erreur', async () => {
    expect(await writeOk(Promise.resolve({ error: null }), { screen: 'S', action: 'w' })).toBe(true);
    expect(captured).toHaveLength(0);
  });
  it('false + remontée si erreur', async () => {
    expect(await writeOk(Promise.resolve({ error: { code: 'x' } }), { screen: 'S', action: 'w' })).toBe(false);
    expect(captured).toHaveLength(1);
  });
});
