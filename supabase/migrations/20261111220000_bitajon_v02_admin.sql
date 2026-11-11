-- v0.2: admin multisig, llave del equipo, correo privado de las fundaciones y precio del XLM.
create table if not exists public.bitajon_team_key (
  id text primary key default 'team', public_key text not null, secret text not null, created_at timestamptz not null default now()
);
alter table public.bitajon_team_key enable row level security; -- sin políticas: solo la Edge Function (service role)
create table if not exists public.bitajon_admins (
  registry text not null, address text not null, label text, created_at timestamptz not null default now(),
  primary key (registry, address)
);
alter table public.bitajon_admins enable row level security;
create policy "bitajon lectura publica" on public.bitajon_admins for select to anon, authenticated using (true);
alter table public.bitajon_nonprofit_private add column if not exists email text;
alter table public.bitajon_nonprofit_private add column if not exists payout_wallet text;
alter table public.bitajon_nonprofit_private alter column rut_path drop not null;
alter table public.bitajon_nonprofit_private alter column rut_sha256 drop not null;
alter table public.bitajon_nonprofit_meta add column if not exists login_method text;
create table if not exists public.bitajon_price (id text primary key, data jsonb not null, fetched_at timestamptz not null default now());
alter table public.bitajon_price enable row level security;
create policy "bitajon lectura publica" on public.bitajon_price for select to anon, authenticated using (true);
-- Admin inicial de cada despliegue (las demás se agregan desde el panel).
insert into public.bitajon_admins (registry, address, label) values
  ('CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2', 'GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5', 'Andrés (deployer)')
on conflict do nothing;
