import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const privileged = new Set(['owner', 'super_admin']);
const validRoles = new Set(['owner', 'super_admin', 'admin', 'hr', 'sales', 'employee', 'project_member', 'research_member', 'guest']);
const validStatuses = new Set(['active', 'suspended', 'disabled']);

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
    const { data: roleRows, error: roleError } = await caller.from('user_roles').select('role').eq('user_id', auth.user.id);
    const { data: callerControl, error: controlError } = await caller.from('account_controls').select('status').eq('user_id', auth.user.id).single();
    if (roleError || controlError || callerControl?.status !== 'active' || !roleRows?.some(({ role }) => privileged.has(role))) throw new Error('not_authorized');

    const { action, targetUserId, role, enabled, status, reason } = await request.json();
    if (!targetUserId || targetUserId === auth.user.id) throw new Error('cannot_modify_self');
    const { data: targetRoles, error: targetRoleError } = await admin.from('user_roles').select('role').eq('user_id', targetUserId);
    if (targetRoleError) throw targetRoleError;
    const targetIsOwner = targetRoles?.some(({ role: targetRole }) => targetRole === 'owner');
    const callerIsOwner = roleRows.some(({ role: callerRole }) => callerRole === 'owner');

    if (action === 'set_status') {
      if (!validStatuses.has(status)) throw new Error('invalid_status');
      if (targetIsOwner) throw new Error('owner_account_protected');
      const banDuration = status === 'active' ? 'none' : '876000h';
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: banDuration });
      if (authUpdateError) throw authUpdateError;
      const { error } = await admin.from('account_controls').upsert({ user_id: targetUserId, status, reason: reason?.trim() || null, changed_by: auth.user.id, changed_at: new Date().toISOString() });
      if (error) throw error;
    } else if (action === 'set_role') {
      if (!validRoles.has(role)) throw new Error('invalid_role');
      if (role === 'owner' && !callerIsOwner) throw new Error('owner_role_requires_owner');
      if (enabled) {
        const { error } = await admin.from('user_roles').upsert({ user_id: targetUserId, role, granted_by: auth.user.id });
        if (error) throw error;
      } else {
        if (role === 'owner') throw new Error('owner_role_removal_blocked');
        const { error } = await admin.from('user_roles').delete().eq('user_id', targetUserId).eq('role', role);
        if (error) throw error;
      }
    } else throw new Error('invalid_action');

    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'unknown_error' }, { status: 400, headers: cors });
  }
});
