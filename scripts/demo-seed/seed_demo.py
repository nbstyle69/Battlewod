#!/usr/bin/env python3
"""Seed de la box de démonstration « AthleX Fitness » (captures App Store, compte Apple Review).

Charge les CSV de data/ (produits par generator/generate_demo_data.py, jamais édités à la main)
dans la base Supabase, lot par lot, avec un journal d'écriture (_demo_seed_log) qui rend le
rollback exact. Les règles métier (triggers, RPC ELO) restent actives : le seed passe par elles.

    seed_demo.py --target local|prod [--anchor YYYY-MM-DD] COMMANDE

Commandes : lot0 lot1 lot2 lot3 lot4 | check A|B|C|D|E | status | rollback [--yes]

Cibles :
  local : pile jetable (./scripts/test-stack.sh up) — TEST_ADMIN_DB_URL, TEST_SUPABASE_URL,
          TEST_SUPABASE_SERVICE_ROLE_KEY.
  prod  : Management API (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF) + Admin Auth API
          (EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY_).

Les dates des CSV sont relatives au lundi L0 = 2026-09-07 ; --anchor (un lundi) les recale sur la
semaine d'exécution (défaut : lundi de la semaine courante). L'ancre est mémorisée au lot 0.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SQL = os.path.join(HERE, "sql")

# uuid fixe et valide (le « d3m0b0x0-… » du pack n'est pas un uuid : m, o, x ne sont pas hexadécimaux).
# La colonne box_id des CSV n'est jamais lue : toutes les lignes sont rattachées à BOX_ID.
BOX_ID = "d3d0b0a0-0000-4000-a000-000000000001"
BOX_NAME = "AthleX Fitness"
OWNER_EMAIL = "nbstylz+athlexfitness@gmail.com"
OWNER_USERNAME = "AthleX Fitness"
DEMO_EMAIL = "nbstylz+appledemo@gmail.com"
NBS2_BOX_ID = "303c7667-d054-4f63-8231-e2f93cdf1fad"
GENERATOR_L0 = dt.date(2026, 9, 7)
NO_PASSWORD_EMAILS = {OWNER_EMAIL, DEMO_EMAIL}

# CSV -> table de staging (toutes colonnes text). L'ordre = ordre de chargement.
STAGING = {
    "members": ["member_ref", "email", "pseudo", "role", "elo", "tier", "rang", "victoires", "matchs",
                "streak", "wods_total", "reservations_total", "formule", "seances_cible_semaine",
                "is_demo_account", "nom_complet"],
    "elo_start": ["member_ref", "elo_depart", "jour"],
    "class_slots": ["slot_ref", "box_id", "jour", "heure", "type", "capacite"],
    "reservations": ["slot_ref", "member_ref", "statut"],
    "wod_blocks": ["wod_ref", "box_id", "jour", "nom", "format", "detail"],
    "wod_scores": ["wod_ref", "member_ref", "jour", "unite", "valeur", "categorie"],
    "tournaments": ["tournament_ref", "box_id", "nom", "format", "categorie", "places", "inscrits",
                    "statut", "date_debut", "date_fin"],
    "tournament_participants": ["tournament_ref", "member_ref", "seed"],
    "tournament_matches": ["tournament_ref", "match_ref", "bracket", "tour", "jour", "joueur_a",
                           "joueur_b", "vainqueur", "perdant", "score_vainqueur", "score_perdant",
                           "statut"],
    "elo_history": ["member_ref", "jour", "delta", "elo_apres", "source_type", "source_ref"],
    "badges": ["member_ref", "mouvement", "badge_key", "palier", "debloque"],
    "movement_reps": ["member_ref", "mouvement", "total_reps"],
    "friends": ["member_ref", "ami_ref", "statut"],
    "box_news": ["box_id", "jour", "titre", "contenu"],
}


def log(msg):
    print(msg, flush=True)


def die(msg):
    log(f"ERREUR : {msg}")
    sys.exit(1)


def q(v):
    """Littéral SQL text."""
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


# ─────────────────────────────── accès base ────────────────────────────────
class Db:
    """run(sql) exécute un script (une transaction) et rend les lignes du DERNIER select."""

    def __init__(self, target):
        self.target = target
        if target == "local":
            self.url = os.environ.get("TEST_ADMIN_DB_URL") or die("TEST_ADMIN_DB_URL manquant")
        else:
            self.token = os.environ.get("SUPABASE_ACCESS_TOKEN") or die("SUPABASE_ACCESS_TOKEN manquant")
            ref = os.environ.get("SUPABASE_PROJECT_REF", "lkwdlqlbrbxaiydkoxfp")
            self.api = f"https://api.supabase.com/v1/projects/{ref}/database/query"

    def run(self, sql):
        if self.target == "local":
            return self._psql(sql)
        return self._mgmt(sql)

    def _psql(self, sql):
        script = "\\set ON_ERROR_STOP on\nbegin;\n" + sql.rstrip().rstrip(";") + ";\ncommit;\n"
        p = subprocess.run(["psql", self.url, "-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-f", "-"],
                           input=script, text=True, capture_output=True)
        if p.returncode != 0:
            raise RuntimeError(p.stderr.strip())
        out = p.stdout.strip()
        if not out:
            return []
        # psql --csv concatène les résultats ; on ne garde que le dernier bloc (après la dernière
        # ligne d'en-tête). Convention : un seul SELECT final par script.
        rows = list(csv.reader(io.StringIO(out)))
        return [dict(zip(rows[0], r)) for r in rows[1:]]

    def _mgmt(self, sql):
        body = json.dumps({"query": sql}).encode()
        req = urllib.request.Request(self.api, data=body, method="POST", headers={
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
            "User-Agent": "curl/8.5.0"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                data = json.loads(r.read().decode() or "null")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:2000]}")
        if isinstance(data, list):
            return [{k: (None if v is None else str(v) if not isinstance(v, (dict, list)) else json.dumps(v))
                     for k, v in row.items()} for row in data]
        return []

    def one(self, sql):
        rows = self.run(sql)
        return rows[0] if rows else {}

    def scalar(self, sql):
        row = self.one(sql)
        return next(iter(row.values())) if row else None


# ─────────────────────────────── Admin Auth API ────────────────────────────
class AuthAdmin:
    def __init__(self, target):
        if target == "local":
            self.url = os.environ.get("TEST_SUPABASE_URL") or die("TEST_SUPABASE_URL manquant")
            self.key = os.environ.get("TEST_SUPABASE_SERVICE_ROLE_KEY") or die("TEST_SUPABASE_SERVICE_ROLE_KEY manquant")
        else:
            self.url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL") or die("EXPO_PUBLIC_SUPABASE_URL manquant")
            self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY_") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") \
                or die("SUPABASE_SERVICE_ROLE_KEY_ manquant")
        self.url = self.url.rstrip("/")

    def _call(self, method, path, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.url + path, data=body, method=method, headers={
            "apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Admin API {method} {path} -> HTTP {e.code}: {e.read().decode()[:500]}")

    def create_user(self, email, username, level, full_name):
        """email confirmé, aucun mail envoyé. Sans mot de passe pour les 2 comptes gmail (fixé par
        « mot de passe oublié ») ; mot de passe aléatoire jeté pour les @demo."""
        payload = {
            "email": email,
            "email_confirm": True,
            "user_metadata": {"username": username, "level": level, "full_name": full_name,
                              "demo_seed": BOX_ID},
        }
        if email not in NO_PASSWORD_EMAILS:
            payload["password"] = secrets.token_urlsafe(24)
        return self._call("POST", "/auth/v1/admin/users", payload)["id"]

    def delete_user(self, user_id):
        self._call("DELETE", f"/auth/v1/admin/users/{user_id}")


# ─────────────────────────────── utilitaires ───────────────────────────────
def read_csv(name):
    with open(os.path.join(DATA, name + ".csv"), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def sql_file(name, **subst):
    with open(os.path.join(SQL, name), encoding="utf-8") as f:
        s = f.read()
    subst.setdefault("BOX_ID", BOX_ID)
    for k, v in subst.items():
        s = s.replace("{{" + k + "}}", str(v))
    left = re.findall(r"\{\{[A-Z0-9_]+\}\}", s)
    if left:
        die(f"placeholders non résolus dans {name} : {sorted(set(left))}")
    return s


def nbs2_snapshot(db):
    return db.scalar(f"select demo_stg.nbs2_snapshot('{NBS2_BOX_ID}')::text")


def default_anchor():
    # Lundi de la semaine en cours ; un dimanche, la « semaine en cours » côté générateur (réservations
    # à venir, vendredi 17:30 complet) est celle qui commence le lendemain.
    today = dt.date.today()
    if today.weekday() == 6:
        return today + dt.timedelta(days=1)
    return today - dt.timedelta(days=today.weekday())


def load_staging(db):
    for table, cols in STAGING.items():
        rows = read_csv(table)
        db.run(f"truncate demo_stg.{table};")
        for i in range(0, len(rows), 400):
            chunk = rows[i:i + 400]
            values = ",\n".join("(" + ",".join(q(r[c] if r[c] != "" else None) for c in cols) + ")" for r in chunk)
            db.run(f"insert into demo_stg.{table} ({', '.join(cols)}) values\n{values};")
        n = db.scalar(f"select count(*) from demo_stg.{table}")
        log(f"  demo_stg.{table:<24} {n:>5} lignes (csv {len(rows)})")
        if int(n) != len(rows):
            die(f"staging {table} incomplet")


def get_param(db, key):
    return db.scalar(f"select value from demo_stg.params where key = {q(key)}")


def set_param(db, key, value):
    db.run(f"insert into demo_stg.params(key, value) values ({q(key)}, {q(value)}) "
           f"on conflict (key) do update set value = excluded.value;")


def require_lot(db, lot):
    if get_param(db, f"lot{lot}_done") != "1":
        die(f"le lot {lot} n'est pas terminé sur cette cible")


def refuse_if_done(db, lot):
    if get_param(db, f"lot{lot}_done") == "1":
        die(f"lot {lot} déjà appliqué (idempotence) — rien réécrit")


def anchor_of(db):
    a = get_param(db, "anchor")
    if not a:
        die("ancre absente : lancer lot0 d'abord")
    return a


def print_rows(rows):
    if not rows:
        log("  (0 ligne)")
        return
    cols = list(rows[0].keys())
    w = [max(len(c), *(len(str(r[c]) if r[c] is not None else "") for r in rows)) for c in cols]
    log("  " + " | ".join(c.ljust(w[i]) for i, c in enumerate(cols)))
    for r in rows:
        log("  " + " | ".join((str(r[c]) if r[c] is not None else "").ljust(w[i]) for i, c in enumerate(cols)))


# ─────────────────────────────── lots ──────────────────────────────────────
def lot0(db, args):
    anchor = args.anchor or default_anchor()
    if anchor.weekday() != 0:
        die("--anchor doit être un lundi")
    log(f"== LOT 0 ({db.target}) : journal, staging, ancre {anchor}")
    db.run(sql_file("00_lot0_schema.sql"))
    existing = get_param(db, "anchor")
    if existing and existing != anchor.isoformat():
        die(f"ancre déjà fixée à {existing} (lot0 déjà passé) ; relancer avec --anchor {existing}")
    set_param(db, "anchor", anchor.isoformat())
    set_param(db, "shift_days", str((anchor - GENERATOR_L0).days))
    # Relevé NBS2 avant écriture (contrôle A3 / rollback)
    snap = nbs2_snapshot(db)
    set_param(db, "nbs2_snapshot", snap)
    set_param(db, "profiles_before", db.scalar("select count(*) from public.profiles"))
    log(f"  relevé NBS2 : {snap}")
    load_staging(db)
    set_param(db, "lot0_done", "1")
    log("LOT 0 OK")


def lot1(db, auth, args):
    log(f"== LOT 1 ({db.target}) : box, comptes Auth, profils, formules, adhésions")
    require_lot(db, 0)
    refuse_if_done(db, 1)
    members = read_csv("members")
    wanted = [(OWNER_EMAIL, OWNER_USERNAME, "rx", "AthleX Fitness", "owner")]
    wanted += [(m["email"], m["pseudo"], tier_to_level(m["tier"]), m["nom_complet"], m["member_ref"]) for m in members]

    # Comptes déjà présents (reprise après interruption) : on ne recrée pas, on complète.
    existing = {r["email"]: r["id"] for r in db.run(
        "select lower(email) email, id::text id from auth.users where lower(email) in ("
        + ",".join(q(e.lower()) for e, *_ in wanted) + ")")}
    mapped = {r["email"]: r["user_id"] for r in db.run("select email, user_id::text user_id from demo_stg.member_map")}
    foreign = [e for e in existing if e not in mapped]
    if foreign:
        die(f"comptes déjà existants hors seed (collision e-mail), rien écrit : {foreign}")

    log(f"  création de {len(wanted) - len(existing)} comptes via l'API Admin (email confirmé, aucun mail)")
    created = 0
    for email, username, level, full_name, ref in wanted:
        if email.lower() in existing:
            continue
        uid = auth.create_user(email, username, level, full_name)
        db.run(f"insert into demo_stg.member_map(member_ref, email, user_id) values ({q(ref)}, {q(email.lower())}, {q(uid)}::uuid) "
               f"on conflict (member_ref) do update set user_id = excluded.user_id;\n"
               f"insert into public._demo_seed_log(table_name, row_id) values ('auth.users', {q(uid)});")
        created += 1
        if created % 25 == 0:
            log(f"    {created} comptes créés…")
    n = db.scalar("select count(*) from demo_stg.member_map")
    log(f"  member_map : {n} comptes (attendu {len(wanted)})")
    if int(n) != len(wanted):
        die("member_map incomplet")
    if db.target == "prod":
        log(f"  >>> Les deux comptes gmail existent en prod : {OWNER_EMAIL} et {DEMO_EMAIL} (mot de passe à fixer par « mot de passe oublié »).")

    db.run(sql_file("10_lot1_box.sql", ANCHOR=anchor_of(db), INVITE_CODE=invite_code(db)))
    set_param(db, "lot1_done", "1")
    log("LOT 1 OK")


def tier_to_level(tier):
    return {"scaled": "scaled", "inter": "inter", "rx": "rx", "rx+": "rx+", "elite": "elite", "pro": "pro"}[tier.lower()]


def invite_code(db):
    """Même format que les codes existants (6 alphanumériques majuscules), sans collision."""
    code = get_param(db, "invite_code")
    if code:
        return code
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if int(db.scalar(f"select count(*) from public.boxes where invite_code = {q(code)}")) == 0:
            set_param(db, "invite_code", code)
            return code


def lot2(db, args):
    log(f"== LOT 2 ({db.target}) : WODs, créneaux, réservations, tournois, inscriptions (structure, sans ELO)")
    require_lot(db, 1)
    refuse_if_done(db, 2)
    anchor = anchor_of(db)
    db.run(sql_file("20_lot2_planning.sql", ANCHOR=anchor))
    n = db.one(f"select (select count(*) from public.box_wods where box_id = '{BOX_ID}') wods, "
               f"(select count(*) from public.class_schedules where box_id = '{BOX_ID}') slots, "
               f"(select count(*) from public.class_reservations where box_id = '{BOX_ID}') resas, "
               f"(select count(*) from public.class_reservations where box_id = '{BOX_ID}' and status = 'waiting') waiting")
    log(f"  {n}")
    if int(n["waiting"]) != 0:
        die("des réservations sont passées en 'waiting' (capacité) : le générateur a tort")
    t = db.one(sql_file("25_lot2_tournaments.sql", ANCHOR=anchor))
    log(f"  {t}")
    set_param(db, "lot2_done", "1")
    log("LOT 2 OK")


def lot3(db, args):
    """Un seul flux d'événements trié par date : chaque WOD (scores puis compute_wod_elo + compute_box_elo)
    et chaque match de bracket (trigger trg_bracket_match_elo) sont rejoués dans l'ordre réel, un événement
    = une transaction. Les événements postérieurs au jour d'exécution sont filtrés."""
    log(f"== LOT 3 ({db.target}) : flux chronologique WODs + matchs (mode A, ordre réel)")
    require_lot(db, 2)
    refuse_if_done(db, 3)
    events = db.run(
        f"select 'wod' kind, (bw.scheduled_date::timestamptz + interval '21 hours') ts, bw.id::text ref, bw.title label "
        f"  from public.box_wods bw where bw.box_id = '{BOX_ID}' and bw.scheduled_date <= current_date "
        f"   and not exists (select 1 from public.wod_scores ws where ws.wod_id = bw.id) "
        f"union all "
        f"select 'match', mp.event_at, mp.match_ref, mp.status "
        f"  from demo_stg.match_plan mp "
        f" where not exists (select 1 from public.tournament_bracket_matches bm where bm.id = mp.match_id) "
        f"   and (mp.status <> 'completed' or mp.completed_at <= now()) "
        f"order by 2, 1, 3")
    owner = db.scalar("select user_id::text from demo_stg.member_map where member_ref = 'owner'")
    n_wod = sum(1 for e in events if e["kind"] == "wod")
    log(f"  {len(events)} événements : {n_wod} WODs à scorer, {len(events) - n_wod} matchs (≤ maintenant)")
    for i, e in enumerate(events, 1):
        if e["kind"] == "wod":
            db.run(sql_file("21_lot2_scores_one_wod.sql", WOD_ID=e["ref"], OWNER_ID=owner))
        else:
            db.run(sql_file("31_lot3_one_match.sql", MATCH_REF=e["ref"]))
        if i % 25 == 0:
            log(f"    {i}/{len(events)} ({e['ts'][:16]})")
    r = db.one(sql_file("32_lot3_after.sql"))
    log(f"  {r}")
    set_param(db, "lot3_done", "1")
    log("LOT 3 OK")


