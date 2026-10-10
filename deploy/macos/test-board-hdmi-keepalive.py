"""Retirement contract for legacy watchdog entry points; no hardware access."""

from pathlib import Path
import subprocess
import unittest


class WatchdogTest(unittest.TestCase):
    def test_retired_entry_points(self):
        cases = [
            ("board-hdmi-keepalive.sh", 0, "legacy_watchdog_disabled"),
            ("install-board-hdmi-daemon.sh", 1, "legacy_watchdog_retired"),
        ]
        for name, status, reason in cases:
            with self.subTest(name=name):
                result = subprocess.run(
                    ["/bin/zsh", str(Path(__file__).with_name(name))],
                    env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin"},
                    capture_output=True, text=True, timeout=2,
                )
                self.assertEqual(result.returncode, status, result.stderr)
                self.assertIn(reason, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
