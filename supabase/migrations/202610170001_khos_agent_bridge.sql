-- Khos is an isolated source system. These fields deliberately avoid Firebase
-- foreign keys so Reid identities and Khos identities cannot be joined.
alter table public.agent_runs
  add column if not exists source_system text not null default 'reid'
    check (source_system in ('reid', 'khos')),
  add column if not exists external_request_id text,
  add column if not exists external_requester_id text,
  add column if not exists external_role text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists external_output text;

create index if not exists agent_runs_source_recent
  on public.agent_runs(source_system, created_at desc);
create unique index if not exists agent_runs_khos_external_request
  on public.agent_runs(source_system, external_request_id)
  where source_system = 'khos' and external_request_id is not null;

comment on column public.agent_runs.source_metadata is
  'Bounded source context only. For Khos this may contain farm/trap ids and sensor metadata, never raw images or Reid data.';

insert into public.agents
  (id, name, status, model, host, approval_level, permissions, configuration,
   provider_id, classification, system_prompt, enabled, disabled_reason, updated_at)
values
 ('khos_field_monitor', 'Khos Field Monitor', 'idle', 'gemma4:12b', 'ollama', 0,
  '[]', '{"source_system":"khos","raw_images":false}', 'ollama', 'internal',
  'You are Khos Field Monitor. Analyze only the supplied Khos sensor readings and structured red-palm-weevil detections. Return strict JSON with summary, severity, evidence, recommended_actions, auto_actions, confidence, and needs_human_review. Never invent a reading or claim to see an image.', false, 'khos_agents_feature_flag_off', now()),
 ('khos_trap_health', 'Khos Trap Health', 'idle', 'gemma4:12b', 'ollama', 0,
  '[]', '{"source_system":"khos","raw_images":false}', 'ollama', 'internal',
  'You are Khos Trap Health. Detect offline traps, low batteries, stale telemetry, and anomalous readings using only supplied Khos data. Return strict JSON with the required Khos output contract and cite each finding as evidence.', false, 'khos_agents_feature_flag_off', now()),
 ('khos_reports', 'Khos Reports', 'idle', 'gemma4:12b', 'ollama', 0,
  '[]', '{"source_system":"khos","raw_images":false}', 'ollama', 'internal',
  'You are Khos Reports. Produce concise daily or weekly farm summaries from bounded Khos records only. Separate facts from recommendations and return strict JSON using the Khos output contract.', false, 'khos_agents_feature_flag_off', now()),
 ('khos_alerts', 'Khos Alerts', 'idle', 'gemma4:12b', 'ollama', 0,
  '[]', '{"source_system":"khos","raw_images":false}', 'ollama', 'internal',
  'You are Khos Alerts. Rank red-palm-weevil and device-health findings by severity. Recommend alert or maintenance records only. Never request fan control, reboot, deletion, or permission changes. Return strict JSON with evidence.', false, 'khos_agents_feature_flag_off', now())
on conflict (id) do update set
  name = excluded.name, model = excluded.model, host = excluded.host,
  provider_id = excluded.provider_id, classification = excluded.classification,
  system_prompt = excluded.system_prompt, configuration = excluded.configuration,
  approval_level = excluded.approval_level, updated_at = now();

insert into public.agent_tools(id,name_ar,name_en,description,operation,approval_level,input_schema)
values
 ('khos.alert.create','إنشاء تنبيه خوص','Create Khos alert','Create a bounded Khos alert from model evidence.','create',0,'{"required":["farmId","severity","detail"]}'),
 ('khos.maintenance.create','إنشاء سجل صيانة خوص','Create Khos maintenance','Create a bounded Khos maintenance record.','create',0,'{"required":["farmId","title","note"]}'),
 ('khos.trap.interval.update','تعديل فترة المصيدة','Update Khos trap interval','Allowed only when the Khos admin energy-saving policy is enabled.','update',1,'{"required":["trapId","value"],"minimum":900,"maximum":14400}')
on conflict (id) do update set
  name_ar=excluded.name_ar, name_en=excluded.name_en, description=excluded.description,
  operation=excluded.operation, approval_level=excluded.approval_level,
  input_schema=excluded.input_schema, updated_at=now();

insert into public.agent_tool_assignments(agent_id,tool_id)
values
 ('khos_field_monitor','khos.alert.create'),
 ('khos_trap_health','khos.alert.create'),
 ('khos_trap_health','khos.maintenance.create'),
 ('khos_trap_health','khos.trap.interval.update'),
 ('khos_reports','khos.alert.create'),
 ('khos_alerts','khos.alert.create'),
 ('khos_alerts','khos.maintenance.create')
on conflict do nothing;
