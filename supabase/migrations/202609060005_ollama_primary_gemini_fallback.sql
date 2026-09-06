-- Owner decision: every governed Reid agent uses ai-lap/gemma4:12b first.
-- Gemini remains enabled only as the automatic availability fallback.
update public.llm_providers set
  chat_model='gemma4:12b', embedding_model='nomic-embed-text:latest', enabled=true,
  max_classification='restricted', retains_data=false,
  notes='Primary Reid runtime on ai-lap; Gemini is availability fallback only.', updated_at=now()
where id='ollama';

update public.llm_providers set enabled=true,
  notes='Fallback only when ai-lap heartbeat is stale or a local generation fails.', updated_at=now()
where id='gemini';

update public.agents set
  provider_id='ollama', model='gemma4:12b', host='ai-lap', enabled=true,
  status=case when status='disabled' then 'idle' else status end, disabled_reason=null,
  configuration=configuration || jsonb_build_object(
    'runtime_mode','ollama_primary_gemini_fallback','primary_provider','ollama','fallback_provider','gemini'
  ), updated_at=now();
