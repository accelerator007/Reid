import test from 'node:test';
import assert from 'node:assert/strict';
import { customerBehavior, normalizeWhatsappSettings, validateWhatsappSettingsPatch, whatsappSettingsDefaults } from '../whatsapp-settings.mjs';

test('settings fall back to safe known values',()=>{
  const value=normalizeWhatsappSettings({customer_tone:'invented',assistant_enabled:'yes',fallback_message:''});
  assert.equal(value.customer_tone,'natural');
  assert.equal(value.assistant_enabled,true);
  assert.equal(value.fallback_message,whatsappSettingsDefaults.fallback_message);
});

test('owner patches accept only bounded supported controls',()=>{
  assert.deepEqual(validateWhatsappSettingsPatch({customer_voice_enabled:false,response_length:'short'}),{customer_voice_enabled:false,response_length:'short'});
  assert.throws(()=>validateWhatsappSettingsPatch({internal_tools:true}),/invalid_settings/);
  assert.throws(()=>validateWhatsappSettingsPatch({fallback_message:''}),/invalid_settings/);
});

test('customer behavior turns saved choices into prompt instructions',()=>{
  const text=customerBehavior({customer_tone:'professional',customer_dialect:'standard',response_length:'detailed',custom_instructions:'اذكر أوقات الدوام عند السؤال.'},'ar');
  assert.match(text,/مهني/);
  assert.match(text,/عربية واضحة/);
  assert.match(text,/خطوات/);
  assert.match(text,/أوقات الدوام/);
});
