-- A document grant must authorize the metadata lookup performed by the
-- storage.objects policy. Without this term, a role-only grantee could pass
-- can_read_research_document() but Storage hid the matching object as missing.

drop policy if exists research_documents_scope_read on public.research_documents;
create policy research_documents_scope_read on public.research_documents
for select to authenticated
using (
  public.is_admin()
  or public.is_research_member(research_id)
  or public.can_manage_research(research_id)
  or public.can_read_research_document(id)
);
