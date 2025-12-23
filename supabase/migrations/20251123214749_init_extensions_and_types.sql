-- 0001_init_extensions_and_types.sql

CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE TYPE "public"."user_role" AS ENUM (
    'super_admin',
    'admin',
    'user'
);

CREATE TYPE "public"."question_bank" AS ENUM (
    'exam paper',
    'past paper questions',
    'typical questions'
);
