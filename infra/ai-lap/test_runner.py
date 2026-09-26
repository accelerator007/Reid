import os
import unittest
from unittest.mock import patch

with patch.dict(os.environ, {'REID_RUNNER_URL': 'https://example.invalid',
                             'REID_RUNNER_TOKEN': 'test', 'REID_ORIGIN_TOKEN': 'test'}):
    import reid_agent_runner as runner


class RemoteTelemetryTests(unittest.TestCase):
    def test_relay_never_reports_its_own_hardware_as_remote_host(self):
        with patch.object(runner, 'REMOTE_ADAPTER', True), \
             patch('builtins.open') as local_files, \
             patch.object(runner.subprocess, 'check_output') as gpu_probe, \
             patch.object(runner.os, 'getloadavg') as cpu_probe:
            self.assertEqual(runner.telemetry(), {})
            local_files.assert_not_called()
            gpu_probe.assert_not_called()
            cpu_probe.assert_not_called()


if __name__ == '__main__':
    unittest.main()
