create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- is_super_admin must never be settable by the owning user themselves; only a
-- service_role connection (Studio SQL, admin script) can flip it, per the
-- SuperAdmin-bootstrapping decision in the Phase 1 plan.
create function public.prevent_self_super_admin_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin and auth.role() <> 'service_role' then
    new.is_super_admin := old.is_super_admin;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_super_admin_grant
  before update on public.profiles
  for each row
  execute function public.prevent_self_super_admin_grant();

-- Auto-create a profile row whenever a new auth user signs up (free registration).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Helper used throughout later RLS policies; security definer avoids RLS
-- recursion when a policy needs to check the caller's own profile.
create function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;
