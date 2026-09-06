-- ROLLBACK (3/3) : suppression du journal et du staging (après vérification 91 = tout à 0).
drop schema if exists demo_stg cascade;
drop function if exists public._demo_log(text, text);
drop table if exists public._demo_seed_log;
