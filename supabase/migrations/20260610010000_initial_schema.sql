create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists table_name text not null default '',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.messages
  add column if not exists sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists reply_to_id bigint references public.messages(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.message_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  last_read_message_id bigint references public.messages(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists reservations_date_time_idx
  on public.reservations (reservation_date, reservation_time);

create index if not exists reservations_created_by_idx
  on public.reservations (created_by)
  where created_by is not null;

create index if not exists messages_created_at_idx
  on public.messages (created_at desc, id desc);

create index if not exists messages_sender_id_idx
  on public.messages (sender_id)
  where sender_id is not null;

create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id)
  where reply_to_id is not null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function private.set_updated_at();

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
before update on public.messages
for each row execute function private.set_updated_at();

drop trigger if exists message_reads_set_updated_at on public.message_reads;
create trigger message_reads_set_updated_at
before update on public.message_reads
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      left(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 40),
      left(split_part(coalesce(new.email, '직원'), '@', 1), 40)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(
    left(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), 40),
    left(split_part(coalesce(email, '직원'), '@', 1), 40)
  )
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.reservations enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

drop policy if exists "authenticated users can read profiles" on public.profiles;
create policy "authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can update their profile" on public.profiles;
create policy "users can update their profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "authenticated users can read reservations" on public.reservations;
create policy "authenticated users can read reservations"
on public.reservations for select
to authenticated
using (true);

drop policy if exists "authenticated users can create reservations" on public.reservations;
create policy "authenticated users can create reservations"
on public.reservations for insert
to authenticated
with check ((select auth.uid()) = created_by);

drop policy if exists "authenticated users can update reservations" on public.reservations;
create policy "authenticated users can update reservations"
on public.reservations for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated users can delete reservations" on public.reservations;
create policy "authenticated users can delete reservations"
on public.reservations for delete
to authenticated
using (true);

drop policy if exists "authenticated users can read messages" on public.messages;
create policy "authenticated users can read messages"
on public.messages for select
to authenticated
using (true);

drop policy if exists "users can create their messages" on public.messages;
create policy "users can create their messages"
on public.messages for insert
to authenticated
with check ((select auth.uid()) = sender_id);

drop policy if exists "users can update their messages" on public.messages;
create policy "users can update their messages"
on public.messages for update
to authenticated
using (
  (select auth.uid()) = sender_id
  or (
    sender_id is null
    and sender_name = (
      select display_name from public.profiles
      where id = (select auth.uid())
    )
  )
)
with check (
  (select auth.uid()) = sender_id
  or (
    sender_id is null
    and sender_name = (
      select display_name from public.profiles
      where id = (select auth.uid())
    )
  )
);

drop policy if exists "users can delete their messages" on public.messages;
create policy "users can delete their messages"
on public.messages for delete
to authenticated
using (
  (select auth.uid()) = sender_id
  or (
    sender_id is null
    and sender_name = (
      select display_name from public.profiles
      where id = (select auth.uid())
    )
  )
);

drop policy if exists "users can read their message state" on public.message_reads;
create policy "users can read their message state"
on public.message_reads for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can create their message state" on public.message_reads;
create policy "users can create their message state"
on public.message_reads for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update their message state" on public.message_reads;
create policy "users can update their message state"
on public.message_reads for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.reservations from anon;
revoke all on public.messages from anon;
revoke all on public.message_reads from anon;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.reservations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update on public.message_reads to authenticated;
grant usage, select on all sequences in schema public to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