def lot4(db, args):
    log(f"== LOT 4 ({db.target}) : badges, compteurs de reps, amis, actualités, streaks")
    require_lot(db, 3)
    refuse_if_done(db, 4)
    db.run(sql_file("40_lot4_social.sql", ANCHOR=anchor_of(db)))
    set_param(db, "lot4_done", "1")
    log("LOT 4 OK")


def check(db, args):
    name = args.what.upper()
    path = f"check_{name}.sql"
    if not os.path.exists(os.path.join(SQL, path)):
        die(f"contrôle inconnu : {name}")
    log(f"== CONTRÔLES {name} ({db.target})")
    anchor = get_param(db, "anchor") or default_anchor().isoformat()
    script = sql_file(path, ANCHOR=anchor, NBS2_BOX_ID=NBS2_BOX_ID)
    # Un contrôle par bloc « -- @@ » : chaque bloc rend une ligne (ok, controle, detail).
    failed = 0
    for block in re.split(r"^-- @@.*$", script, flags=re.M):
        block = block.strip()
        if not block:
            continue
        try:
            rows = db.run(block)
        except RuntimeError as e:
            rows = [{"ok": "false", "controle": block.splitlines()[0][:60], "detail": str(e)[:300]}]
        for r in rows:
            ok = str(r.get("ok", "")).lower() in ("true", "t", "1")
            failed += 0 if ok else 1
            log(f"  [{'OK  ' if ok else 'KO  '}] {r.get('controle')} — {r.get('detail')}")
    log(f"CONTRÔLES {name} : {'tous OK' if failed == 0 else str(failed) + ' KO'}")
    return failed


