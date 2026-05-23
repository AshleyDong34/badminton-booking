alter table public.settings
  add column if not exists club_rules_label text not null default 'Club Rules',
  add column if not exists club_rules_description text not null default 'Court Rules and Player Attitude',
  add column if not exists useful_info_label text not null default 'Useful info',
  add column if not exists useful_info_description text not null default 'Links for EUBC',
  add column if not exists court_updates_label text not null default 'Court updates',
  add column if not exists court_updates_description text not null default 'Coming soon',
  add column if not exists court_updates text not null default '';

update public.settings
set
  club_rules_label = coalesce(nullif(club_rules_label, ''), 'Club Rules'),
  club_rules_description = coalesce(
    nullif(club_rules_description, ''),
    'Court Rules and Player Attitude'
  ),
  useful_info_label = coalesce(nullif(useful_info_label, ''), 'Useful info'),
  useful_info_description = coalesce(nullif(useful_info_description, ''), 'Links for EUBC'),
  court_updates_label = coalesce(nullif(court_updates_label, ''), 'Court updates'),
  court_updates_description = coalesce(nullif(court_updates_description, ''), 'Coming soon'),
  court_updates = coalesce(court_updates, '')
where id = 1;
