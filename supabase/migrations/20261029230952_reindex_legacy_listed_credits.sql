-- Existing credits in pending/declined states are now listed. Refresh the
-- affected film/profile vectors so discovery matches the new public behavior.
do $$
declare item record;
begin
  for item in
    select distinct film_id
    from public.film_credits
    where verification_state in ('pending', 'declined')
  loop
    perform private.enqueue_index('film', item.film_id);
  end loop;

  for item in
    select distinct profile_id
    from public.film_credits
    where profile_id is not null
      and verification_state in ('pending', 'declined')
  loop
    perform private.enqueue_index('profile', item.profile_id);
  end loop;
end;
$$;
