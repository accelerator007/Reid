begin;

-- This is the exact group JID previously verified by the Reid linked-device
-- bridge. Pinning the immutable JID avoids relying on WhatsApp's mutable or
-- differently-normalized display subject.
begin;

insert into public.whatsapp_qr_groups(jid,display_name,enabled,created_by)
select '120363412585944970@g.us','Reid_Owner',true,profile.id
from public.profiles profile
where lower(profile.email)='alialajmi524@gmail.com'
on conflict (jid) do update set
  display_name=excluded.display_name,
  enabled=true,
  updated_at=now();

commit;
