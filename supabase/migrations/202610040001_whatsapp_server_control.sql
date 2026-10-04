begin;

alter table public.whatsapp_actions drop constraint if exists whatsapp_actions_kind_check;
alter table public.whatsapp_actions add constraint whatsapp_actions_kind_check check (kind in (
  'send_text','send_artifact','generate_artifact','generate_image',
  'workshop_create','workshop_update','workshop_publish','workshop_cancel',
  'note_delete','server_command'
));

comment on table public.whatsapp_actions is
  'Owner-visible execution ledger. server_command rows hold the exact approved command and bounded result; secrets are redacted by the host executor.';

commit;
