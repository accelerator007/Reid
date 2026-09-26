import importlib.util
import os
import unittest

os.environ.setdefault("REID_ORIGIN_TOKEN", "x" * 32)
spec = importlib.util.spec_from_file_location("adapter", os.path.join(os.path.dirname(__file__), "reid_ollama_adapter.py"))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterContract(unittest.TestCase):
    def test_loopback_only(self):
        self.assertEqual(adapter.HOST, "127.0.0.1")

    def test_models_are_fixed(self):
        self.assertEqual(adapter.CHAT_MODEL, "gemma4:12b")
        self.assertEqual(adapter.EMBED_MODEL, "nomic-embed-text:latest")

    def test_bounded_body(self):
        self.assertEqual(adapter.MAX_BODY, 24 * 1024 * 1024)

    def test_caller_without_a_profile_keeps_the_previous_decoding(self):
        name, options = adapter.chat_options({})
        self.assertEqual(name, "strict")
        self.assertEqual(options["temperature"], 0.15)
        self.assertEqual(options["num_ctx"], 16384)

    def test_conversation_profile_is_not_deterministic(self):
        _, options = adapter.chat_options({"profile": "chat"})
        self.assertGreater(options["temperature"], 0.5)
        self.assertGreater(options["repeat_penalty"], 1.1)

    def test_extraction_profile_stays_deterministic(self):
        _, options = adapter.chat_options({"profile": "intent"})
        self.assertLessEqual(options["temperature"], 0.15)

    def test_unknown_profile_falls_back_instead_of_failing(self):
        name, options = adapter.chat_options({"profile": "../../etc/passwd"})
        self.assertEqual(name, "strict")
        self.assertEqual(options["temperature"], 0.15)

    def test_caller_options_are_clamped(self):
        _, options = adapter.chat_options({"options": {"temperature": 99, "top_p": -5, "repeat_penalty": 0.1, "num_predict": 10 ** 9}})
        self.assertEqual(options["temperature"], 1.2)
        self.assertEqual(options["top_p"], 0.1)
        self.assertEqual(options["repeat_penalty"], 1.0)
        self.assertEqual(options["num_predict"], 4096)

    def test_caller_options_reject_non_numeric_and_boolean_values(self):
        _, options = adapter.chat_options({"options": {"temperature": "hot", "num_predict": True, "top_p": None}})
        self.assertEqual(options["temperature"], 0.15)
        self.assertEqual(options["num_predict"], 3072)

    def test_callers_cannot_reach_unlisted_options(self):
        _, options = adapter.chat_options({"options": {"num_ctx": 1, "seed": 7, "stop": ["x"], "mirostat": 2}})
        self.assertEqual(options["num_ctx"], 16384)
        self.assertNotIn("seed", options)
        self.assertNotIn("stop", options)
        self.assertNotIn("mirostat", options)


if __name__ == "__main__":
    unittest.main()
