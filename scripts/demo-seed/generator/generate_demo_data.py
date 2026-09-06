#!/usr/bin/env python3
"""
Generateur deterministe des donnees de demonstration AthleX Fitness.

Graine fixe : deux executions produisent des fichiers strictement identiques.
Sortie : des CSV dans ../data/, charges par 03_seed_template.sql via des
tables de staging.

Usage :
    python3 generate_demo_data.py
"""

import collections
import csv
import os
import random
from datetime import date, datetime, timedelta

SEED = 20260902
BOX_ID = "d3d0b0a0-0000-4000-a000-000000000001"
BOX_NAME = "AthleX Fitness"
N_MEMBERS = 150
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

rng = random.Random(SEED)

# Lundi de la semaine de reference. Le loader SQL recale tout sur
# date_trunc('week', now()), ces dates ne servent que de squelette relatif.
L0 = date(2026, 9, 7)


def d(offset):
    return (L0 + timedelta(days=offset)).isoformat()


def write(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  {name:34s} {len(rows):5d} lignes")


# ---------------------------------------------------------------------
# 1. Membres
# ---------------------------------------------------------------------

PRENOMS = [
    "Léa", "Hugo", "Manon", "Lucas", "Chloé", "Nathan", "Camille", "Louis",
    "Sarah", "Théo", "Inès", "Enzo", "Jade", "Maxime", "Emma", "Adam",
    "Zoé", "Raphaël", "Lina", "Gabriel", "Anaïs", "Arthur", "Clara", "Jules",
    "Salomé", "Tom", "Louise", "Ethan", "Alice", "Noah", "Juliette", "Rayan",
    "Romane", "Mathis", "Eva", "Sacha", "Lucie", "Yanis", "Ambre", "Paul",
    "Nina", "Léo", "Margot", "Victor", "Élise", "Simon", "Maëlle", "Antoine",
    "Célia", "Baptiste", "Agathe", "Malo", "Nour", "Rémi", "Solène", "Ilan",
    "Lola", "Florian", "Mila", "Kylian", "Charlotte", "Amir", "Océane",
    "Clément", "Faustine", "Diego", "Anna", "Marius", "Iris", "Bastien",
    "Justine", "Mehdi", "Élodie", "Thibault", "Ludivine", "Karim",
]

NOMS = [
    "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit",
    "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel",
    "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel",
    "Girard", "André", "Lefèvre", "Mercier", "Dupont", "Lambert", "Bonnet",
    "François", "Martinez", "Legrand", "Garnier", "Faure", "Rousseau",
    "Blanc", "Guérin", "Muller", "Henry", "Roussel", "Nicolas", "Perrin",
    "Morin", "Mathieu", "Clément", "Gauthier", "Dumont", "Lopez", "Fontaine",
    "Chevalier", "Robin", "Masson", "Sanchez", "Gérard", "Nguyen", "Boyer",
    "Denis", "Lemaire", "Duval", "Joly", "Gautier", "Roger", "Roche",
    "Benali", "Haddad", "Ferreira", "Da Silva", "Costa", "Rossi", "Bouchard",
    "Meunier", "Aubert", "Carpentier", "Renard", "Barbier", "Marchand",
]

# Formules d'abonnement : (libelle, seances/semaine cible, poids)
FORMULES = [("1x/sem", 1, 15), ("2x/sem", 2, 40), ("3x/sem", 3, 30), ("illimité", 4, 15)]
# Plafond hebdomadaire reel impose par la formule (None = illimite). Le
# trigger prod trg_enforce_weekly_limit rejette toute reservation au-dela.
PLAFOND_SEMAINE = {"1x/sem": 1, "2x/sem": 2, "3x/sem": 3, "illimité": None}

# Pseudo du compte de demo : profiles.username est UNIQUE en prod et
# « JCVD » y existe deja (box Crossfit NBS2).
DEMO_PSEUDO = "[Apple_User]"


def nom_affiche():
    """Prénom Nom dans 80 % des cas, Prénom N. sinon. Jamais de suffixe numérique."""
    p, n = rng.choice(PRENOMS), rng.choice(NOMS)
    if rng.random() < 0.20:
        return f"{p} {n[0]}."
    return f"{p} {n}"


def tier_for(elo):
    if elo >= 1380:
        return "Elite"
    if elo >= 1280:
        return "RX+"
    if elo >= 1120:
        return "RX"
    if elo >= 1000:
        return "Inter"
    return "Scaled"


def build_members():
    pseudos = set()
    members = []

    # 149 membres generes, le 150e est le compte de demo insere ensuite.
    while len(members) < N_MEMBERS - 1:
        p = nom_affiche()
        if p in pseudos or p == DEMO_PSEUDO:
            continue
        pseudos.add(p)
        formule = rng.choices(FORMULES, weights=[f[2] for f in FORMULES])[0]

        elo = int(rng.gauss(1105, 115))
        elo = max(905, min(1465, elo))
        matchs = rng.randint(0, 30)
        # taux de victoire correle a l'ELO, avec du bruit
        taux = 0.5 + (elo - 1105) / 900.0 + rng.uniform(-0.10, 0.10)
        taux = max(0.05, min(0.88, taux))
        victoires = int(round(matchs * taux))
        members.append({
            "pseudo": p,
            "elo": elo,
            "matchs": matchs,
            "victoires": victoires,
            "streak": rng.choice([0, 0, 1, 1, 2, 2, 3, 4, 5, 6, 8]),
            "wods": rng.randint(4, 190),
            "reservations": rng.randint(6, 240),
            "formule": formule[0],
            "cible_sem": formule[1],
        })

    # Le compte de demo se place juste sous le 10e ELO : rang 11 sur 150.
    elos_tries = sorted((m["elo"] for m in members), reverse=True)
    demo_elo = elos_tries[9] - 1
    members.append({
        "pseudo": DEMO_PSEUDO,
        "elo": demo_elo,
        "matchs": 14,
        "victoires": 9,
        "streak": 6,
        "wods": 87,
        "reservations": 64,
        "formule": "illimité",
        "cible_sem": 4,
    })

    members.sort(key=lambda m: -m["elo"])
    rows = []
    for i, m in enumerate(members, start=1):
        is_demo = m["pseudo"] == DEMO_PSEUDO
        if is_demo:
            email = "nbstylz+appledemo@gmail.com"
            role = "member"
        else:
            email = f"m{i:03d}@demo.athlexapp.eu"
            role = "coach" if i in (1, 2, 5) else "member"
        rows.append([
            f"m{i:03d}", email, m["pseudo"], role, m["elo"], tier_for(m["elo"]),
            i, m["victoires"], m["matchs"], m["streak"], m["wods"],
            m["reservations"], m["formule"], m["cible_sem"],
            "true" if is_demo else "false",
        ])
    return rows


members_rows = build_members()
MEMBER_IDS = [r[0] for r in members_rows]
MEMBER_BY_ID = {r[0]: r for r in members_rows}
DEMO_ID = next(r[0] for r in members_rows if r[2] == DEMO_PSEUDO)
DEMO_RANK = MEMBER_BY_ID[DEMO_ID][6]
ELO_BY_ID = {r[0]: r[4] for r in members_rows}
CIBLE_BY_ID = {r[0]: r[13] for r in members_rows}
PLAFOND_BY_ID = {r[0]: PLAFOND_SEMAINE[r[12]] for r in members_rows}


# ---------------------------------------------------------------------
# 2. Creneaux de cours et reservations
# ---------------------------------------------------------------------

GRILLE = {
    0: [("06:30", 20), ("07:30", 20), ("12:15", 20), ("17:30", 20), ("18:30", 20), ("19:30", 20)],
    1: [("06:30", 20), ("07:30", 20), ("12:15", 20), ("17:30", 20), ("18:30", 20), ("19:30", 20)],
    2: [("06:30", 20), ("07:30", 20), ("12:15", 20), ("17:30", 20), ("18:30", 20), ("19:30", 20)],
    3: [("06:30", 20), ("07:30", 20), ("12:15", 20), ("17:30", 20), ("18:30", 20), ("19:30", 20)],
    4: [("06:30", 20), ("07:30", 20), ("12:15", 20), ("17:30", 20), ("18:30", 20), ("19:30", 20)],
    5: [("10:00", 20), ("11:15", 20)],
    6: [("10:00", 15)],
}

# Chaque membre a une preference horaire, et une presence reelle qui varie
# d'une semaine a l'autre sous sa formule : un 2x/sem peut venir une fois,
# deux fois, ou pas du tout, jamais trois (plafond de la formule).
PREFS = {
    "matin":   ["06:30", "07:30"],
    "midi":    ["12:15"],
    "soir":    ["17:30", "18:30", "19:30"],
    "weekend": ["10:00", "11:15"],
}

# Places a laisser libres sur tout creneau FUTUR, pour que le reviewer
# Apple puisse reserver. Le seul creneau futur complet est celui de la
# capture (vendredi 17:30 de la semaine en cours).
PLACES_LIBRES_MIN_FUTUR = 4
CRENEAU_CAPTURE = (4, "17:30")

DEMO_RESAS = {(0, "19:30"), (1, "12:15"), (3, "19:30"), CRENEAU_CAPTURE,
              (-7, "19:30"), (-6, "17:30"), (-4, "18:30"), (-3, "19:30")}

slots_rows = []
resas_rows = []
slot_seq = 0
slot_index = {}       # (offset, heure) -> (slot_id, capacite)
occupation = {}       # slot_id -> set(member_ref)
semaine_par_membre = collections.Counter()   # (member_ref, n° semaine) -> resas

for offset in range(-14, 14):   # 4 semaines pleines, lundi a dimanche
    jour = (L0 + timedelta(days=offset)).weekday()
    for heure, capacite in GRILLE[jour]:
        slot_seq += 1
        slot_id = f"s{slot_seq:04d}"
        slots_rows.append([slot_id, BOX_ID, d(offset), heure, "WOD", capacite])
        slot_index[(offset, heure)] = (slot_id, capacite)
        occupation[slot_id] = set()

pref_by_id = {}
for mid in MEMBER_IDS:
    pref_by_id[mid] = rng.choices(
        ["matin", "midi", "soir", "weekend"], weights=[22, 18, 48, 12])[0]


def places_dispo(offset, slot_id, capacite):
    occ = len(occupation[slot_id])
    if offset < 0:
        return capacite - occ
    return capacite - occ - PLACES_LIBRES_MIN_FUTUR


def quota_ok(offset, mid):
    plafond = PLAFOND_BY_ID[mid]
    return plafond is None or semaine_par_membre[(mid, offset // 7)] < plafond


def reserver(offset, heure, mid, force=False):
    slot_id, capacite = slot_index[(offset, heure)]
    if mid in occupation[slot_id]:
        return False
    if not quota_ok(offset, mid):
        return False
    if not force and places_dispo(offset, slot_id, capacite) <= 0:
        return False
    if force and len(occupation[slot_id]) >= capacite:
        return False
    occupation[slot_id].add(mid)
    semaine_par_membre[(mid, offset // 7)] += 1
    if offset < 0:
        statut = "no_show" if rng.random() < 0.06 else "attended"
    else:
        statut = "booked"
    resas_rows.append([slot_id, mid, statut])
    return True


# Reservations forcees du compte de demo
for offset, heure in sorted(DEMO_RESAS):
    reserver(offset, heure, DEMO_ID, force=True)

# Presence de chaque membre, semaine par semaine
for semaine in range(-2, 2):
    for mid in MEMBER_IDS:
        cible = CIBLE_BY_ID[mid]
        # variation reelle : -2 a 0 sous la formule, bornee a 0..5 ; le
        # plafond est de toute facon impose par quota_ok() a la reservation
        n = max(0, min(5, cible + rng.choice([-2, -1, -1, 0, 0, 0, 0, 0])))
        if semaine >= 1:
            # la semaine prochaine, beaucoup n'ont pas encore reserve
            n = int(round(n * rng.uniform(0.25, 0.6)))
        if mid == DEMO_ID:
            continue
        jours = list(range(semaine * 7, semaine * 7 + 7))
        rng.shuffle(jours)
        pref = pref_by_id[mid]
        faits = 0
        for offset in jours:
            if faits >= n:
                break
            wd = (L0 + timedelta(days=offset)).weekday()
            if wd >= 5:
                horaires = [h for h, _ in GRILLE[wd]]
            elif pref == "weekend":
                # un weekend-only vient parfois en semaine le soir
                horaires = PREFS["soir"] if rng.random() < 0.3 else []
            else:
                horaires = list(PREFS[pref])
                if rng.random() < 0.15:
                    horaires = [h for h, _ in GRILLE[wd]]
            rng.shuffle(horaires)
            for h in horaires:
                if reserver(offset, h, mid):
                    faits += 1
                    break

# Le creneau de la capture est rempli a bloc, c'est le seul creneau futur
# complet du jeu de donnees.
slot_id, capacite = slot_index[CRENEAU_CAPTURE]
candidats = [m for m in MEMBER_IDS if m not in occupation[slot_id]]
rng.shuffle(candidats)
for mid in candidats:
    if len(occupation[slot_id]) >= capacite:
        break
    reserver(CRENEAU_CAPTURE[0], CRENEAU_CAPTURE[1], mid, force=True)


# ---------------------------------------------------------------------
# 3. Programmation et scores
# ---------------------------------------------------------------------

PROGRAMME = [
    (0, "BACK SQUAT", "strength", "5x5 @ 80% 1RM, repos 2 min", "charge"),
    (0, "IRON TIDE", "amrap", "12 min AMRAP : 10 wall balls 9kg / 8 toes-to-bar / 200m row", "reps"),
    (1, "SPLIT DECISION", "for_time", "21-15-9 deadlifts 100kg / handstand push-ups, cap 18 min", "temps"),
    (1, "RENFO", "custom", "3 tours : 40s planche / 15 hollow rocks / 20 banded pull-aparts", None),
    (2, "ENGINE ROOM", "emom", "EMOM 20 min : cal row / 50 double-unders / 12 burpees / repos", "reps"),
    (2, "MOBILITE", "custom", "15 a 25' hanches et epaules", None),
    (3, "CLEAN COMPLEX", "strength", "8x(1 power clean + 1 hang squat clean + 1 jerk)", "charge"),
    (3, "SHORT FUSE", "for_time", "3 rounds : 15 thrusters 43kg / 15 chest-to-bar", "temps"),
    (4, "BRUTAL GAUNTLET", "amrap", "14 min AMRAP : 10 pull-ups / 32 double-unders / 250m row", "reps"),
    (4, "FINISHER", "custom", "5 min : max cal assault bike", None),
    (5, "TAG TEAM 200", "team", "En binome : 200 wall balls / 150 cal row / 100 burpees over the bar", "temps"),
    (6, "OPEN GYM", "custom", "Mobilite, skill work, rattrapage", None),
]

POOL_PASSE = [
    ("STORM DRAIN", "amrap", "15 min AMRAP : 12 box jumps / 9 power cleans 60kg / 6 bar muscle-ups", "reps"),
    ("HALF LIFE", "for_time", "30-20-10 cal row / kettlebell swings 24kg / burpees", "temps"),
    ("FRONT SQUAT", "strength", "4x6 @ 75% 1RM", "charge"),
    ("COLD START", "emom", "EMOM 16 : 8 thrusters / 10 toes-to-bar / 12 cal bike / repos", "reps"),
    ("GRAVITY WELL", "for_time", "5 rounds : 10 deadlifts 100kg / 15 box jumps / 20 double-unders", "temps"),
    ("PRESS COMPLEX", "strength", "6x(2 push press + 2 push jerk)", "charge"),
    ("RED LINE", "amrap", "10 min AMRAP : 5 handstand push-ups / 10 pistols / 15 pull-ups", "reps"),
    ("LONG HAUL", "for_time", "1000m row / 50 wall balls / 800m run", "temps"),
    ("DEADLIFT", "strength", "5x3 @ 85% 1RM", "charge"),
    ("SHORT CIRCUIT", "amrap", "8 min AMRAP : 8 hang cleans 50kg / 8 burpees over bar", "reps"),
    ("WATERLINE", "for_time", "3 rounds : 500m row / 20 thrusters 30kg, cap 15 min", "temps"),
    ("SNATCH COMPLEX", "strength", "7x(1 snatch pull + 1 hang snatch + 1 OHS)", "charge"),
]

# Six semaines passees, un bloc principal par jour de semaine + samedi team.
PROGRAMME_PASSE = []
k = 0
for semaine in range(-6, 0):
    for jour in range(0, 5):
        nom, fmt, detail, unite = POOL_PASSE[k % len(POOL_PASSE)]
        PROGRAMME_PASSE.append((semaine * 7 + jour, nom, fmt, detail, unite))
        k += 1
    PROGRAMME_PASSE.append((semaine * 7 + 5, "TEAM SATURDAY", "team",
                            "En binome, format variable", None))

wods_rows = []
scores_rows = []
wod_seq = 0

for offset, nom, fmt, detail, unite in PROGRAMME_PASSE + PROGRAMME:
    wod_seq += 1
    wod_id = f"w{wod_seq:03d}"
    wods_rows.append([wod_id, BOX_ID, d(offset), nom, fmt, detail])

    if unite is None:
        continue

    n_scores = rng.randint(28, 62) if offset >= 0 else rng.randint(22, 55)
    participants = rng.sample(MEMBER_IDS, n_scores)
    demo_present = (nom in ("BRUTAL GAUNTLET", "SPLIT DECISION", "BACK SQUAT", "CLEAN COMPLEX")
                    or (offset < 0 and rng.random() < 0.45))
    if demo_present and DEMO_ID not in participants:
        participants[0] = DEMO_ID
    elif not demo_present and DEMO_ID in participants:
        participants.remove(DEMO_ID)

    for mid in participants:
        elo = ELO_BY_ID[mid]
        facteur = (elo - 900) / 600.0            # 0 -> 1
        if unite == "reps":
            base = 140 + facteur * 130
            valeur = str(int(base + rng.gauss(0, 18)))
        elif unite == "temps":
            secondes = int(1080 - facteur * 420 + rng.gauss(0, 55))
            secondes = max(300, secondes)
            valeur = f"{secondes // 60:02d}:{secondes % 60:02d}"
        else:
            valeur = str(int(5 * round((70 + facteur * 90 + rng.gauss(0, 9)) / 5)))
        scores_rows.append([wod_id, mid, d(offset), unite, valeur,
                            rng.choice(["RX", "RX", "RX", "Scaled"])])


# ---------------------------------------------------------------------
# 4. Tournois, brackets et resultats
# ---------------------------------------------------------------------

def issue(a, b):
    """Vainqueur d'un match, probabilite logistique sur l'ecart d'ELO."""
    ea = 1.0 / (1.0 + 10 ** ((ELO_BY_ID[b] - ELO_BY_ID[a]) / 400.0))
    return (a, b) if rng.random() < ea else (b, a)


def score_match(fmt):
    if fmt == "reps":
        x = rng.randint(150, 280)
        return f"{x} reps", f"{x - rng.randint(3, 40)} reps"
    s = rng.randint(420, 900)
    t = s + rng.randint(6, 90)
    return f"{s // 60:02d}:{s % 60:02d}", f"{t // 60:02d}:{t % 60:02d}"


def double_elim(tid, joueurs, rounds_joues, fmt, jour0=0, un_jour=False):
    """Double elimination. rounds_joues borne l'avancement (tournoi live).
    jour0 : offset du premier tour ; chaque tour suivant a lieu le lendemain,
    sauf si un_jour (mini-tournoi joue en une soiree)."""
    def dj(tour):
        return d(jour0 if un_jour else jour0 + tour - 1)
    matchs = []
    seq = 0
    wb = list(joueurs)
    perdants_par_tour = []
    tour = 0

    while len(wb) > 1 and tour < rounds_joues:
        tour += 1
        suivant, perdus = [], []
        for i in range(0, len(wb), 2):
            seq += 1
            g, p = issue(wb[i], wb[i + 1])
            sg, sp = score_match(fmt)
            matchs.append([tid, f"{tid}-wb{seq:03d}", "winners", tour, dj(tour),
                           wb[i], wb[i + 1], g, p, sg, sp, "termine"])
            suivant.append(g)
            perdus.append(p)
        perdants_par_tour.append(perdus)
        wb = suivant

    # Matchs en attente du tour suivant, s'il reste des joueurs
    if len(wb) > 1:
        for i in range(0, len(wb), 2):
            seq += 1
            matchs.append([tid, f"{tid}-wb{seq:03d}", "winners", tour + 1, dj(tour + 1),
                           wb[i], wb[i + 1], "", "", "", "", "en_attente"])

    # Bracket perdants, alimente tour par tour
    lb = []
    lseq = 0
    for t, perdus in enumerate(perdants_par_tour, start=1):
        pool = lb + perdus
        rng.shuffle(pool)
        suivant = []
        for i in range(0, len(pool) - 1, 2):
            lseq += 1
            g, p = issue(pool[i], pool[i + 1])
            sg, sp = score_match(fmt)
            matchs.append([tid, f"{tid}-lb{lseq:03d}", "losers", t, dj(t),
                           pool[i], pool[i + 1], g, p, sg, sp, "termine"])
            suivant.append(g)
        if len(pool) % 2:
            suivant.append(pool[-1])
        lb = suivant

    return matchs, wb, lb


tournois_rows = []
inscrits_rows = []
matchs_rows = []

# 4.1 Battle AthleX #2 — termine, 32 joueurs
pool32 = rng.sample(MEMBER_IDS, 32)
if DEMO_ID not in pool32:
    pool32[7] = DEMO_ID
tournois_rows.append(["t001", BOX_ID, "Battle AthleX #2", "double_elimination",
                      "RX", 32, 32, "termine", d(-21), d(-16)])
for i, m in enumerate(pool32, start=1):
    inscrits_rows.append(["t001", m, i])
m2, wb2, lb2 = double_elim("t001", pool32, 99, "reps", jour0=-21)
matchs_rows += m2

# 4.2 Battle AthleX #3 — live, 32 joueurs, arrete apres les quarts
pool32b = rng.sample(MEMBER_IDS, 32)
if DEMO_ID not in pool32b:
    pool32b[3] = DEMO_ID
# Le compte de demo doit etre encore en lice cote gagnants : on le place en
# tete de tableau et on force ses victoires plus bas.
tournois_rows.append(["t002", BOX_ID, "Battle AthleX #3", "double_elimination",
                      "RX", 32, 32, "live", d(-4), ""])
for i, m in enumerate(pool32b, start=1):
    inscrits_rows.append(["t002", m, i])
m3, wb3, lb3 = double_elim("t002", pool32b, 3, "temps", jour0=-4)
# Requalification du compte de demo dans le bracket gagnants
for row in m3:
    if row[11] == "termine" and DEMO_ID in (row[5], row[6]) and row[8] == DEMO_ID:
        row[7], row[8] = row[8], row[7]
        row[9], row[10] = row[10], row[9]
matchs_rows += m3

# 4.3 Inter-box Rhone — ouvert aux inscriptions, 47/64
tournois_rows.append(["t003", BOX_ID, "Inter-box Rhone", "inter_box",
                      "RX", 64, 47, "ouvert", d(11), ""])
for i, m in enumerate(rng.sample(MEMBER_IDS, 46), start=1):
    inscrits_rows.append(["t003", m, i])
inscrits_rows.append(["t003", DEMO_ID, 47])

# 4.4 Sprint du jeudi — mini-tournoi, deux editions terminees, une ouverte
for n, (tid, statut, jour, cap, nb) in enumerate([
    ("t004", "termine", -14, 8, 8),
    ("t005", "termine", -7, 8, 8),
    ("t006", "ouvert", 3, 8, 6),
]):
    tournois_rows.append([tid, BOX_ID, f"Sprint du jeudi #{n + 7}", "mini_tournoi",
                          "Open", cap, nb, statut, d(jour),
                          d(jour) if statut == "termine" else ""])
    pool = rng.sample(MEMBER_IDS, nb)
    if tid == "t005" and DEMO_ID not in pool:
        pool[2] = DEMO_ID
    for i, m in enumerate(pool, start=1):
        inscrits_rows.append([tid, m, i])
    if statut == "termine":
        mm, _, _ = double_elim(tid, pool, 99, "temps", jour0=jour, un_jour=True)
        matchs_rows += mm

# 4.5 Competition physique inter-box terminee
tournois_rows.append(["t007", BOX_ID, "Throwdown AthleX Automne", "competition_physique",
                      "RX+", 40, 40, "termine", d(-35), d(-35)])
for i, m in enumerate(rng.sample(MEMBER_IDS, 40), start=1):
    inscrits_rows.append(["t007", m, i])


# ---------------------------------------------------------------------
# 4bis. Historique ELO
#
# L'ELO bouge sur deux sources : les matchs de tournoi (formule ELO
# classique, K=32) et le classement sur le WOD du jour (variation par
# percentile). On genere tous les evenements dans l'ordre chronologique, on
# somme les variations par membre, et on en deduit l'ELO de depart pour que
# la serie retombe exactement sur l'ELO final de members.csv.
# ---------------------------------------------------------------------

K_MATCH = 32


def delta_wod(rang, n):
    """Variation d'ELO selon le percentile sur le whiteboard."""
    pct = rang / n
    if pct <= 0.10:
        return rng.randint(8, 12)
    if pct <= 0.25:
        return rng.randint(4, 7)
    if pct <= 0.50:
        return rng.randint(0, 3)
    if pct <= 0.75:
        return rng.randint(-3, 0)
    if pct <= 0.90:
        return rng.randint(-7, -4)
    return rng.randint(-12, -8)


def cle_tri(unite, valeur):
    if unite == "temps":
        m, sec = valeur.split(":")
        return int(m) * 60 + int(sec)
    return -int(valeur)


events = []   # (jour, ordre, member_ref, delta_provisoire, source_type, source_ref)

# WOD du jour : classement par bloc, delta par percentile
scores_par_wod = collections.defaultdict(list)
for wod_ref, mid, jour, unite, valeur, cat in scores_rows:
    scores_par_wod[wod_ref].append((mid, jour, unite, valeur))
for wod_ref, lst in scores_par_wod.items():
    lst.sort(key=lambda x: cle_tri(x[2], x[3]))
    n = len(lst)
    for rang, (mid, jour, unite, valeur) in enumerate(lst, start=1):
        events.append((jour, 1, mid, delta_wod(rang, n), "wod_score", wod_ref))

# Matchs de tournoi : delta calcule au vol dans la passe chronologique
for row in matchs_rows:
    if row[11] != "termine":
        continue
    events.append((row[4], 0, row[7], None, "match_win", row[1]))
    events.append((row[4], 0, row[8], None, "match_loss", row[1]))

events.sort(key=lambda e: (e[0], e[1]))

# Passe 1 : simuler depuis l'ELO final "a rebours" est impossible avec la
# formule ELO (dependante de l'etat), donc on fait deux passes : la premiere
# avec l'ELO final comme depart pour estimer la somme des deltas, la seconde
# avec l'ELO de depart corrige.
def simuler(elo_depart):
    elo = dict(elo_depart)
    hist = []
    i = 0
    while i < len(events):
        jour, ordre, mid, delta, typ, ref = events[i]
        if typ == "wod_score":
            elo[mid] += delta
            hist.append([mid, jour, delta, elo[mid], typ, ref])
            i += 1
            continue
        # match : les deux evenements (win, loss) sont consecutifs
        _, _, gagnant, _, _, mref = events[i]
        _, _, perdant, _, _, _ = events[i + 1]
        ea = 1.0 / (1.0 + 10 ** ((elo[perdant] - elo[gagnant]) / 400.0))
        dg = int(round(K_MATCH * (1 - ea)))
        dp = -dg
        elo[gagnant] += dg
        elo[perdant] += dp
        hist.append([gagnant, jour, dg, elo[gagnant], "match_win", mref])
        hist.append([perdant, jour, dp, elo[perdant], "match_loss", mref])
        i += 2
    return elo, hist


final = dict(ELO_BY_ID)
depart = dict(final)
# Point fixe : la formule ELO depend de l'etat, on itere jusqu'a ce que la
# serie retombe sur l'ELO final a 2 points pres.
for _ in range(12):
    elo_fin, elo_history = simuler(depart)
    ecart_max = max(abs(elo_fin[mid] - final[mid]) for mid in MEMBER_IDS)
    if ecart_max <= 2:
        break
    depart = {mid: depart[mid] - (elo_fin[mid] - final[mid]) for mid in MEMBER_IDS}
assert ecart_max <= 2, f"historique ELO incoherent, ecart max {ecart_max}"
elo_fin3 = elo_fin
# Les ecarts residuels de 1 ou 2 points sont absorbes dans l'ELO final
for mid in MEMBER_IDS:
    ELO_BY_ID[mid] = elo_fin3[mid]

ELO_DEPART = depart
# Levier de calibration mode A (prod : compute_wod_elo + trg_bracket_match_elo recalculent l'ELO a partir de
# elo_start). Mesure sur la pile jetable : -60 ici ne deplace l'ELO final du demo que de ~-11 (les gains
# de bracket augmentent quand il part plus bas). A n'ajuster que sur decision explicite.
DEMO_ELO_DEPART_AJUST = 0
ELO_DEPART[DEMO_ID] += DEMO_ELO_DEPART_AJUST

# Bilan victoires / matchs recalcule depuis les matchs seedes
bilan = collections.defaultdict(lambda: [0, 0])
for row in matchs_rows:
    if row[11] == "termine":
        bilan[row[7]][0] += 1
        bilan[row[7]][1] += 1
        bilan[row[8]][1] += 1

for r in members_rows:
    mid = r[0]
    r[4] = ELO_BY_ID[mid]
    r[5] = tier_for(r[4])
    r[7] = bilan[mid][0]
    r[8] = bilan[mid][1]
members_rows.sort(key=lambda r: -r[4])
for i, r in enumerate(members_rows, start=1):
    r[6] = i
DEMO_RANK = MEMBER_BY_ID[DEMO_ID][6]
elo_depart_rows = [[mid, ELO_DEPART[mid], d(-42)] for mid in MEMBER_IDS]


# ---------------------------------------------------------------------
# 5. Badges, amis, actualites
# ---------------------------------------------------------------------

# Familles de badges de mouvement telles qu'elles existent dans
# badges_catalog en prod (prefixe + paliers reels). La cle de mouvement est
# celle de MOVEMENT_BADGE_PREFIX (src/services/gamification.ts) et alimente
# movement_rep_counts. tier k = k-ieme palier de la famille, borne au max.
CATALOGUE = {
    "squat":           ("mv_squat",     [100, 500, 1000, 5000]),
    "deadlift":        ("mv_deadlifts", [100, 500, 1000, 5000]),
    "pull_up":         ("mv_pullup",    [100, 500, 1000, 5000]),
    "double_under":    ("mv_du",        [500, 2000, 5000, 10000]),
    "wall_ball":       ("mv_wallball",  [100, 500, 1000, 5000]),
    "clean_and_jerk":  ("mv_cj",        [100, 500, 1000, 5000]),
    "toes_to_bar":     ("mv_t2b",       [100, 500, 1000]),
    "hspu":            ("mv_hspu",      [100, 500, 1000]),
    "ring_muscle_up":  ("mv_ring_mu",   [50, 200, 500]),
    "snatch":          ("mv_snatch",    [100, 500, 1000, 5000]),
    "box_jump":        ("mv_box_jump",  [100, 500, 1000]),
    "chest_to_bar":    ("mv_c2b",       [100, 500, 1000]),
}

BADGES = [
    ("squat", 5), ("deadlift", 4), ("pull_up", 4), ("double_under", 3),
    ("wall_ball", 3), ("clean_and_jerk", 2), ("toes_to_bar", 2),
    ("hspu", 1), ("ring_muscle_up", 0), ("snatch", 0),
    ("box_jump", 0), ("chest_to_bar", 0),
]

badges_rows = []      # member_ref, mouvement, badge_key, palier, debloque
reps_rows = []        # member_ref, mouvement, total_reps


def poser_badges(mid, mv, tier):
    prefix, paliers = CATALOGUE[mv]
    tier = min(tier, len(paliers))
    if tier == 0:
        # verrouille : quelques reps sous le premier palier, aucun badge
        badges_rows.append([mid, mv, f"{prefix}_{paliers[0]}", paliers[0], "false"])
        reps_rows.append([mid, mv, rng.randint(paliers[0] // 4, paliers[0] - 1)])
        return
    for p in paliers[:tier]:
        badges_rows.append([mid, mv, f"{prefix}_{p}", p, "true"])
    suivant = paliers[tier] if tier < len(paliers) else int(paliers[-1] * 1.5)
    reps_rows.append([mid, mv, rng.randint(paliers[tier - 1], suivant - 1)])


for mv, tier in BADGES:
    poser_badges(DEMO_ID, mv, tier)

# Badges repartis sur l'ensemble de la box, pour que les classements de
# badges ne soient pas vides.
for mid in MEMBER_IDS:
    if mid == DEMO_ID:
        continue
    for mv, _ in rng.sample(BADGES, rng.randint(2, 7)):
        poser_badges(mid, mv, rng.randint(1, 5))

amis_rows = [[DEMO_ID, mid, "accepted"]
             for mid in rng.sample([m for m in MEMBER_IDS if m != DEMO_ID], 23)]

news_rows = [
    [BOX_ID, d(-6), "Nouvelle programmation",
     "Le cycle force demarre lundi. Back squat le lundi, clean complex le jeudi, "
     "sur six semaines. Pensez a noter vos charges dans l'app."],
    [BOX_ID, d(-3), "Resultats Battle AthleX #2",
     "Beau plateau et un bracket serre jusqu'en finale. Merci a tous les "
     "participants, les inscriptions pour le #3 sont ouvertes."],
    [BOX_ID, d(0), "Horaires de la semaine",
     "Creneau supplementaire a 07:30 du lundi au vendredi. Le samedi 11:15 "
     "reste ouvert au format libre."],
]


# ---------------------------------------------------------------------
# Ecriture
# ---------------------------------------------------------------------

os.makedirs(OUT, exist_ok=True)
print(f"Generation des donnees de demonstration — {BOX_NAME}\n")

write("members.csv",
      ["member_ref", "email", "pseudo", "role", "elo", "tier", "rang",
       "victoires", "matchs", "streak", "wods_total", "reservations_total",
       "formule", "seances_cible_semaine", "is_demo_account"],
      members_rows)

write("class_slots.csv",
      ["slot_ref", "box_id", "jour", "heure", "type", "capacite"], slots_rows)

write("reservations.csv", ["slot_ref", "member_ref", "statut"], resas_rows)

write("wod_blocks.csv",
      ["wod_ref", "box_id", "jour", "nom", "format", "detail"], wods_rows)

write("wod_scores.csv",
      ["wod_ref", "member_ref", "jour", "unite", "valeur", "categorie"], scores_rows)

write("tournaments.csv",
      ["tournament_ref", "box_id", "nom", "format", "categorie", "places",
       "inscrits", "statut", "date_debut", "date_fin"], tournois_rows)

write("tournament_participants.csv",
      ["tournament_ref", "member_ref", "seed"], inscrits_rows)

write("tournament_matches.csv",
      ["tournament_ref", "match_ref", "bracket", "tour", "jour", "joueur_a",
       "joueur_b", "vainqueur", "perdant", "score_vainqueur", "score_perdant",
       "statut"], matchs_rows)

write("elo_start.csv", ["member_ref", "elo_depart", "jour"], elo_depart_rows)
write("elo_history.csv",
      ["member_ref", "jour", "delta", "elo_apres", "source_type", "source_ref"],
      elo_history)

write("badges.csv", ["member_ref", "mouvement", "badge_key", "palier", "debloque"], badges_rows)
write("movement_reps.csv", ["member_ref", "mouvement", "total_reps"], reps_rows)
write("friends.csv", ["member_ref", "ami_ref", "statut"], amis_rows)
write("box_news.csv", ["box_id", "jour", "titre", "contenu"], news_rows)

print(f"\nCompte de demo : {DEMO_ID}  ELO {ELO_BY_ID[DEMO_ID]}  rang #{DEMO_RANK} / {N_MEMBERS}")
print(f"Reservations totales : {len(resas_rows)}")
print(f"Matchs de tournoi    : {len(matchs_rows)}")
print(f"Scores de WOD        : {len(scores_rows)}")
print(f"Evenements ELO       : {len(elo_history)}")
print(f"ELO demo : depart {ELO_DEPART[DEMO_ID]} -> final {ELO_BY_ID[DEMO_ID]}")
print(f"Graine               : {SEED} (ne pas modifier)")
