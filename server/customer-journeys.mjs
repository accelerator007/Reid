const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function journeyInput(id,input) {
  if(!uuid.test(id)||!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>250||!uuid.test(input.assignee_id||''))throw new Error('invalid_follow_up');
  const due=new Date(input.due_at);
  if(typeof input.due_at!=='string'||!Number.isFinite(due.getTime()))throw new Error('invalid_follow_up');
  for(const field of ['contact_id','project_id'])if(input[field]!=null&&!uuid.test(input[field]))throw new Error('invalid_follow_up');
  if(input.new_project_name!=null&&(typeof input.new_project_name!=='string'||input.new_project_name.length>200))throw new Error('invalid_project');
  if(input.project_id&&input.new_project_name?.trim())throw new Error('invalid_project');
  return {wanted_conversation:id,follow_up_title:input.title.trim(),follow_up_due:due.toISOString(),assigned_user:input.assignee_id,
    wanted_contact:input.contact_id||null,wanted_project:input.project_id||null,new_project_name:input.new_project_name?.trim()||null};
}

// Mounted after the host's Owner middleware; RPCs also authenticate the caller.
export function registerCustomerJourneys(app,{check}) {
  app.get('/api/whatsapp/journey-options',async(req,res)=>{
    const [contacts,projects,people,active,roles]=await Promise.all([
      check(req.scoped.from('crm_contacts').select('id,name,phone').order('name').limit(500)),
      check(req.scoped.from('projects').select('id,name').is('archived_at',null).order('name').limit(500)),
      check(req.scoped.from('profiles').select('id,full_name').order('full_name')),
      check(req.scoped.from('account_controls').select('user_id').eq('status','active')),
      check(req.scoped.from('user_roles').select('user_id').neq('role','guest')),
    ]);
    const eligible=new Set(active.filter(row=>roles.some(role=>role.user_id===row.user_id)).map(row=>row.user_id));
    res.json({contacts,projects,people:people.filter(person=>eligible.has(person.id))});
  });
  app.get('/api/whatsapp/conversations/:id/journey',async(req,res)=>{
    if(!uuid.test(req.params.id))return res.status(400).json({error:'invalid_follow_up'});
    res.json(await check(req.scoped.from('customer_journeys')
      .select('*,contact:crm_contacts(id,name),lead:crm_leads(id,title,stage),request:work_records(id,title,status),task:tasks(id,title,status,due_at,assignee_id),project:projects(id,name)')
      .eq('conversation_id',req.params.id).maybeSingle()));
  });
  app.post('/api/whatsapp/conversations/:id/journey',async(req,res)=>{
    let input;
    try{input=journeyInput(req.params.id,req.body);}catch(error){return res.status(400).json({error:error.message});}
    const {data,error}=await req.scoped.rpc('save_customer_journey',input);
    if(error){
      const allowed=new Set(['owner_required','invalid_follow_up','invalid_assignee','invalid_project','invalid_contact','ambiguous_contact','contact_already_linked','conversation_not_found','customer_conversation_required']);
      return res.status(error.message==='owner_required'?403:allowed.has(error.message)?400:503).json({error:allowed.has(error.message)?error.message:'service_unavailable'});
    }
    res.json(data);
  });
}
