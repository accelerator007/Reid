begin;

-- Each linked administrator can turn Reid's voice notes off without disabling
-- text replies, memory, or the rest of the WhatsApp assistant.
alter table public.whatsapp_admin_profiles
  add column if not exists voice_enabled boolean not null default true;

-- A voice note uses the same private, short-lived storage path as generated
-- files. The service removes it immediately after WhatsApp accepts the send.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','image/webp',
  'audio/ogg','audio/opus'
]
where id='assistant-files';

alter table public.qr_outbox drop constraint if exists qr_outbox_message_type_check;
alter table public.qr_outbox drop constraint if exists qr_outbox_media_shape;
alter table public.qr_outbox
  add constraint qr_outbox_message_type_check check (message_type in ('text','document','image','audio')),
  add constraint qr_outbox_media_shape check (
    (message_type='text' and media_bucket is null and media_path is null and media_mime is null and media_filename is null)
    or (message_type in ('document','image','audio') and media_bucket='assistant-files' and media_path is not null and media_mime is not null and media_filename is not null)
  );

comment on column public.whatsapp_admin_profiles.voice_enabled is
  'Allows explicit voice-note requests for this linked administrator; text fallback remains available.';

commit;
