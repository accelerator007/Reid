begin;

-- The function deliberately runs with an empty search_path. PostgreSQL does
-- not resolve operators from the pgvector extension schema in that mode even
-- when both operands are extensions.vector, so qualify the cosine operator
-- explicitly. Without this, every WhatsApp recall attempt degrades to recent
-- context and logs SQLSTATE 42883.
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
    select memory.content,
           memory.memory_kind,
           1 - (memory.embedding operator(extensions.<=>) wanted)
      from public.memories memory
     where memory.scope = wanted_scope
       and memory.scope_id = wanted_scope_id
       and memory.embedding is not null
       and memory.memory_kind <> 'temporary'
     order by memory.embedding operator(extensions.<=>) wanted
     limit least(greatest(coalesce(match_count, 6), 1), 20);
end $$;

revoke all on function public.match_memories(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.match_memories(text, text, text, integer) to service_role;

commit;
