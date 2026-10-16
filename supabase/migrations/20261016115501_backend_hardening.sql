-- Index invalidation must cover changes in credits and language, not only title/bio.
create trigger films_language_embedding_stale after update of language on public.films for each row execute function private.invalidate_embedding();
create function private.credit_changed() returns trigger language plpgsql security definer set search_path='' as $$
 declare fid uuid; pid uuid;
 begin
 fid:=case when tg_op='DELETE' then old.film_id else new.film_id end;
 pid:=case when tg_op='DELETE' then old.profile_id else new.profile_id end;
 update public.films set updated_at=now() where id=fid;
 delete from private.entity_embeddings where (kind='film' and entity_id=fid) or (kind='profile' and entity_id=pid);
 update public.profiles set updated_at=now() where id=pid;
 return null;
 end; $$;
create trigger film_credits_changed after insert or update or delete on public.film_credits for each row execute function private.credit_changed();
drop policy credits_read on public.film_credits;
create policy credits_read on public.film_credits for select to anon,authenticated using(profile_id=(select auth.uid()) or exists(select 1 from public.films f where f.id=film_id));
revoke all on function private.credit_changed() from public,anon,authenticated;
-- Explicit service-only policies make the private-table intent visible to advisors.
create policy backend_only on private.user_state to service_role using(true) with check(true);
create policy backend_only on private.media_assets to service_role using(true) with check(true);
create policy backend_only on private.entity_embeddings to service_role using(true) with check(true);
create policy backend_only on private.user_events to service_role using(true) with check(true);
create policy backend_only on private.api_usage to service_role using(true) with check(true);
