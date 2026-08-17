// Harnais de test : lance une fonction edge RÉELLE sur un port imposé.
//
// `serve()` de std/http écoute 8000 en dur (l'option `port` n'est pas lue dans
// l'environnement). Or le protocole tournoi a besoin de DEUX fonctions vivantes
// en même temps — le cron appelle send-push par HTTP. On force donc le port au
// niveau de `Deno.listen`, avant d'importer la fonction : le code de la fonction
// n'est pas modifié, c'est bien le vrai handler qui répond.
//
//   FN=supabase/functions/send-push/index.ts FORCE_PORT=8000 deno run ... _deno_port_wrapper.ts
const forced = Number(Deno.env.get('FORCE_PORT'));
const fn = Deno.env.get('FN');
if (!forced || !fn) {
  console.error('FN et FORCE_PORT sont requis');
  Deno.exit(2);
}

const origListen = Deno.listen.bind(Deno);
// deno-lint-ignore no-explicit-any
(Deno as any).listen = (opts: any) => origListen({ ...opts, port: forced });

await import(`file://${Deno.cwd()}/${fn}`);
