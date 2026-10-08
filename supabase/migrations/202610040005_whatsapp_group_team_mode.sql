begin;

alter table public.whatsapp_qr_groups
  add column if not exists respond_to_all boolean not null default false,
  add column if not exists guest_chat_enabled boolean not null default false,
  add column if not exists reply_mode text not null default 'text'
    check (reply_mode in ('text','voice'));

update public.whatsapp_qr_groups
set respond_to_all=true,
    guest_chat_enabled=true,
    updated_at=now()
where jid='120363412585944970@g.us';

comment on column public.whatsapp_qr_groups.respond_to_all is
  'When enabled, every new human message in this exact allow-listed group can queue a Reid reply without a mention.';
comment on column public.whatsapp_qr_groups.guest_chat_enabled is
  'Allows unlinked group participants to use public conversation and voice only. Account-scoped tools still require a linked active profile.';
comment on column public.whatsapp_qr_groups.reply_mode is
  'Default reply format for the group. Owner voice/text commands update this durable value.';

commit;
