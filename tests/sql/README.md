Local database tests for supabase/beat-licensing.sql and supabase/hardening.sql.
They build a throwaway Postgres that copies your real table policies, install both scripts (twice, to prove they can be re-run),
then try to cheat: forged purchases, self-approval, self-promotion to admin, relisting exclusive beats, and so on.
Run with a local Postgres: psql -d testdb -f harness.sql; psql -d testdb -f ../../supabase/beat-licensing.sql; psql -d testdb -f ../../supabase/hardening.sql; psql -d testdb -f scenarios.sql
