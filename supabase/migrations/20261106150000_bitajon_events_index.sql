-- Índice de eventos: copia en Supabase de los eventos de los 4 contratos.
-- Lo llena la Edge Function "bitajon" (acción pública sync-events, que lee la red, no datos del cliente).
create table if not exists public.bitajon_events (
  deployment text not null, id text not null, contract_id text not null, name text not null,
  topics jsonb not null default '[]'::jsonb, data jsonb not null default '{}'::jsonb,
  ledger integer not null, closed_at timestamptz not null, tx_hash text not null default '',
  primary key (deployment, id)
);
create index if not exists bitajon_events_dep_ledger on public.bitajon_events (deployment, ledger);
create table if not exists public.bitajon_sync (
  deployment text primary key, cursor text, ledger integer, synced_at timestamptz not null default now()
);
alter table public.bitajon_events enable row level security;
alter table public.bitajon_sync enable row level security;
create policy "bitajon lectura publica" on public.bitajon_events for select to anon, authenticated using (true);
create policy "bitajon lectura publica" on public.bitajon_sync for select to anon, authenticated using (true);
