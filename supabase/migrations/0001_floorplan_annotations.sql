-- Rectangles drawn over a floorplan: content to ignore, and text to capture.
-- Geometry is stored as fractions of the page so it survives any zoom level or
-- render width the viewer happens to use.

create table if not exists public.floorplan_annotations (
  -- Minted by the browser so a mark can be removed before the insert lands.
  id uuid primary key,
  -- Object path inside the storage bucket, e.g. `level-1/east-wing.pdf`.
  object_path text not null,
  page integer not null check (page >= 1),
  kind text not null check (kind in ('ignore', 'capture')),
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  w double precision not null check (w > 0 and w <= 1),
  h double precision not null check (h > 0 and h <= 1),
  created_at timestamptz not null default now()
);

-- Every read is "all marks on this plan", ordered by page.
create index if not exists floorplan_annotations_object_path_idx
  on public.floorplan_annotations (object_path, page, created_at);

alter table public.floorplan_annotations enable row level security;

-- The service role key bypasses RLS. Only needed if the app falls back to
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, which reaches the table as `anon`.
--
-- create policy "anon manages floorplan annotations"
--   on public.floorplan_annotations for all
--   to anon using (true) with check (true);
