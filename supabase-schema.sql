-- =============================================================================
--  Gestion locative LMNP — schéma Supabase
--  À coller dans Supabase > SQL Editor > New query > Run.
--  Crée la table de stockage et les règles de sécurité (RLS) : chaque
--  utilisateur ne peut lire/écrire QUE ses propres données.
-- =============================================================================

create table if not exists public.app_state (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  key        text        not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Sécurité au niveau des lignes
alter table public.app_state enable row level security;

drop policy if exists "app_state_select_own" on public.app_state;
drop policy if exists "app_state_insert_own" on public.app_state;
drop policy if exists "app_state_update_own" on public.app_state;
drop policy if exists "app_state_delete_own" on public.app_state;

create policy "app_state_select_own" on public.app_state
  for select using (auth.uid() = user_id);

create policy "app_state_insert_own" on public.app_state
  for insert with check (auth.uid() = user_id);

create policy "app_state_update_own" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "app_state_delete_own" on public.app_state
  for delete using (auth.uid() = user_id);

-- Met à jour updated_at à chaque modification
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_touch on public.app_state;
create trigger app_state_touch
  before update on public.app_state
  for each row execute function public.touch_updated_at();
