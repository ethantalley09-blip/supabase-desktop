-- Baseline extensions used across later migrations (uuid generation, etc).
create extension if not exists "pgcrypto" with schema extensions;
