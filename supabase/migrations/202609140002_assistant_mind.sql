begin;

-- Conversation memory and the assistant's read of the person it is talking to.
-- style_profile and memory_enabled already existed and were selected on every
-- message, but nothing reached the prompt; these columns are what the reply
-- path actually consumes.
alter table public.qr_conversations
  add column if not exists summary text not null default '' check (length(summary) <= 4000),
  add column if not exists summary_at timestamptz,
  add column if not exists summary_count integer not null default 0 check (summary_count >= 0),
  add column if not exists message_count integer not null default 0 check (message_count >= 0),
  add column if not exists mood text not null default 'محايد'
    check (mood in ('محايد','ودّي','مستعجل','محبط','مبسوط','جاد')),
  add column if not exists rapport smallint not null default 0 check (rapport between 0 and 100),
  add column if not exists recent_openers text[] not null default '{}'
    check (array_length(recent_openers, 1) is null or array_length(recent_openers, 1) <= 8);

-- Counting rows on every turn would cost a scan per message. The counter is
-- maintained where the row is written, so the summary cadence stays exact even
-- when a delivery is retried.
create or replace function public.bump_qr_conversation_messages()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.qr_conversations
     set message_count = message_count + 1
   where id = new.conversation_id;
  return new;
end $$;

revoke all on function public.bump_qr_conversation_messages() from public, anon, authenticated;

drop trigger if exists qr_messages_count on public.qr_messages;
create trigger qr_messages_count after insert on public.qr_messages
  for each row execute function public.bump_qr_conversation_messages();

update public.qr_conversations conversation
   set message_count = coalesce((select count(*) from public.qr_messages message where message.conversation_id = conversation.id), 0)
 where message_count = 0;

comment on column public.qr_conversations.summary is
  'Rolling factual summary of the thread, refreshed on a message cadence so long threads keep context without resending them.';
comment on column public.qr_conversations.mood is
  'Last read of the conversation tone. An operational signal for how to answer, never a judgement stored about a person.';
comment on column public.qr_conversations.recent_openers is
  'Fingerprints of the last few opening lines, used to stop the assistant repeating the same greeting.';

commit;
