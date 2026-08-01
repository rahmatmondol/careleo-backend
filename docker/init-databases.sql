-- Creates the per-service databases used by the hybrid stack.
--
-- The postgres image only creates the single database named by POSTGRES_DB
-- (careleo). Each microservice owns its own database on the same instance, so
-- without this script shop-service et al. start fine but every query fails with
-- `database "careleo_shop" does not exist`.
--
-- Files in /docker-entrypoint-initdb.d run ONCE, when the data volume is first
-- initialised. If your volume already exists, create the databases by hand:
--
--   docker compose -f docker-compose.hybrid.yml exec careleo-postgres \
--     psql -U careleo -d careleo -f /docker-entrypoint-initdb.d/init-databases.sql
--
-- (or `docker compose -f docker-compose.hybrid.yml down -v` to start clean —
-- this destroys all local data).

SELECT 'CREATE DATABASE careleo_shop OWNER careleo'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'careleo_shop')\gexec

SELECT 'CREATE DATABASE careleo_social OWNER careleo'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'careleo_social')\gexec

SELECT 'CREATE DATABASE careleo_video OWNER careleo'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'careleo_video')\gexec

SELECT 'CREATE DATABASE careleo_media OWNER careleo'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'careleo_media')\gexec

SELECT 'CREATE DATABASE careleo_freelancer OWNER careleo'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'careleo_freelancer')\gexec
