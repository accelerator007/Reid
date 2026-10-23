begin;

-- COR stays a normal Reid project. Give the existing record a useful overview
-- without overwriting a description the team has already written.
update public.projects
set description = 'مشروع يهدف إلى تحسين تجربة قياس العلامات الحيوية للأطفال من عمر 3 إلى 13 عامًا داخل المؤسسات الصحية. يجمع أجهزة قياس الطول والوزن ودرجة الحرارة ونبض القلب وتشبع الأكسجين مع شخصية افتراضية ثلاثية الأبعاد توجه الطفل خلال القياس، ثم ينظم النتائج في لوحة واضحة للطبيب دون تقديم تشخيص أو علاج.'
where lower(name) = 'cor' and nullif(trim(description), '') is null;

-- Preserve project work that was also linked to research. Research-only tasks
-- belong to the retired module and are intentionally removed.
delete from public.tasks where research_id is not null and project_id is null;
update public.tasks set research_id = null where research_id is not null;

drop policy if exists research_tasks_manager_insert on public.tasks;
drop policy if exists research_tasks_scope_update on public.tasks;
drop policy if exists research_tasks_manager_delete on public.tasks;
drop policy if exists task_scope_read on public.tasks;
alter table public.tasks drop column if exists research_id cascade;
create policy task_scope_read on public.tasks for select to authenticated
using (
  public.is_admin()
  or (
    public.is_account_active()
    and (
      assignee_id = auth.uid()
      or public.has_role('hr')
      or public.is_department_manager(assignee_id)
      or exists (
        select 1 from public.project_members member
        where member.project_id = tasks.project_id and member.user_id = auth.uid()
      )
    )
  )
);

-- Remove data and storage objects owned exclusively by the retired modules.
delete from storage.objects where bucket_id in ('research-files', 'form-uploads', 'form-media');
delete from storage.buckets where id in ('research-files', 'form-uploads', 'form-media');

drop table if exists public.form_responses cascade;
drop table if exists public.form_collaborators cascade;
drop table if exists public.forms cascade;

delete from public.assistant_notes where scope = 'workshop';
alter table public.assistant_notes drop constraint if exists assistant_notes_scope_check;
alter table public.assistant_notes drop constraint if exists assistant_notes_check;
alter table public.assistant_notes drop column if exists workshop_id cascade;
alter table public.assistant_notes add constraint assistant_notes_scope_check check (scope in ('personal','project'));
alter table public.assistant_notes add constraint assistant_notes_scope_target_check check (
  (scope='personal' and project_id is null) or (scope='project' and project_id is not null)
);

delete from public.agent_tool_assignments where tool_id like 'workshops.%';
delete from public.agent_tools where id like 'workshops.%';
drop table if exists public.workshop_registrations cascade;
drop table if exists public.workshops cascade;
alter table public.whatsapp_admin_profiles drop column if exists workshops_enabled;

delete from public.whatsapp_actions where kind in (
  'workshop_create','workshop_update','workshop_publish','workshop_cancel','meeting_start','meeting_end'
);
alter table public.whatsapp_actions drop constraint if exists whatsapp_actions_kind_check;
alter table public.whatsapp_actions add constraint whatsapp_actions_kind_check check (kind in (
  'send_text','send_artifact','generate_artifact','generate_image','note_delete','server_command'
));

drop table if exists public.reid_meeting_turns cascade;
drop table if exists public.reid_meetings cascade;
drop table if exists public.meeting_connections cascade;

drop table if exists public.research_document_permissions cascade;
drop table if exists public.research_documents cascade;
drop table if exists public.research_experiments cascade;
drop table if exists public.research_ethics_approvals cascade;
drop table if exists public.research_publications cascade;
drop table if exists public.research_datasets cascade;
drop table if exists public.research_activity cascade;
drop table if exists public.research_members cascade;
drop table if exists public.research cascade;

commit;
