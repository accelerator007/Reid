export function createInboundPersistence({admin,check,allowedOwnerGroup,rate}) {
  return async function persistInbound(message,item) {
    let stage='authorize';
    try {
      const group=item.isGroup?await allowedOwnerGroup(item):null;
      if(item.isGroup&&!group){console.info('group_message_denied');return;}
      const senderName=String(message.pushName||item.senderPhone||'')
        .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||item.senderPhone;
      const displayName=String(group?.display_name||senderName||item.jid.split('@')[0])
        .replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120)||item.jid.split('@')[0];
      stage='conversation_read';
      let chat=await check(admin.from('qr_conversations').select('*').eq('jid',item.jid).maybeSingle());
      if(!chat){
        stage='conversation_insert';
        const inserted=await admin.from('qr_conversations').insert({jid:item.jid,display_name:displayName,bot_mode:'active'}).select('*').single();
        if(inserted.error?.code==='23505'){
          stage='conversation_race_read';
          chat=await check(admin.from('qr_conversations').select('*').eq('jid',item.jid).single());
        }else if(inserted.error)throw inserted.error;
        else chat=inserted.data;
      }
      stage='message_upsert';
      const {error}=await admin.from('qr_messages').upsert({conversation_id:chat.id,message_id:item.id,direction:'inbound',body:item.text,sender_phone:item.senderPhone,sender_name:senderName,media_kind:item.media?.kind||null},{onConflict:'message_id',ignoreDuplicates:true});
      if(error)throw error;
      if(item.isGroup){
        stage='group_participant_upsert';
        await check(admin.from('whatsapp_group_participants').upsert({
          group_jid:item.jid,sender_phone:item.senderPhone,display_name:senderName,last_seen_at:new Date().toISOString(),
        },{onConflict:'group_jid,sender_phone'}));
      }
      if(item.document){
        stage='document_upsert';
        await check(admin.from('qr_conversation_documents').upsert({
          conversation_id:chat.id,message_id:item.id,sender_phone:item.senderPhone,sender_name:senderName,
          file_name:item.document.fileName,mime_type:item.document.mimetype,byte_size:item.document.byteSize,
          extracted_text:item.document.text,text_truncated:item.document.truncated,
        },{onConflict:'message_id',ignoreDuplicates:true}));
      }
      // Every later write is idempotent. Reconcile it even if WhatsApp repeats an
      // event or an earlier attempt stopped immediately after storing the message.
      stage='conversation_update';
      await check(admin.from('qr_conversations').update({last_message:item.text.slice(0,180),updated_at:new Date().toISOString()}).eq('id',chat.id));
      stage='job_upsert';
      const limit=item.isGroup&&group?.respond_to_all?30:6;
      if(chat.bot_mode==='active'&&rate(`in:${chat.id}`,limit))await check(admin.from('qr_jobs').upsert({conversation_id:chat.id,message_id:item.id,input:item.text,sender_phone:item.senderPhone,sender_name:senderName},{onConflict:'message_id',ignoreDuplicates:true}));
    }catch(error){throw new Error(`inbound_${stage}_failed`,{cause:error});}
  };
}
