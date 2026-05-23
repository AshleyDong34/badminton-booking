insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  link_label text,
  link_url text,
  image_url text,
  image_alt text,
  image_side text not null default 'right' check (image_side in ('left', 'right')),
  expires_on date,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events
  add column if not exists image_url text,
  add column if not exists image_alt text,
  add column if not exists image_side text not null default 'right',
  add column if not exists expires_on date;

alter table public.events
  drop constraint if exists events_image_side_check;

alter table public.events
  add constraint events_image_side_check
  check (image_side in ('left', 'right'));

create index if not exists events_public_order_idx
  on public.events (is_active, sort_order, created_at desc);
