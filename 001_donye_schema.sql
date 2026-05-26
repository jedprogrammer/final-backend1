-- migrations/001_donye_schema.sql
-- Paste this into your Supabase SQL editor.
-- Tables match the exact field names from the Flutter freezed models.

create extension if not exists "uuid-ossp";

-- ── riders ────────────────────────────────────────────────────────────────
-- Mirrors RiderModel: id, email, full_name, phone_number, avatar_url,
--                     assigned_bike_id, created_at, is_active
create table if not exists public.riders (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  full_name        text not null,
  phone_number     text not null,
  avatar_url       text,
  assigned_bike_id uuid,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.riders enable row level security;
create policy "Riders: own row only"
  on public.riders using (auth.uid() = id);

-- ── bikes ─────────────────────────────────────────────────────────────────
-- Mirrors BikeModel: id, serial_number, model, registration_number,
--                    battery_capacity_kwh, last_service_date, status
create table if not exists public.bikes (
  id                    uuid primary key default uuid_generate_v4(),
  serial_number         text not null unique,
  model                 text not null,
  registration_number   text not null unique,
  battery_capacity_kwh  numeric(6,2) not null default 0,
  last_service_date     date not null,
  status                text not null default 'active'
                        check (status in ('active','maintenance','inactive')),
  created_at            timestamptz not null default now()
);

alter table public.bikes enable row level security;
-- Riders can read any bike (they need to see their assigned bike's details)
create policy "Bikes: authenticated riders can read"
  on public.bikes for select using (auth.role() = 'authenticated');

-- ── telemetry_logs ────────────────────────────────────────────────────────
-- Mirrors TelemetryPayloadModel: bike_id, battery_percentage, voltage_v,
--   current_a, speed_kmh, temperature_celsius, odometer, motor_rpm, status, timestamp
create table if not exists public.telemetry_logs (
  id                   bigserial primary key,
  bike_id              uuid not null references public.bikes(id) on delete cascade,
  battery_percentage   numeric(5,2) not null,
  voltage_v            numeric(6,3) not null,
  current_a            numeric(6,3) not null,
  speed_kmh            numeric(6,2) not null,
  temperature_celsius  numeric(5,2) not null,
  odometer             numeric(10,3) not null default 0,
  motor_rpm            integer not null,
  status               text not null default 'normal'
                       check (status in ('normal','warning','critical')),
  timestamp            timestamptz not null default now()
);

alter table public.telemetry_logs enable row level security;
create policy "Telemetry: riders see their bike's data"
  on public.telemetry_logs for select
  using (
    bike_id in (
      select assigned_bike_id from public.riders where id = auth.uid()
    )
  );
create policy "Telemetry: service role can insert"
  on public.telemetry_logs for insert with check (true);

create index idx_telemetry_bike_ts on public.telemetry_logs(bike_id, timestamp desc);

-- ── alerts ────────────────────────────────────────────────────────────────
-- Mirrors AlertModel: id, bike_id, severity, type, title, message,
--                     is_read, is_resolved, created_at
create table if not exists public.alerts (
  id           uuid primary key default uuid_generate_v4(),
  bike_id      uuid not null references public.bikes(id) on delete cascade,
  severity     text not null check (severity in ('info','warning','critical')),
  type         text not null check (type in ('battery_low','overheat','geofence','tamper','fault')),
  title        text not null,
  message      text not null,
  is_read      boolean not null default false,
  is_resolved  boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.alerts enable row level security;
create policy "Alerts: riders see their bike's alerts"
  on public.alerts
  using (
    bike_id in (
      select assigned_bike_id from public.riders where id = auth.uid()
    )
  );

create index idx_alerts_bike_unresolved on public.alerts(bike_id, is_resolved);

-- ── diagnostics ───────────────────────────────────────────────────────────
-- Mirrors DiagnosticModel: id, bike_id, health_score,
--                          last_diagnostic_at, maintenance_status
create table if not exists public.diagnostics (
  id                  uuid primary key default uuid_generate_v4(),
  bike_id             uuid not null references public.bikes(id) on delete cascade,
  health_score        integer not null check (health_score between 0 and 100),
  maintenance_status  text not null default 'ok'
                      check (maintenance_status in ('ok','due_soon','overdue')),
  last_diagnostic_at  timestamptz not null default now()
);

alter table public.diagnostics enable row level security;
create policy "Diagnostics: riders see their bike's data"
  on public.diagnostics for select
  using (
    bike_id in (
      select assigned_bike_id from public.riders where id = auth.uid()
    )
  );

-- ── fault_codes ───────────────────────────────────────────────────────────
-- Mirrors FaultCodeModel: code, description, severity, detected_at, is_active
create table if not exists public.fault_codes (
  id             uuid primary key default uuid_generate_v4(),
  diagnostic_id  uuid not null references public.diagnostics(id) on delete cascade,
  bike_id        uuid not null references public.bikes(id) on delete cascade,
  code           text not null,
  description    text not null,
  severity       text not null check (severity in ('minor','major','critical')),
  detected_at    timestamptz not null default now(),
  is_active      boolean not null default true
);

alter table public.fault_codes enable row level security;
create policy "FaultCodes: riders see their bike's codes"
  on public.fault_codes for select
  using (
    bike_id in (
      select assigned_bike_id from public.riders where id = auth.uid()
    )
  );

create index idx_fault_codes_diagnostic on public.fault_codes(diagnostic_id);

-- ── maintenance_logs ──────────────────────────────────────────────────────
-- Mirrors MaintenanceLogModel: id, bike_id, description,
--                              performed_at, next_due_at, technician
create table if not exists public.maintenance_logs (
  id           uuid primary key default uuid_generate_v4(),
  bike_id      uuid not null references public.bikes(id) on delete cascade,
  description  text not null,
  performed_at timestamptz not null,
  next_due_at  timestamptz,
  technician   text,
  created_at   timestamptz not null default now()
);

alter table public.maintenance_logs enable row level security;
create policy "MaintenanceLogs: riders see their bike's logs"
  on public.maintenance_logs for select
  using (
    bike_id in (
      select assigned_bike_id from public.riders where id = auth.uid()
    )
  );

-- ── ride_locations ────────────────────────────────────────────────────────
-- Mirrors LocationPayloadModel: bike_id, latitude, longitude,
--   heading_degrees, speed_kmh, accuracy_m, timestamp
create table if not exists public.ride_locations (
  id               bigserial primary key,
  bike_id          uuid not null references public.bikes(id) on delete cascade,
  latitude         double precision not null,
  longitude        double precision not null,
  heading_degrees  numeric(6,2) not null default 0,
  speed_kmh        numeric(6,2) not null default 0,
  accuracy_m       numeric(6,2) not null default 0,
  timestamp        timestamptz not null default now()
);

alter table public.ride_locations enable row level security;
create policy "RideLocations: riders see their bike's locations"
  on public.ride_locations for select
  using (
    bike_id in (
      select assigned_bike_id from public.riders where id = auth.uid()
    )
  );
create policy "RideLocations: service role can insert"
  on public.ride_locations for insert with check (true);

create index idx_ride_locations_bike_ts on public.ride_locations(bike_id, timestamp asc);

-- ── ride_sessions ─────────────────────────────────────────────────────────
-- Mirrors RideSessionModel: id, rider_id, bike_id, start_time, end_time,
--   distance_km, avg_speed_kmh, max_speed_kmh, energy_consumed_kwh, avg_battery_drain
create table if not exists public.ride_sessions (
  id                   uuid primary key default uuid_generate_v4(),
  rider_id             uuid not null references public.riders(id) on delete cascade,
  bike_id              uuid not null references public.bikes(id) on delete cascade,
  start_time           timestamptz not null,
  end_time             timestamptz,
  distance_km          numeric(10,3) not null default 0,
  avg_speed_kmh        numeric(6,2) not null default 0,
  max_speed_kmh        numeric(6,2) not null default 0,
  energy_consumed_kwh  numeric(8,4) not null default 0,
  avg_battery_drain    numeric(6,3) not null default 0,
  created_at           timestamptz not null default now()
);

alter table public.ride_sessions enable row level security;
create policy "RideSessions: own rows only"
  on public.ride_sessions using (auth.uid() = rider_id);

create index idx_ride_sessions_rider_time on public.ride_sessions(rider_id, start_time desc);

-- ── bike_commands ─────────────────────────────────────────────────────────
-- Mirrors BikeCommandModel: bike_id, type, payload, issued_at, status
create table if not exists public.bike_commands (
  id         uuid primary key default uuid_generate_v4(),
  bike_id    uuid not null references public.bikes(id) on delete cascade,
  rider_id   uuid not null references public.riders(id) on delete cascade,
  type       text not null
             check (type in ('lock','unlock','disable','enable','honk','lights_on','lights_off')),
  payload    text,
  issued_at  timestamptz not null default now(),
  status     text not null default 'sent'
             check (status in ('pending','sent','acknowledged','failed'))
);

alter table public.bike_commands enable row level security;
create policy "BikeCommands: own rows only"
  on public.bike_commands using (auth.uid() = rider_id);

create index idx_bike_commands_bike on public.bike_commands(bike_id, issued_at desc);

-- ── Supabase Realtime publications ───────────────────────────────────────
-- These make Flutter's .stream() and Supabase Realtime listeners work.
-- Run in Supabase dashboard: Database → Replication → enable for these tables.
-- Or uncomment:
-- alter publication supabase_realtime add table public.alerts;
-- alter publication supabase_realtime add table public.telemetry_logs;
-- alter publication supabase_realtime add table public.ride_locations;
