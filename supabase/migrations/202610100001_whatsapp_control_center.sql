begin;

create table public.whatsapp_assistant_settings (
  id boolean primary key default true check (id),
  assistant_enabled boolean not null default true,
  customer_auto_reply boolean not null default true,
  customer_voice_enabled boolean not null default true,
  customer_reply_mode text not null default 'text'
    check (customer_reply_mode in ('text','voice')),
  customer_tone text not null default 'natural'
    check (customer_tone in ('natural','friendly','professional')),
  customer_dialect text not null default 'omani'
    check (customer_dialect in ('omani','auto','standard')),
  response_length text not null default 'balanced'
    check (response_length in ('short','balanced','detailed')),
  custom_instructions text not null default '' check (length(custom_instructions) <= 2000),
  fallback_message text not null default 'وصلتني رسالتك، لكن ما قدرت أعالجها الآن. أعد إرسالها بعد شوي، وإذا تبي أحد من فريق ريّد يتابع معك اكتب «موظف».'
    check (length(fallback_message) between 1 and 500),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_assistant_settings(id) values (true)
on conflict (id) do nothing;

alter table public.whatsapp_assistant_settings enable row level security;
revoke all on public.whatsapp_assistant_settings from anon, authenticated;
grant select on public.whatsapp_assistant_settings to authenticated;
grant all on public.whatsapp_assistant_settings to service_role;

create policy whatsapp_assistant_settings_owner_read on public.whatsapp_assistant_settings
for select to authenticated
using (public.has_role('owner') or public.has_role('super_admin'));

comment on table public.whatsapp_assistant_settings is
  'Owner-controlled runtime behavior for the linked WhatsApp assistant. Writes go through the owner-only host API and are audit logged.';

commit;
