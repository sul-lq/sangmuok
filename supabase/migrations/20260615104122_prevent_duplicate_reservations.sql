create unique index if not exists reservations_unique_date_time_customer_idx
on public.reservations (
  reservation_date,
  reservation_time,
  lower(replace(btrim(customer_name), ' ', ''))
);
