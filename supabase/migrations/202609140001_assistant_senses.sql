begin;

-- Voice notes and photos were dropped silently by the QR service even though
-- the local adapter already exposes transcription. Record what kind of message
-- a stored row came from so the inbox shows a transcript for what it is.
alter table public.qr_messages
  add column if not exists media_kind text
  check (media_kind is null or media_kind in ('audio','image'));

-- A reply that quotes the message it answers is how a person replies in a busy
-- thread. The sender needs the original WhatsApp id at send time.
alter table public.qr_outbox
  add column if not exists reply_to_message_id text
  check (reply_to_message_id is null or length(reply_to_message_id) between 1 and 128);

comment on column public.qr_messages.media_kind is
  'Source medium of an inbound row: audio transcribed locally, image described locally, null for text.';
comment on column public.qr_outbox.reply_to_message_id is
  'WhatsApp id of the inbound message this row answers, used to send a quoted reply.';

commit;
