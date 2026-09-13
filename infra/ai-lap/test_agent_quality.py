import unittest

from agent_quality import assess, language, subject


class AgentQualityContract(unittest.TestCase):
    def test_arabic_grounded_answer_passes(self):
        prompt = "company_context_has_records=true\n<user_request>ما حالة المشروع؟</user_request>"
        result = assess(prompt, "المشروع نشط حسب السجل الداخلي [Reid:projects:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa]. والخطوة التالية مراجعة المهام المتأخرة.")
        self.assertTrue(result["passed"])
        self.assertEqual(result["score"], 100)

    def test_unsafe_completion_and_prompt_leak_fail(self):
        result = assess("<user_request>ارسل التقرير</user_request>", "تم إرسال التقرير، وهذه تفاصيل REID_GROUNDED_REQUEST وsystem prompt كاملة.")
        self.assertFalse(result["passed"])
        self.assertIn("unsupported_action_claim", result["flags"])
        self.assertIn("prompt_leak", result["flags"])

    def test_subject_and_language_are_stable(self):
        self.assertEqual(subject("company_context_has_records=false\n<user_request>وش الفواتير؟</user_request>"), ("وش الفواتير؟", False))
        self.assertEqual(language("رتب لي الأولويات"), "ar")
        self.assertEqual(language("Prioritize the work"), "en")

    def test_missing_evidence_is_calibrated_and_fake_citations_fail(self):
        prompt = "company_context_has_records=false\n<user_request>وش تقييم الموظف؟</user_request>"
        self.assertTrue(assess(prompt, "لا تتوفر لدي بيانات تقييم الموظف في السياق المتاح، وأحتاج سجل التقييم لتأكيد الإجابة.")["passed"])
        result = assess(prompt, "لا تتوفر البيانات [Reid:missing:employee].")
        self.assertFalse(result["passed"])
        self.assertIn("invalid_company_citation", result["flags"])


if __name__ == "__main__":
    unittest.main()
