-- Completion describes the current published film, never an earlier revision.
create or replace function private.get_film_publication(p_film uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',case
   when f.status='published' then 'complete'
   when f.status='draft' and r.state in ('pending','processing','failed','cancelled')
     and r.snapshot=private.publication_snapshot(f) then r.state
   when r.film_id is not null then 'cancelled'
   else null end)
 from public.films f left join private.film_publication_requests r on r.film_id=f.id
 where f.id=p_film and f.owner_id=private.current_profile_id();
$$;

create or replace function private.cancel_changed_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='published' then
   update private.film_publication_requests set state='complete',
     lease_token=null,lease_until=null,updated_at=now()
     where film_id=new.id and state in ('pending','processing');
 elsif new.status<>'draft' or old.status is distinct from new.status
   or private.publication_snapshot(new) is distinct from private.publication_snapshot(old) then
   update private.film_publication_requests set state='cancelled',
     lease_token=null,lease_until=null,updated_at=now()
     where film_id=new.id and state<>'cancelled';
 end if;
 return new;
end; $$;

-- Repair historical acknowledgements without changing films or their uploads.
update private.film_publication_requests r
set state='cancelled',lease_token=null,lease_until=null,updated_at=now()
from public.films f where f.id=r.film_id and f.status<>'published'
  and r.state='complete';
