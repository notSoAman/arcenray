begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values
('14000000-0000-4000-8000-000000000001','edit-a-'||gen_random_uuid()||'@example.invalid'),
('14000000-0000-4000-8000-000000000002','edit-b-'||gen_random_uuid()||'@example.invalid');
insert into private.media_assets(id,owner_id,kind,object_key,expected_bytes,content_type,status) values
('24000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','film','edit-fixture-film',100,'video/mp4','ready'),
('24000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001','poster','edit-fixture-poster',100,'image/webp','ready');
insert into public.films(id,owner_id,title,status,published_at,film_asset_id,poster_asset_id,film_key,poster_key,duration_seconds) values
('34000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001','Original','published',now(),
'24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','assets/film','assets/poster',60);
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
update public.films set title='Updated',synopsis='New details',language='Hindi' where id='34000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select status='published' and title='Updated' and film_key='assets/film' and poster_key='assets/poster' and duration_seconds=60 and published_at=now() from public.films where id='34000000-0000-4000-8000-000000000001'),'metadata edits must remain live with unchanged playback');
-- A different user cannot edit the published film.
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","sub":"14000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.films set title='Unauthorized' where id='34000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select title='Updated' from public.films where id='34000000-0000-4000-8000-000000000001'),'cross-user edit denied');
select set_config('request.jwt.claims','{"iss":"https://ropbxsnjtejfomnpdllf.supabase.co/auth/v1","sub":"14000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.films set poster_asset_id=null where id='34000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select status='draft' and film_asset_id='24000000-0000-4000-8000-000000000001' and poster_asset_id is null and film_key is null from public.films where id='34000000-0000-4000-8000-000000000001'),'poster replacement retains original film asset and requires publication');
reset role;
select pg_temp.assert_true(not exists(select 1 from private.media_processing_jobs where draft_id='34000000-0000-4000-8000-000000000001'),'metadata/poster edits never enqueue a film encode');
update public.films set status='published',film_key='assets/film',poster_asset_id='24000000-0000-4000-8000-000000000002' where id='34000000-0000-4000-8000-000000000001';
set local role authenticated;
update public.films set film_asset_id=null where id='34000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select status='draft' and film_asset_id is null and poster_asset_id='24000000-0000-4000-8000-000000000002' from public.films where id='34000000-0000-4000-8000-000000000001'),'main film replacement preserves poster');
rollback;
select 'Published metadata, selective replacement and owner authorization assertions passed' as result;
