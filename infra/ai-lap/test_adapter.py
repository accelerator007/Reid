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


if __name__ == "__main__":
    unittest.main()
