begin;

-- memories.embedding has been written after every run since the agent runtime
-- landed, and never once read: knowledge.search compares JSON substrings. The
-- vectors were pure cost. This is the retrieval side they were always missing.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector')
     and exists (select 1 from pg_opclass where opcname = 'vector_cosine_ops') then
    execute 'create index if not exists memories_embedding_cosine on public.memories using hnsw (embedding extensions.vector_cosine_ops)';
  end if;
end $$;

-- The embedding arrives as pgvector's own text form so the signature stays a
-- plain text argument that PostgREST can pass without a client-side type.
create or replace function public.match_memories(
  query_embedding text,
  wanted_scope text,
  wanted_scope_id text,
  match_count integer default 6
) returns table (content text, memory_kind text, similarity double precision)
language plpgsql security definer set search_path='' as $$
declare wanted extensions.vector;
begin
  if query_embedding is null or wanted_scope is null or wanted_scope_id is null then
    return;
  end if;
  wanted := query_embedding::extensions.vector;
  return query
    select memory.content, memory.memory_kind, 1 - (memory.embedding <=> wanted)
      from public.memories memory
     where memory.scope = wanted_scope
       and memory.scope_id = wanted_scope_id
       and memory.embedding is not null
       and memory.memory_kind <> 'temporary'
     order by memory.embedding <=> wanted
     limit least(greatest(coalesce(match_count, 6), 1), 20);
end $$;

-- The function reads a whole memory scope, so it is never reachable from a
-- browser session; the service role calls it with a scope it already resolved.
revoke all on function public.match_memories(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.match_memories(text, text, text, integer) to service_role;

-- Answer quality was measured for governed agents and never for the assistant
-- people actually talk to, because the WhatsApp path never goes through the
-- gateway. Scoring it is what makes "it got better" a number instead of a mood.
alter table public.qr_messages
  add column if not exists quality_score smallint check (quality_score is null or quality_score between 0 and 100),
  add column if not exists quality_flags text[] not null default '{}';

-- The score is computed where the request and the reply are both in hand, then
-- carried to the delivered row so the ledger keeps them together.
alter table public.qr_outbox
  add column if not exists quality_score smallint check (quality_score is null or quality_score between 0 and 100),
  add column if not exists quality_flags text[] not null default '{}';

create index if not exists qr_messages_quality on public.qr_messages(created_at desc) where quality_score is not null;

create table if not exists public.assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.qr_conversations(id) on delete cascade,
  message_id text not null,
  sender_phone text not null check (sender_phone ~ '^[1-9][0-9]{7,14}$'),
  signal text not null check (signal in ('positive','negative','correction')),
  detail text check (detail is null or length(detail) <= 2000),
  created_at timestamptz not null default now(),
  unique (message_id, sender_phone)
);
create index if not exists assistant_feedback_recent on public.assistant_feedback(created_at desc);

alter table public.assistant_feedback enable row level security;
revoke all on public.assistant_feedback from anon, authenticated;
grant select on public.assistant_feedback to authenticated;
grant all on public.assistant_feedback to service_role;
create policy assistant_feedback_owner_read on public.assistant_feedback
  for select to authenticated using (public.has_role('owner') or public.has_role('super_admin'));

comment on column public.qr_messages.quality_score is
  'Deterministic 0-100 contract score for an assistant reply. An operational signal, never a rating of a person.';
comment on table public.assistant_feedback is
  'Thumbs and written corrections from the people the assistant answers. The cheapest and most accurate signal it has.';

commit;
