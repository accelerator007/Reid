-- Temporary prototype mode while the private ai-lap/Ollama host is offline.
-- The gateway remains prompt-only: no HR, finance, CRM, storage, payment, or
-- deletion tool is connected. Prompts are public test data and L2/L3 approval
-- levels remain in force.
update public.agents
set provider_id = 'gemini',
    classification = 'public',
    enabled = true,
    status = 'idle',
    disabled_reason = null,
    configuration = configuration || jsonb_build_object(
      'prototype_mode', true,
      'public_prompts_only', true,
      'business_tools_connected', false,
      'activated_at', now()
    ),
    updated_at = now();

-- Never raise this ceiling for prototype convenience: it is the storage-layer
-- guarantee that company data cannot be dispatched to the external provider.
update public.llm_providers
set max_classification = 'public',
    notes = coalesce(notes, '') || ' Prototype mode: all agents accept public test prompts only; no business tools are connected.'
where id = 'gemini';
