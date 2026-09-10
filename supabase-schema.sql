-- Mazot Takip - Supabase veritabanı kurulumu
-- Bu dosyanın tamamını Supabase panelinde "SQL Editor" a yapıştırıp "Run" a bas.

create extension if not exists "pgcrypto";

create table if not exists employees (
  name text primary key
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  type text,
  brand text,
  model text,
  start_km numeric
);

create table if not exists fillups (
  id uuid primary key default gen_random_uuid(),
  employee text,
  vehicle_id uuid references vehicles(id) on delete set null,
  km numeric not null,
  liter numeric not null,
  created_at timestamptz default now()
);

create table if not exists settings (
  id int primary key default 1,
  tank_level numeric default 1450,
  tank_capacity numeric default 3000,
  admin_pin text default '0000'
);

-- Bu basit iç sistemde giriş/şifre olmadığı için tablo erişimini
-- (RLS) kapatıyoruz. Bağlantı adresini sadece şirket içi paylaşırsanız yeterli.
alter table employees disable row level security;
alter table vehicles disable row level security;
alter table fillups disable row level security;
alter table settings disable row level security;

-- Başlangıç verileri
insert into settings (id, tank_level, tank_capacity, admin_pin)
values (1, 1450, 3000, '0000')
on conflict (id) do nothing;

insert into employees (name) values
  ('Mehmet Yılmaz'), ('Ali Demir'), ('Hasan Kaya'), ('Ahmet Şahin')
on conflict (name) do nothing;

insert into vehicles (plate, type, brand, model, start_km) values
  ('34 ABC 123', 'Mikser', 'Mercedes', 'Actros', 12000),
  ('34 DEF 456', 'Kepçe', 'Caterpillar', '320D', 3000),
  ('34 GHI 789', 'Damper', 'Ford', 'Cargo', 8500)
on conflict do nothing;
