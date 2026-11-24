-- Run this once in a free Supabase project (SQL editor) to make Bar Vibe live.
-- Then put the project URL and publishable key into config.js.

create table if not exists public.ratings (
  id bigint generated always as identity primary key,
  bar_id text not null check (char_length(bar_id) <= 40),
  crowd smallint not null check (crowd between 1 and 5),
  sound smallint not null check (sound between 1 and 5),
  mood text not null check (char_length(mood) <= 20),
  music text check (music is null or char_length(music) <= 30),
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
create policy "read ratings" on public.ratings for select to anon, authenticated using (true);
create policy "add ratings" on public.ratings for insert to anon, authenticated
  with check (created_at > now() - interval '5 minutes' and created_at < now() + interval '5 minutes');

-- Anyone can read sensor readings. Only the service key (the sensor) can add them.
create policy "read sensor" on public.sensor_readings for select to anon, authenticated using (true);

grant select, insert on public.ratings to anon, authenticated;
grant select on public.sensor_readings to anon, authenticated;

-- ============================================================
-- Bar owner dashboard (dashboard.html). Run after the part above.
-- To make yourself admin, run once: insert into public.admins (email) values ('you@example.com');
-- ============================================================

-- Bar owner dashboard: bars live in the database, owners see their own bar's history,
-- admins see everything. Who is who is decided by the signed-in email.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

create table if not exists public.bars (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  area text check (char_length(area) <= 120),
  kind text check (char_length(kind) <= 60),
  emoji text check (char_length(emoji) <= 16),
  blurb text check (char_length(blurb) <= 300),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.admins (
  email text primary key check (email = lower(email) and position('@' in email) > 1)
);

create table if not exists public.bar_owners (
  bar_id text not null references public.bars(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  created_at timestamptz not null default now(),
  primary key (bar_id, email)
);
create index if not exists bar_owners_email on public.bar_owners (email);

create or replace function private.my_email() returns text
  language sql stable set search_path = ''
  as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function private.is_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.admins a where a.email = private.my_email() and a.email <> '') $$;

create or replace function private.owns_bar(b text) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.bar_owners o where o.bar_id = b and o.email = private.my_email() and o.email <> '') $$;

revoke all on function private.my_email(), private.is_admin(), private.owns_bar(text) from public;
grant execute on function private.my_email(), private.is_admin(), private.owns_bar(text) to anon, authenticated;

alter table public.bars enable row level security;
alter table public.admins enable row level security;
alter table public.bar_owners enable row level security;

-- Bars: everyone sees active bars; admins see and change all of them.
create policy "read active bars" on public.bars for select to anon, authenticated
  using (active or (select private.is_admin()));
create policy "admins add bars" on public.bars for insert to authenticated with check ((select private.is_admin()));
create policy "admins edit bars" on public.bars for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins remove bars" on public.bars for delete to authenticated using ((select private.is_admin()));
grant select on public.bars to anon, authenticated;
grant insert, update, delete on public.bars to authenticated;

-- Admins: you can only see whether you yourself are one. Nobody can add admins from the site.
create policy "see own admin row" on public.admins for select to authenticated
  using (email = (select private.my_email()));
grant select on public.admins to authenticated;

-- Bar owners: an owner sees their own links; admins manage all of them.
create policy "see own or all owners" on public.bar_owners for select to authenticated
  using (email = (select private.my_email()) or (select private.is_admin()));
create policy "admins link owners" on public.bar_owners for insert to authenticated with check ((select private.is_admin()));
create policy "admins unlink owners" on public.bar_owners for delete to authenticated using ((select private.is_admin()));
grant select, insert, delete on public.bar_owners to authenticated;

-- Ratings: the public app only needs the last few hours. History belongs to the bar's owner and admins.
drop policy if exists "read ratings" on public.ratings;
create policy "read recent ratings" on public.ratings for select to anon, authenticated
  using (created_at > now() - interval '3 hours');
create policy "owners read their bar history" on public.ratings for select to authenticated
  using ((select private.owns_bar(bar_id)) or (select private.is_admin()));
-- New ratings must be for a listed bar, and stamped with the current time.
drop policy if exists "add ratings" on public.ratings;
create policy "add ratings" on public.ratings for insert to anon, authenticated
  with check (created_at > now() - interval '5 minutes' and created_at < now() + interval '5 minutes'
    and exists (select 1 from public.bars b where b.id = bar_id and b.active));

-- Hide which phone sent a rating: readers get every column except device_id.
revoke select on public.ratings from anon, authenticated;
grant select (id, bar_id, crowd, sound, mood, music, worth, created_at) on public.ratings to anon, authenticated;
create index if not exists ratings_bar_time on public.ratings (bar_id, created_at desc);

insert into public.bars (id, name, area, kind, emoji, blurb, lat, lng, sort) values
($q$hudson-hall$q$,$q$Hudson Hall$q$,$q$364 Marin Blvd$q$,$q$Beer hall and sports bar$q$,$q$🍺$q$,$q$Big beer hall with craft brews, smoked meats and the game on.$q$,40.7212851,-74.0408437,0),
($q$legends-fc$q$,$q$Legends FC$q$,$q$130 Newark Ave$q$,$q$Sports and cocktail bar$q$,$q$⚽$q$,$q$Sports and cocktail bar with a giant LED screen behind the bar and DJs.$q$,40.7202783,-74.0431771,1),
($q$boots-and-bones$q$,$q$Boots & Bones$q$,$q$116 Newark Ave$q$,$q$Western bar and BBQ$q$,$q$🤠$q$,$q$Wild West BBQ spot with line dancing, and a club floor downstairs.$q$,40.7200335,-74.0426348,2),
($q$under-the-boot$q$,$q$Under The Boot$q$,$q$116 Newark Ave$q$,$q$Speakeasy lounge$q$,$q$🪩$q$,$q$DJ-driven lounge under Boots & Bones, Friday and Saturday nights.$q$,40.7200335,-74.0426348,3),
($q$south-house$q$,$q$South House$q$,$q$149 Newark Ave$q$,$q$Southern bar and restaurant$q$,$q$🍗$q$,$q$Huge, lively room with Southern food and a basement game room.$q$,40.720503,-74.0442017,4),
($q$the-ashford$q$,$q$The Ashford$q$,$q$145 Newark Ave$q$,$q$Bar and rooftop$q$,$q$🌆$q$,$q$High ceilings, a rooftop, and a late crowd on weekends.$q$,40.7204381,-74.0441076,5),
($q$porta$q$,$q$Porta$q$,$q$135 Newark Ave$q$,$q$Pizza bar and rooftop$q$,$q$🍕$q$,$q$Pizza downstairs, rooftop bar and dance floor on weekend nights.$q$,40.7202212,-74.0437028,6),
($q$grove-station$q$,$q$The Grove Station$q$,$q$116 Newark Ave$q$,$q$Gastropub$q$,$q$🚉$q$,$q$Coffee by day, gastropub and speakeasy by night.$q$,40.7200039,-74.0425885,7),
($q$the-archer$q$,$q$The Archer$q$,$q$176 Newark Ave$q$,$q$Cocktail bar$q$,$q$🏹$q$,$q$Dark wood, good cocktails and duck poutine.$q$,40.7213212,-74.0452384,8),
($q$oharas$q$,$q$O'Hara's Bar & Grill$q$,$q$172 1st St$q$,$q$Irish pub$q$,$q$☘️$q$,$q$Big Irish pub for sports, trivia and late-night food.$q$,40.7216698,-74.0408067,9),
($q$lucky-7$q$,$q$Lucky 7 Tavern$q$,$q$322 2nd St$q$,$q$Neighborhood bar$q$,$q$🎰$q$,$q$Dim, whiskey-heavy local with a jukebox and BBQ bites.$q$,40.7229439,-74.0473585,10),
($q$keyhole$q$,$q$The Keyhole Bar$q$,$q$242 Bay St$q$,$q$Dive bar$q$,$q$🗝️$q$,$q$Cash-only dive with karaoke, games and cheap drinks.$q$,40.72124,-74.044524,11),
($q$dullboy$q$,$q$dullboy$q$,$q$364 Grove St$q$,$q$Cocktail bar$q$,$q$🍸$q$,$q$Small cocktail bar a short walk from Grove Street.$q$,40.7213918,-74.0425412,12)
on conflict (id) do nothing;

-- ============================================================
-- "Now playing" sensor phone (see supabase/functions/now-playing)
-- ============================================================
create table if not exists public.now_playing (
  id bigint generated always as identity primary key,
  bar_id text not null check (char_length(bar_id) <= 40),
  title text not null check (char_length(title) <= 200),
  artist text check (artist is null or char_length(artist) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists now_playing_recent on public.now_playing (bar_id, created_at desc);
alter table public.now_playing enable row level security;
create policy "read now playing" on public.now_playing for select to anon, authenticated
  using (created_at > now() - interval '6 hours' or private.is_admin() or private.owns_bar(bar_id));
grant select on public.now_playing to anon, authenticated;

create table if not exists private.sensor_devices (
  code text primary key,
  bar_id text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  active boolean not null default true
);
revoke all on private.sensor_devices from anon, authenticated;

create or replace function public.create_sensor_code(p_bar text)
returns text language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.bars where id = p_bar) then raise exception 'unknown bar'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into private.sensor_devices (code, bar_id) values (c, p_bar);
  return c;
end $$;

create or replace function public.list_sensor_codes()
returns table (code text, bar_id text, created_at timestamptz, last_seen timestamptz, active boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query select d.code, d.bar_id, d.created_at, d.last_seen, d.active
    from private.sensor_devices d order by d.created_at desc;
end $$;

create or replace function public.set_sensor_active(p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  update private.sensor_devices set active = p_active where code = p_code;
end $$;

-- Used only by the edge function (service role).
create or replace function public.sensor_checkin(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare d record;
begin
  select * into d from private.sensor_devices where code = p_code for update;
  if not found or not d.active then return null; end if;
  if d.last_seen is not null and d.last_seen > now() - interval '40 seconds' then return 'too_soon'; end if;
  update private.sensor_devices set last_seen = now() where code = p_code;
  return d.bar_id;
end $$;

revoke execute on function public.create_sensor_code(text), public.list_sensor_codes(), public.set_sensor_active(text, boolean) from public, anon;
grant execute on function public.create_sensor_code(text), public.list_sensor_codes(), public.set_sensor_active(text, boolean) to authenticated;
revoke execute on function public.sensor_checkin(text) from public, anon, authenticated;
grant execute on function public.sensor_checkin(text) to service_role;