def status(db, args):
    rows = db.run("select key, value from demo_stg.params order by key")
    print_rows(rows)
    rows = db.run("select table_name, count(*) n from public._demo_seed_log group by 1 order by 1")
    print_rows(rows)


def rollback(db, auth, args):
    log(f"== ROLLBACK ({db.target})")
    if not args.yes:
        die("rollback : ajouter --yes pour confirmer")
    if db.scalar("select to_regclass('public._demo_seed_log') is null") in ("true", "t", "True"):
        die("aucun journal _demo_seed_log : rien à annuler")
    # Garde-fou : le journal ne référence que la box démo
    other = db.scalar(f"select count(*) from public._demo_seed_log where table_name = 'boxes' and row_id <> '{BOX_ID}'")
    if int(other or 0) != 0:
        die("le journal référence une autre box : arrêt")
    nbs2_before = nbs2_snapshot(db)
    nbs2_lot0 = get_param(db, "nbs2_snapshot")
    if nbs2_lot0 and json.loads(nbs2_lot0) != json.loads(nbs2_before):
        log(f"  ATTENTION : NBS2 diffère du relevé du lot 0 (activité réelle entre-temps ?) lot0={nbs2_lot0} maintenant={nbs2_before}")
    # 1. données publiques (ordre inverse des dépendances), 2. box, 3. comptes Auth via Admin API
    db.run(sql_file("90_rollback_data.sql"))
    users = db.run("select l.row_id from public._demo_seed_log l where l.table_name = 'auth.users' "
                   "and exists (select 1 from auth.users u where u.id::text = l.row_id)")
    log(f"  suppression de {len(users)} comptes Auth via l'API Admin")
    for i, u in enumerate(users, 1):
        auth.delete_user(u["row_id"])
        if i % 25 == 0:
            log(f"    {i}/{len(users)}")
    left = {r["t"]: int(r["n"]) for r in db.run(sql_file("91_rollback_verify.sql"))}
    log(f"  reste : {left}")
    if any(v != 0 for v in left.values()):
        die("des lignes du seed subsistent — ne pas supprimer le journal")
    nbs2_after = nbs2_snapshot(db)
    if json.loads(nbs2_before) != json.loads(nbs2_after):
        die(f"NBS2 a changé pendant le rollback ! avant={nbs2_before} après={nbs2_after}")
    log(f"  NBS2 inchangée : {nbs2_after}")
    db.run(sql_file("92_rollback_drop.sql"))
    log("ROLLBACK OK — box, données, comptes et journal supprimés")


