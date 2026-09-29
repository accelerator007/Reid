// Clients data through db.ts. Row-level security limits CRM to Owner, Admin,
// HR and Sales; nothing here widens that.
import { firstError, list, run, type AppError, type Result } from '../db';
import { supabase } from '../supabase';
import type { Company, Contact, Deal, FollowUp, Lead, Report } from './model';

const db = () => {
  if (!supabase) throw new Error('supabase_unavailable');
  return supabase;
};

export type ClientsData = { companies: Company[]; contacts: Contact[]; leads: Lead[]; deals: Deal[]; followUps: FollowUp[]; reports: Report[] };

export async function loadClients(): Promise<{ data: ClientsData | null; error: AppError | null }> {
  const client = db();
  const results = await Promise.all([
    list<Company>(client.from('crm_companies').select('id,name,industry,email,phone,status,owner_id').order('created_at', { ascending: false })),
    list<Contact>(client.from('crm_contacts').select('id,name,email,phone,position,company_id,stage,owner_id').order('created_at', { ascending: false })),
    list<Lead>(client.from('crm_leads').select('id,title,stage,probability,next_follow_up_at,company_id,contact_id,owner_id').order('created_at', { ascending: false })),
    list<Deal>(client.from('crm_deals').select('id,title,stage,expected_close_date,company_id,contact_id,owner_id').order('created_at', { ascending: false })),
    list<FollowUp>(client.from('crm_activities').select('id,activity_type,subject,due_at,completed_at,created_at,company_id,contact_id,lead_id,deal_id').order('due_at', { ascending: true, nullsFirst: false }).limit(200)),
    list<Report>(client.from('executive_reports').select('id,period,period_start,period_end,metrics,generated_at,email_status').order('generated_at', { ascending: false }).limit(20)),
  ]);
  const [companies, contacts, leads, deals, followUps, reports] = results;
  const error = firstError(results);
  if (!companies.ok && !leads.ok) return { data: null, error };
  const value = <T,>(result: Result<T[]>) => (result.ok ? result.data : []);
  return {
    data: { companies: value(companies), contacts: value(contacts), leads: value(leads), deals: value(deals), followUps: value(followUps), reports: value(reports) },
    error,
  };
}

type Write = Promise<Result<unknown>>;
const write = (query: PromiseLike<{ data: unknown; error: unknown }>): Write => run(query);
const now = () => new Date().toISOString();

export const createCompany = (owner: string, fields: Record<string, string | null>) => write(db().from('crm_companies').insert({ ...fields, owner_id: owner }));
export const createContact = (owner: string, fields: Record<string, string | null>) => write(db().from('crm_contacts').insert({ ...fields, owner_id: owner }));
export const createLead = (owner: string, fields: Record<string, string | number | null>) => write(db().from('crm_leads').insert({ ...fields, owner_id: owner }));
export const createDeal = (owner: string, fields: Record<string, string | null>) => write(db().from('crm_deals').insert({ ...fields, owner_id: owner }));
export const createFollowUp = (owner: string, fields: Record<string, string | null>) => write(db().from('crm_activities').insert({ ...fields, owner_id: owner }));

export const setLeadStage = (id: string, stage: string) => write(db().from('crm_leads').update({ stage, updated_at: now() }).eq('id', id));
export const setDealStage = (id: string, stage: string) =>
  write(db().from('crm_deals').update({ stage, updated_at: now(), ...(stage === 'won' ? { closed_at: now() } : {}) }).eq('id', id));
export const completeFollowUp = (id: string, done: boolean) => write(db().from('crm_activities').update({ completed_at: done ? now() : null }).eq('id', id));

export const generateReport = (period: 'daily' | 'weekly') =>
  write(db().rpc('generate_executive_report', { requested_period: period, requested_end: now().slice(0, 10) }));
