-- Founder-approved shared pilot: add exact production issuer without mapping
-- users by email or removing the development/legacy identities.
insert into private.identity_providers(issuer,provider,enabled)
values('https://clerk.arcenray.com','clerk',true)
on conflict(issuer) do update set enabled=true
where identity_providers.provider='clerk';
do $$ begin
 if not exists(select 1 from private.identity_providers where issuer='https://clerk.arcenray.com' and provider='clerk' and enabled) then
 raise exception 'Production issuer conflicts with another provider';
 end if;
end $$;
