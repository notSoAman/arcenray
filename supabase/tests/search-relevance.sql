-- Deterministic public discovery fixtures. No live catalog rows are changed.
begin;
create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;
insert into auth.users(id,email) values
 ('76000000-0000-4000-8000-000000000001','search-owner-'||gen_random_uuid()||'@example.invalid'),
 ('76000000-0000-4000-8000-000000000002','search-hidden-'||gen_random_uuid()||'@example.invalid');
update public.profiles set handle='search_eliana_fixture',full_name='Eliana Testfinder',roles=array['editor','sound_designer'],location_city='Searchville',onboarding_completed=true where id='76000000-0000-4000-8000-000000000001';
update public.profiles set full_name='Hidden Testfinder',roles=array['editor'],location_city='Searchville' where id='76000000-0000-4000-8000-000000000002';
insert into public.films(id,owner_id,title,synopsis,genres,location_city,status,published_at) values
 ('76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000001','Moonlit Atlasfixture','A city mystery.',array['Crime','Drama'],'Searchville','published',now()),
 ('76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','Distant Lanternfixture','A returning traveller remembers a childhood home.',array['Drama'],'Searchville','published',now()),
 ('76000000-0000-4000-8000-000000000005','76000000-0000-4000-8000-000000000001','Private Atlasfixture','Secret unreleased film.',array['Crime'],'Searchville','draft',null);
insert into private.entity_embeddings(kind,entity_id,embedding,content_hash) values
 ('film','76000000-0000-4000-8000-000000000003',array_append(array_fill(0::real,array[383]),1::real)::extensions.vector,'fixture'),
 ('film','76000000-0000-4000-8000-000000000004',array_prepend(1::real,array_fill(0::real,array[383]))::extensions.vector,'fixture');
set local role anon;
select pg_temp.assert_true(exists(select 1 from public.hybrid_search('Atlasf','film','Searchville') where id='76000000-0000-4000-8000-000000000003'),'partial film title');
select pg_temp.assert_true(exists(select 1 from public.hybrid_search('Elia','profile','Searchville') where id='76000000-0000-4000-8000-000000000001'),'partial person name');
select pg_temp.assert_true(exists(select 1 from public.hybrid_search('@search_eliana','profile','Searchville') where id='76000000-0000-4000-8000-000000000001'),'handle with at sign');
select pg_temp.assert_true((select count(*)=1 from public.hybrid_search('','film',' searchville ',null,'crime')),'filter-only browse, case-normalized city and genre');
select pg_temp.assert_true(exists(select 1 from public.hybrid_search('','profile','Searchville','Sound Designer') where id='76000000-0000-4000-8000-000000000001'),'human-readable role filter');
select pg_temp.assert_true(exists(select 1 from public.hybrid_search('editor','profile','Searchville') where id='76000000-0000-4000-8000-000000000001'),'role keyword participates in lexical search');
select pg_temp.assert_true(not exists(select 1 from public.hybrid_search('Atlasfixture','film','Searchville',null,'Comedy')),'exact genre must constrain all result modes');
select pg_temp.assert_true(not exists(select 1 from public.hybrid_search('Atlasfixture','film','Other City')),'exact city filter');
select pg_temp.assert_true(not exists(select 1 from public.hybrid_search('%','all','Searchville')),'literal text cannot turn into wildcard search');
select pg_temp.assert_true(not exists(select 1 from public.hybrid_search('','all','Searchville') where id in ('76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000005')),'private draft and incomplete profile excluded');
select pg_temp.assert_true((select id='76000000-0000-4000-8000-000000000003' from public.hybrid_search('Moonlit Atlasfixture','film','Searchville',null,null,1,array_prepend(1::real,array_fill(0::real,array[383]))::extensions.vector)),'exact title outranks semantically closer unrelated title');
select pg_temp.assert_true((select count(*)=1 and bool_and(id='76000000-0000-4000-8000-000000000004') from public.hybrid_search('returning memories','film','Searchville',null,null,20,array_prepend(1::real,array_fill(0::real,array[383]))::extensions.vector)),'semantic-only retrieval includes relevant vector and excludes orthogonal vector');
select pg_temp.assert_true(not exists(select 1 from public.hybrid_search('returning memories','film','Searchville',null,'Crime',20,array_prepend(1::real,array_fill(0::real,array[383]))::extensions.vector)),'semantic matches cannot bypass genre filters');
rollback;
select 'Search identity, filters, semantics and privacy assertions passed; fixtures rolled back' as result;
