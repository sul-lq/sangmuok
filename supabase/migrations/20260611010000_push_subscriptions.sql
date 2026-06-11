create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_set_updated_at
  on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "users can read own push subscriptions"
  on public.push_subscriptions;
create policy "users can read own push subscriptions"
on public.push_subscriptions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users can create own push subscriptions"
  on public.push_subscriptions;
create policy "users can create own push subscriptions"
on public.push_subscriptions for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own push subscriptions"
  on public.push_subscriptions;
create policy "users can update own push subscriptions"
on public.push_subscriptions for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can delete own push subscriptions"
  on public.push_subscriptions;
create policy "users can delete own push subscriptions"
on public.push_subscriptions for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
