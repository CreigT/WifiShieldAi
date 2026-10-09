-- Execute once in Supabase SQL editor.
create table if not exists public.pro_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  updated_at timestamptz not null default now()
);
alter table public.pro_subscriptions enable row level security;
-- No public policies: access only through verified server API using service role.
