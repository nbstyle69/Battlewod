import {
  storagePathFromValue,
  isExternalValue,
  resolveStorageUrl,
  resolveStorageUrls,
  clearSignedUrlCache,
  SIGNED_URL_TTL,
} from '../lib/storageUrl';

const PROJ = 'https://lkwdlqlbrbxaiydkoxfp.supabase.co';
const DOCS = 'documents';
const PJ = 'message-attachments';

beforeEach(() => clearSignedUrlCache());

describe('storagePathFromValue', () => {
  it('extrait le chemin d’une URL publique historique (documents)', () => {
    expect(
      storagePathFromValue(`${PROJ}/storage/v1/object/public/documents/abc-uid/1712345.pdf`, DOCS),
    ).toBe('abc-uid/1712345.pdf');
  });

  it('extrait le chemin d’une URL déjà signée', () => {
    expect(
      storagePathFromValue(`${PROJ}/storage/v1/object/sign/documents/abc-uid/1.pdf?token=xyz`, DOCS),
    ).toBe('abc-uid/1.pdf');
  });

  it('extrait le chemin de la forme authenticated', () => {
    expect(
      storagePathFromValue(`${PROJ}/storage/v1/object/authenticated/documents/u/1.pdf`, DOCS),
    ).toBe('u/1.pdf');
  });

  it('décode les caractères échappés (espaces, accents)', () => {
    expect(
      storagePathFromValue(`${PROJ}/storage/v1/object/public/documents/u/Re%CC%80glement%20int.pdf`, DOCS),
    ).toBe('u/Règlement int.pdf'.normalize('NFD'));
  });

  it('accepte un chemin nu (nouveaux écrits)', () => {
    expect(storagePathFromValue('abc-uid/1712345.pdf', DOCS)).toBe('abc-uid/1712345.pdf');
    expect(storagePathFromValue('1712345_ab12.jpg', PJ)).toBe('1712345_ab12.jpg');
  });

  it('refuse un chemin absolu ou remontant', () => {
    expect(storagePathFromValue('/etc/passwd', DOCS)).toBeNull();
    expect(storagePathFromValue('../autre/1.pdf', DOCS)).toBeNull();
  });

  it('renvoie null pour une URL externe (GIF Giphy)', () => {
    expect(storagePathFromValue('https://media.giphy.com/media/xyz/giphy.gif', PJ)).toBeNull();
    expect(storagePathFromValue('https://media.tenor.com/abc.gif', PJ)).toBeNull();
  });

  it('renvoie null pour un objet d’un AUTRE bucket', () => {
    expect(storagePathFromValue(`${PROJ}/storage/v1/object/public/avatars/u/a.jpg`, DOCS)).toBeNull();
    expect(storagePathFromValue(`${PROJ}/storage/v1/object/public/documents/u/a.pdf`, PJ)).toBeNull();
  });

  it('ne confond pas un bucket préfixe (documents vs documents-archive)', () => {
    expect(
      storagePathFromValue(`${PROJ}/storage/v1/object/public/documents-archive/u/a.pdf`, DOCS),
    ).toBeNull();
  });

  it('renvoie null pour vide / null / undefined', () => {
    expect(storagePathFromValue('', DOCS)).toBeNull();
    expect(storagePathFromValue(null, DOCS)).toBeNull();
    expect(storagePathFromValue(undefined, DOCS)).toBeNull();
    expect(storagePathFromValue('   ', DOCS)).toBeNull();
  });
});

describe('isExternalValue', () => {
  it('distingue GIF externe et objet du bucket', () => {
    expect(isExternalValue('https://media.giphy.com/x.gif', PJ)).toBe(true);
    expect(isExternalValue(`${PROJ}/storage/v1/object/public/message-attachments/a.jpg`, PJ)).toBe(false);
    expect(isExternalValue('a.jpg', PJ)).toBe(false); // chemin nu = objet du bucket
    expect(isExternalValue('', PJ)).toBe(false);
  });
});

describe('resolveStorageUrl', () => {
  const okSigner = jest.fn(async (b: string, p: string) => `${PROJ}/storage/v1/object/sign/${b}/${p}?token=T`);

  beforeEach(() => okSigner.mockClear());

  it('signe une URL publique historique', async () => {
    const url = await resolveStorageUrl(
      `${PROJ}/storage/v1/object/public/documents/u/1.pdf`, DOCS, { signer: okSigner },
    );
    expect(url).toContain('/object/sign/documents/u/1.pdf');
    expect(okSigner).toHaveBeenCalledWith(DOCS, 'u/1.pdf', SIGNED_URL_TTL);
  });

  it('signe un chemin nu', async () => {
    const url = await resolveStorageUrl('u/1.pdf', DOCS, { signer: okSigner });
    expect(url).toContain('/object/sign/documents/u/1.pdf');
  });

  it('laisse passer une URL externe SANS la signer', async () => {
    const gif = 'https://media.giphy.com/media/xyz/giphy.gif';
    expect(await resolveStorageUrl(gif, PJ, { signer: okSigner })).toBe(gif);
    expect(okSigner).not.toHaveBeenCalled();
  });

  it('dégradation douce : renvoie la valeur d’origine si la signature échoue', async () => {
    const original = `${PROJ}/storage/v1/object/public/documents/u/1.pdf`;
    const url = await resolveStorageUrl(original, DOCS, { signer: async () => null });
    expect(url).toBe(original);
  });

  it('met en cache et ne re-signe pas dans la fenêtre de validité', async () => {
    let t = 1_000_000;
    const now = () => t;
    await resolveStorageUrl('u/1.pdf', DOCS, { signer: okSigner, expiresIn: 3600, now });
    t += 1000 * 60 * 10; // +10 min
    await resolveStorageUrl('u/1.pdf', DOCS, { signer: okSigner, expiresIn: 3600, now });
    expect(okSigner).toHaveBeenCalledTimes(1);
  });

  it('re-signe une fois la marge d’expiration atteinte', async () => {
    let t = 1_000_000;
    const now = () => t;
    await resolveStorageUrl('u/1.pdf', DOCS, { signer: okSigner, expiresIn: 300, now });
    t += 1000 * 300; // au-delà de (300s - marge)
    await resolveStorageUrl('u/1.pdf', DOCS, { signer: okSigner, expiresIn: 300, now });
    expect(okSigner).toHaveBeenCalledTimes(2);
  });

  it('renvoie null pour une valeur vide', async () => {
    expect(await resolveStorageUrl(null, DOCS, { signer: okSigner })).toBeNull();
    expect(await resolveStorageUrl('', DOCS, { signer: okSigner })).toBeNull();
  });

  it('résout un lot mixte (objets + GIF + vide)', async () => {
    const out = await resolveStorageUrls(
      ['a.jpg', 'https://media.giphy.com/x.gif', null],
      PJ, { signer: okSigner },
    );
    expect(out[0]).toContain('/object/sign/message-attachments/a.jpg');
    expect(out[1]).toBe('https://media.giphy.com/x.gif');
    expect(out[2]).toBeNull();
  });
});
