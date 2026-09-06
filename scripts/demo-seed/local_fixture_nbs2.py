#!/usr/bin/env python3
"""Pile jetable uniquement : crée une box « témoin » portant l'id de Crossfit NBS2 (owner + 1 membre,
1 WOD, 1 créneau, 1 score) pour que les contrôles d'isolation (E) et l'invariant NBS2 du rollback
aient quelque chose à comparer. Refuse de tourner sur autre chose que --target local."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seed_demo import AuthAdmin, Db, NBS2_BOX_ID, q  # noqa: E402

if "--target" not in sys.argv or sys.argv[sys.argv.index("--target") + 1] != "local":
    sys.exit("fixture réservée à --target local")

db, auth = Db("local"), AuthAdmin("local")
if db.scalar(f"select count(*) from public.boxes where id = '{NBS2_BOX_ID}'") != "0":
    sys.exit("box témoin déjà présente")
owner = auth.create_user("nbs2.owner@fixture.local", "nbs2_owner", "rx", "NBS2 Owner")
member = auth.create_user("nbs2.member@fixture.local", "nbs2_member", "inter", "NBS2 Member")
db.run(f"""
insert into public.boxes (id, owner_id, name, invite_code, is_active, city) values ('{NBS2_BOX_ID}', {q(owner)}, 'Crossfit NBS2', 'NBS001', true, 'Paris');
insert into public.box_members (box_id, member_id, role, status) values ('{NBS2_BOX_ID}', {q(owner)}, 'owner', 'active'), ('{NBS2_BOX_ID}', {q(member)}, 'member', 'active');
insert into public.box_wods (box_id, created_by, title, description, wod_type, scheduled_date, is_published)
  values ('{NBS2_BOX_ID}', {q(owner)}, 'FRAN', '21-15-9 thrusters / pull-ups', 'for-time', current_date - 3, true);
insert into public.class_schedules (box_id, title, scheduled_date, start_time, end_time, max_capacity)
  values ('{NBS2_BOX_ID}', 'WOD', current_date + 2, '18:00', '19:00', 12);
insert into public.wod_scores (wod_id, member_id, box_id, score_type, score_value, rx)
  select id, {q(member)}, '{NBS2_BOX_ID}', 'time', 312, true from public.box_wods where box_id = '{NBS2_BOX_ID}';
insert into public.tournaments (box_id, created_by, name, max_participants, level, status, format)
  values ('{NBS2_BOX_ID}', {q(owner)}, 'NBS2 Open', 16, 'rx', 'open', 'simple');
""")
print("box témoin NBS2 créée (local) :", db.scalar(f"select demo_stg.nbs2_snapshot('{NBS2_BOX_ID}')::text"))
