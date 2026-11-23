-- Run this once in a free Supabase project (SQL editor) to make Bar Vibe live.
-- Then put the project URL and anon public key into config.js.

create table if not exists public.ratings (
  id bigint generated always as identity primary key,
  bar_id text not null,
  crowd smallint not null check (crowd between 1 and 5),
  sound smallint not null check (sound between 1 and 5),
  mood text not null check (char_length(mood) <= 20),
  worth boolean not null,
  device_id text check (char_length(device_id) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists ratings_recent on public.ratings (created_at desc);

-- Readings from an in-bar sound sensor (decibels). The sensor posts here.
create table if not exists public.sensor_readings (
  id bigint generated always as identity primary key,
  bar_id text not null,
  db smallint not null check (db between 20 and 130),
  created_at timestamptz not null default now()
);
create index if not exists sensor_recent on public.sensor_readings (created_at desc);

alter table public.ratings enable row level security;
alter table public.sensor_readings enable row level security;

-- Anyone can read ratings and add one. Nobody can edit or delete through the app.
create policy "read ratings" on public.ratings for select using (true);
create policy "add ratings" on public.ratings for insert with check (created_at > now() - interval '5 minutes');

-- Anyone can read sensor readings. Only the service key (the sensor) can add them.
create policy "read sensor" on public.sensor_readings for select using (true);
