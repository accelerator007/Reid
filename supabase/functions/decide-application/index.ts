import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('missing_authorization');
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: auth, error: authError } = await caller.auth.getUser();
    if (authError || !auth.user) throw new Error('invalid_session');
    const { applicationId, decision, rejectionReason } = await request.json();
    const { data: application, error } = await caller.rpc('decide_application', { application_id: applicationId, decision, rejection_reason: rejectionReason || null });
    if (error) throw error;
    if (decision === 'approved') {
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(application.email, { redirectTo: 'https://reidpro.com/profile', data: { full_name: application.full_name, linkedin_url: application.linkedin_url, github_url: application.github_url, approved_application_id: application.id } });
      if (inviteError) throw inviteError;
    }
    return Response.json({ application }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 400, headers: cors });
  }
});
