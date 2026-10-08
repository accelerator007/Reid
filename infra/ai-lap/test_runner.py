import os
import unittest
from unittest.mock import MagicMock, patch

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

    def test_adapter_health_requires_a_successful_authenticated_response(self):
        response = MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        with patch.object(runner.urllib.request, 'urlopen', return_value=response) as request:
            available, latency = runner.adapter_available()
            self.assertTrue(available)
            self.assertIsInstance(latency, int)
            sent = request.call_args.args[0]
            self.assertEqual(sent.full_url, 'http://127.0.0.1:11436/health')
            self.assertEqual(sent.get_header('X-reid-origin-token'), 'test')

        with patch.object(runner.urllib.request, 'urlopen', side_effect=TimeoutError):
            self.assertEqual(runner.adapter_available(), (False, None))


if __name__ == '__main__':
    unittest.main()
