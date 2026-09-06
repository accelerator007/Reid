-- Owner decision: Gemini is the primary runtime for all classifications until
-- ai-lap returns. Ollama is deliberately preserved as the preferred private
-- provider and remains disabled; no provider row or local configuration is
-- deleted by this migration.
update public.llm_providers
set max_classification = 'restricted',
    enabled = true,
    notes = coalesce(notes, '') || ' Owner approved Gemini as the full temporary runtime on 2026-09-05; sensitive context may leave Reid infrastructure.'
where id = 'gemini';

update public.agents
set provider_id = 'gemini', enabled = true, status = 'idle', disabled_reason = null,
    configuration = configuration || jsonb_build_object(
      'runtime_mode', 'gemini_primary',
      'ollama_fallback_preserved', true,
      'owner_approved_at', now()
    ), updated_at = now();

-- Durable memory remains scoped even though its embedding/runtime provider is
-- temporarily external. Browser access follows the same RBAC/RLS boundaries.
create policy memories_owner_admin_read on public.memories for select to authenticated
using (
  public.is_admin()
  or (scope = 'user' and scope_id = auth.uid()::text)
  or (scope = 'project' and exists (
    select 1 from public.project_members member
    where member.project_id::text = memories.scope_id and member.user_id = auth.uid()
  ))
  or (scope = 'department' and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.department_id::text = memories.scope_id
  ))
);

create policy memories_owner_admin_write on public.memories for all to authenticated
using (public.has_role('owner') or public.has_role('super_admin'))
with check (public.has_role('owner') or public.has_role('super_admin'));

create index if not exists memories_scope_recent on public.memories(scope, scope_id, created_at desc);
