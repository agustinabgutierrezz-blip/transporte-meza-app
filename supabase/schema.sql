-- =========================================================
-- ESQUEMA: Transporte Meza - Control de Flota
-- Pegá todo este archivo en Supabase > SQL Editor > Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- VEHÍCULOS ----------
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  patente text not null,
  marca text,
  modelo text,
  anio int,
  km numeric default 0,
  created_at timestamptz default now()
);

create table if not exists vehicle_docs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  owner uuid not null default auth.uid(),
  key text not null, -- 'seguro' | 'titulo'
  vencimiento date,
  file_path text,
  file_name text,
  updated_at timestamptz default now(),
  unique(vehicle_id, key)
);

create table if not exists vehicle_payments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  owner uuid not null default auth.uid(),
  fecha date,
  tipo text, -- 'Seguro' | 'Satelital' | 'Otro'
  monto numeric,
  file_path text,
  file_name text,
  created_at timestamptz default now()
);

create table if not exists vehicle_cubiertas (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  owner uuid not null default auth.uid(),
  fecha date,
  km numeric,
  posicion text,
  notas text,
  created_at timestamptz default now()
);

create table if not exists vehicle_mantenimientos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  owner uuid not null default auth.uid(),
  fecha date,
  km numeric,
  tipo text,
  costo numeric,
  taller text,
  notas text,
  created_at timestamptz default now()
);

-- ---------- CHOFERES ----------
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  nombre text not null,
  dni text,
  created_at timestamptz default now()
);

create table if not exists driver_docs (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  owner uuid not null default auth.uid(),
  key text not null, -- 'licencia' | 'cedula' | 'manipulacion' | 'seguroVida' | 'art' | 'cargasPeligrosas'
  vencimiento date,
  file_path text,
  file_name text,
  updated_at timestamptz default now(),
  unique(driver_id, key)
);

-- ---------- VIAJES ----------
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  fecha date,
  vehicle_id uuid references vehicles(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  origen text,
  destino text,
  km numeric,
  notas text,
  created_at timestamptz default now()
);

-- ---------- COMBUSTIBLE ----------
create table if not exists fuel (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  fecha date,
  vehicle_id uuid references vehicles(id) on delete set null,
  estacion text,
  litros numeric,
  precio_litro numeric,
  total numeric,
  created_at timestamptz default now()
);

-- ---------- FACTURACIÓN ----------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  fecha date,
  monto numeric,
  descripcion text,
  file_path text,
  file_name text,
  created_at timestamptz default now()
);

create table if not exists settings (
  owner uuid primary key default auth.uid(),
  precio_combustible numeric,
  condicion_fiscal text default 'RI', -- 'RI' | 'MONO'
  alicuota_iva numeric default 21,
  afip_alta_path text,
  afip_alta_name text,
  iibb_path text,
  iibb_name text
);

-- =========================================================
-- ROW LEVEL SECURITY: cada usuario autenticado solo ve/edita
-- sus propias filas (owner = auth.uid())
-- =========================================================
alter table vehicles enable row level security;
alter table vehicle_docs enable row level security;
alter table vehicle_payments enable row level security;
alter table vehicle_cubiertas enable row level security;
alter table vehicle_mantenimientos enable row level security;
alter table drivers enable row level security;
alter table driver_docs enable row level security;
alter table trips enable row level security;
alter table fuel enable row level security;
alter table invoices enable row level security;
alter table settings enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'vehicles','vehicle_docs','vehicle_payments','vehicle_cubiertas','vehicle_mantenimientos',
    'drivers','driver_docs','trips','fuel','invoices','settings'
  ])
  loop
    execute format('
      create policy "owner_all_%1$s" on %1$s
      for all
      using (owner = auth.uid())
      with check (owner = auth.uid());
    ', t);
  end loop;
end $$;

-- =========================================================
-- STORAGE: bucket privado para fotos/PDF de documentos
-- Creá el bucket "docs" manualmente en Supabase > Storage
-- (Private, no público) y después corré esto:
-- =========================================================
insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;

create policy "owner_read_docs" on storage.objects
for select using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner_write_docs" on storage.objects
for insert with check (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner_update_docs" on storage.objects
for update using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner_delete_docs" on storage.objects
for delete using (bucket_id = 'docs' and (storage.foldername(name))[1] = auth.uid()::text);
