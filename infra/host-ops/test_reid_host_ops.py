import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import reid_host_ops as host_ops


class HostOpsTests(unittest.TestCase):
    def test_risk_levels_are_explicit(self):
        self.assertEqual(host_ops.risk_for("docker ps"), "read")
        self.assertEqual(host_ops.risk_for("docker compose restart api"), "write")
        self.assertEqual(host_ops.risk_for("reboot"), "critical")

    def test_interactive_commands_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "interactive_command_not_supported"):
            host_ops.validate_command("top")

    def test_sensitive_output_is_redacted(self):
        output = host_ops.redact("api_key=super-secret-value token:another-secret-value")
        self.assertNotIn("super-secret", output)
        self.assertNotIn("another-secret", output)
        self.assertIn("[SECRET REDACTED]", output)

    def test_action_execution_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            action_id = str(uuid.uuid4())
            fake = SimpleNamespace(stdout="ok", stderr="", returncode=0)
            with patch.object(host_ops, "STATE", Path(directory) / "executed.json"), patch.object(host_ops.subprocess, "run", return_value=fake) as run:
                first = host_ops.execute(action_id, "uname -sr")
                second = host_ops.execute(action_id, "uname -sr")
            self.assertFalse(first["replayed"])
            self.assertTrue(second["replayed"])
            self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
