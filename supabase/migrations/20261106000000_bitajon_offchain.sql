-- BITAJÓN: información fuera de la cadena (imágenes, redes, evidencia, RUT).
-- La escritura solo la hace la Edge Function "bitajon" (service role) después de verificar
-- la firma de la wallet y la autoridad on-chain. El público (anon) solo puede leer.
create table if not exists public.bitajon_nonprofit_meta (
  registry text not null, address text not null,
  display_name text, description text, website text, instagram text, facebook text, tiktok text, x text, whatsapp text,
  logo_path text, updated_at timestamptz not null default now(),
  primary key (registry, address)
);
create table if not exists public.bitajon_nonprofit_private (
  registry text not null, address text not null, rut_path text not null, rut_sha256 text not null,
  updated_at timestamptz not null default now(), primary key (registry, address)
);
create table if not exists public.bitajon_campaign_meta (
  registry text not null, campaign_id bigint not null, cover_path text, gallery jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(), primary key (registry, campaign_id)
);
create table if not exists public.bitajon_evidence (
  registry text not null, campaign_id bigint not null, manifest_sha256 text not null,
  manifest jsonb not null, manifest_text text, created_at timestamptz not null default now(),
  primary key (registry, campaign_id, manifest_sha256)
);
alter table public.bitajon_nonprofit_meta enable row level security;
alter table public.bitajon_nonprofit_private enable row level security;  -- sin políticas: privada
alter table public.bitajon_campaign_meta enable row level security;
alter table public.bitajon_evidence enable row level security;
create policy "bitajon lectura publica" on public.bitajon_nonprofit_meta for select to anon, authenticated using (true);
create policy "bitajon lectura publica" on public.bitajon_campaign_meta for select to anon, authenticated using (true);
create policy "bitajon lectura publica" on public.bitajon_evidence for select to anon, authenticated using (true);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bitajon-media', 'bitajon-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('bitajon-evidence', 'bitajon-evidence', true, 10485760, array['image/jpeg','image/png','image/webp','application/pdf','application/json']),
  ('bitajon-rut', 'bitajon-rut', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
