-- UIDrop accounts, cloud projects and project sharing.
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.projects (
  id         text primary key,
  owner      uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'Untitled',
  device     text not null default 'pc',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id text not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'edit' check (role in ('edit', 'view')),
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists projects_owner_idx on public.projects (owner);

alter table public.projects        enable row level security;
alter table public.project_members enable row level security;

-- Who can reach a project row
create or replace function public.is_project_member(p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_project(p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_id and p.owner = auth.uid())
      or exists (select 1 from public.project_members m
                 where m.project_id = p_id and m.user_id = auth.uid() and m.role = 'edit');
$$;

drop policy if exists projects_read   on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;

create policy projects_read   on public.projects for select using (owner = auth.uid() or public.is_project_member(id));
create policy projects_insert on public.projects for insert with check (owner = auth.uid());
create policy projects_update on public.projects for update using (public.can_edit_project(id)) with check (public.can_edit_project(id));
create policy projects_delete on public.projects for delete using (owner = auth.uid());

drop policy if exists members_read   on public.project_members;
drop policy if exists members_delete on public.project_members;

create policy members_read on public.project_members for select
  using (user_id = auth.uid()
     or exists (select 1 from public.projects p where p.id = project_id and p.owner = auth.uid()));

-- A member can remove themselves; the owner can remove anyone.
create policy members_delete on public.project_members for delete
  using (user_id = auth.uid()
     or exists (select 1 from public.projects p where p.id = project_id and p.owner = auth.uid()));

-- Invite an existing account by email. Only the owner can call it, and the
-- address must already belong to a signed-up UIDrop account.
create or replace function public.share_project(p_project_id text, p_email text, p_role text default 'edit')
returns table (member_id uuid, display_name text, email text, member_role text)
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  who    record;
begin
  if auth.uid() is null then
    raise exception 'Log in first';
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.owner = auth.uid()) then
    raise exception 'Only the owner can share this project';
  end if;
  select u.id into target from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if target is null then
    raise exception 'No UIDrop account uses that email yet';
  end if;
  if target = auth.uid() then
    raise exception 'That is your own account';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, target, case when p_role = 'view' then 'view' else 'edit' end)
  on conflict (project_id, user_id) do update set role = excluded.role;

  return query
    select m.user_id,
           coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email::text, '@', 1)),
           u.email::text,
           m.role
    from public.project_members m
    join auth.users u on u.id = m.user_id
    where m.project_id = p_project_id
    order by m.added_at;
end $$;

create or replace function public.list_project_members(p_project_id text)
returns table (member_id uuid, display_name text, email text, member_role text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.owner = auth.uid()) then
    raise exception 'Only the owner can see who has access';
  end if;
  return query
    select m.user_id,
           coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email::text, '@', 1)),
           u.email::text,
           m.role
    from public.project_members m
    join auth.users u on u.id = m.user_id
    where m.project_id = p_project_id
    order by m.added_at;
end $$;

revoke all on function public.share_project(text, text, text) from public;
revoke all on function public.list_project_members(text) from public;
grant execute on function public.share_project(text, text, text) to authenticated;
grant execute on function public.list_project_members(text) to authenticated;
