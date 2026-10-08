begin;

alter table public.whatsapp_admin_profiles
  add column if not exists reply_mode text not null default 'text'
  check (reply_mode in ('text','voice'));

comment on column public.whatsapp_admin_profiles.reply_mode is
  'Durable WhatsApp reply format selected by the linked person. Voice capability remains separately controlled by voice_enabled.';

commit;
