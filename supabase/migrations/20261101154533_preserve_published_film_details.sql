-- Text-only edits retain publication and verified delivery metadata. Changed
-- media still passes through the existing draft validation/publication boundary.
create or replace function private.guard_film_edit() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
   if old.status='published'
      and (new.source,new.provider_id,new.film_asset_id,new.hook_asset_id,new.poster_asset_id)
        is not distinct from
          (old.source,old.provider_id,old.film_asset_id,old.hook_asset_id,old.poster_asset_id) then
     new.status:=old.status;
     new.published_at:=old.published_at;
     new.film_key:=old.film_key;
     new.hook_key:=old.hook_key;
     new.poster_key:=old.poster_key;
     new.duration_seconds:=old.duration_seconds;
   else
     new.status:='draft'; new.published_at:=null;
     new.film_key:=null; new.hook_key:=null; new.poster_key:=null; new.duration_seconds:=null;
   end if;
 end if;
 return new;
end; $$;
