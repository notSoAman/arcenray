-- Founder-requested product change: posters remain required; discovery hooks are optional.
-- Patch only the required-asset predicate, retaining identity, locking and grants.
do $$
declare definition text;
 old_rule text := 'if h.id is null or p.id is null or h.duration_seconds is null or h.duration_seconds>30 or h.duration_seconds<=0 then raise exception ''Verified hook and poster required''; end if;';
 new_rule text := 'if p.id is null then raise exception ''Verified poster required''; end if;
 if f.hook_asset_id is not null and (h.id is null or h.duration_seconds is null or h.duration_seconds>30 or h.duration_seconds<=0) then raise exception ''Verified hook must be ready and at most 30 seconds''; end if;';
begin
 select pg_get_functiondef('private.publish_film(uuid)'::regprocedure) into definition;
 if position(old_rule in definition)=0 then raise exception 'Publication rule changed; review migration before applying'; end if;
 execute replace(definition,old_rule,new_rule);
end $$;
