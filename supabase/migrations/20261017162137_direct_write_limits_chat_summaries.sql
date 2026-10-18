-- Pending founder review/application: raw Data API writes must share these limits.
-- Role is the database session's selected role, never JWT/user-editable metadata.
create function private.limit_direct_write() returns trigger
language plpgsql security definer set search_path='' as $$
 declare actor uuid; operation text; hourly_limit integer;
 begin
 if current_setting('role',true) in ('none','service_role') then return new; end if;
 actor:=private.current_profile_id();
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 case tg_table_name
 when 'messages' then operation:='write:messages';hourly_limit:=1000;
 when 'content_reports' then operation:='write:reports';hourly_limit:=10;
 when 'profile_follows' then operation:='write:follows';hourly_limit:=100;
 when 'film_credits' then operation:='write:credits';hourly_limit:=100;
 when 'conversations' then operation:='write:conversations';hourly_limit:=30;
 else raise exception 'Unsupported rate-limited operation';
 end case;
 -- backend_rate_limit uses an atomic INSERT ON CONFLICT increment per actor/hour.
 -- Failed inserts roll the increment back with the statement; quotas are never
 -- charged to a caller-supplied sender/reporter/credited-profile ID.
 if not public.backend_rate_limit(actor,operation,hourly_limit) then
 raise exception 'Hourly request limit reached' using errcode='54000'; end if;
 return new;
 end; $$;
revoke all on function private.limit_direct_write() from public,anon,authenticated;
create trigger messages_write_limit before insert on public.messages for each row execute function private.limit_direct_write();
create trigger reports_write_limit before insert on public.content_reports for each row execute function private.limit_direct_write();
create trigger follows_write_limit before insert on public.profile_follows for each row execute function private.limit_direct_write();
create trigger credits_write_limit before insert on public.film_credits for each row execute function private.limit_direct_write();
-- AFTER INSERT charges only a genuinely new pair. Reopening a conversation uses
-- ON CONFLICT UPDATE in open_conversation and does not consume this allowance.
create trigger conversations_write_limit after insert on public.conversations for each row execute function private.limit_direct_write();

-- One latest message for each of the caller's conversations; no global 300-row
-- window that can erase quieter conversations' activity. Every read retains RLS.
create function public.get_chat_summaries() returns setof public.messages
language sql stable security invoker set search_path='' as $$
 select latest.* from public.conversation_participants p
 cross join lateral (
 select m.* from public.messages m where m.conversation_id=p.conversation_id
 order by m.created_at desc,m.id desc limit 1
 ) latest
 where p.user_id=private.current_profile_id()
 order by latest.created_at desc,latest.id desc;
$$;
revoke all on function public.get_chat_summaries() from public,anon,authenticated;
grant execute on function public.get_chat_summaries() to authenticated,service_role;