def rollback_lots23(db, args):
    """Annule les lots 2 et 3 seulement : box, comptes Auth (et leurs mots de passe), profils et adhésions
    du lot 1 sont conservés ; profiles/box_elo remis à elo_start."""
    log(f"== ROLLBACK PARTIEL lots 2+3 ({db.target})")
    if not args.yes:
        die("rollback-lots23 : ajouter --yes pour confirmer")
    require_lot(db, 1)
    nbs2_before = nbs2_snapshot(db)
    left = {r["t"]: int(r["n"]) for r in db.run(sql_file("93_rollback_lots23.sql"))}
    log(f"  reste : {left}")
    if any(v != 0 for v in left.values()):
        die("état de fin de lot 1 non retrouvé")
    nbs2_after = nbs2_snapshot(db)
    if json.loads(nbs2_before) != json.loads(nbs2_after):
        die(f"NBS2 a changé pendant le rollback ! avant={nbs2_before} après={nbs2_after}")
    log(f"  NBS2 inchangée : {nbs2_after}")
    log("ROLLBACK PARTIEL OK — lots 2 et 3 annulés, lot 1 intact")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True, choices=["local", "prod"])
    ap.add_argument("--anchor", type=lambda s: dt.date.fromisoformat(s), help="lundi de la semaine « courante » (lot0)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("lot0", "lot1", "lot2", "lot3", "lot4", "status"):
        sub.add_parser(c)
    sub.add_parser("check").add_argument("what")
    sub.add_parser("rollback").add_argument("--yes", action="store_true")
    sub.add_parser("rollback-lots23").add_argument("--yes", action="store_true")
    args = ap.parse_args()

    db = Db(args.target)
    if args.cmd == "lot0":
        lot0(db, args)
    elif args.cmd == "lot1":
        lot1(db, AuthAdmin(args.target), args)
    elif args.cmd == "lot2":
        lot2(db, args)
    elif args.cmd == "lot3":
        lot3(db, args)
    elif args.cmd == "lot4":
        lot4(db, args)
    elif args.cmd == "check":
        sys.exit(1 if check(db, args) else 0)
    elif args.cmd == "status":
        status(db, args)
    elif args.cmd == "rollback":
        rollback(db, AuthAdmin(args.target), args)
    elif args.cmd == "rollback-lots23":
        rollback_lots23(db, args)


if __name__ == "__main__":
    main()
