alter table public.reservations
  add column if not exists people_detail text;

update public.reservations
set people_detail = people_count::text
where people_detail is null
  and people_count is not null;
