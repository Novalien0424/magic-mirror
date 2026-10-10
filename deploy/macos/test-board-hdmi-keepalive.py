"""Exercise one watchdog iteration with fake ADB; never connects to hardware."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("board-hdmi-keepalive.sh")
HARNESS = r'''
arp() { return 0; }
sleep() { exit 0; }
adb() {
  if [[ "$1" == start-server ]]; then return 0; fi
  if [[ "$1" == devices ]]; then
    print '10.0.0.4:5555 device'
    return 0
  fi
  shift 3 # -s target shell
  if [[ "$*" == 'dumpsys power' ]]; then
    [[ "$CASE" == power_failure ]] && return 1
    [[ "$CASE" == empty_power ]] && return 0
    if [[ "$CASE" == asleep ]]; then print 'mWakefulness=Asleep'
    else print 'mWakefulness=Awake'; fi
  elif [[ "$*" == 'dumpsys activity activities' ]]; then
    [[ "$CASE" == activity_failure ]] && return 1
    [[ "$CASE" == empty_activity ]] && return 0
    local component='com.android.launcher3/.uioverrides.QuickstepLauncher'
    [[ "$CASE" == settings ]] && component='com.android.settings/.Settings'
    [[ "$CASE" == active ]] && component='com.android.rockchip.camera2/.RockchipCamera2'
    print "  mResumedActivity: ActivityRecord{123 u0 $component t1}"
  elif [[ "$1" == settings* ]]; then
    print rotation >> "$TRACE"
    [[ "$CASE" == rotation_failure ]] && return 1
  elif [[ "$1" == am ]]; then
    print launch >> "$TRACE"
    [[ "$CASE" == launch_failure ]] && return 1
    if [[ "$CASE" == launch_error ]]; then print 'Error: Activity not started'
    else print 'Status: ok'; fi
  else
    print unexpected >> "$TRACE"
    return 1
  fi
  return 0
}
source "$1"
'''


class WatchdogTest(unittest.TestCase):
    def test_decisions(self):
        cases = {
            "power_failure": ("power_query_failed", []),
            "empty_power": ("not_awake", []),
            "asleep": ("not_awake", []),
            "activity_failure": ("activity_query_failed", []),
            "empty_activity": ("no_resumed_activity", []),
            "settings": ("operator_app_in_front", []),
            "active": ("HDMI_VIEW_ACTIVE", []),
            "launcher": ("HDMI_VIEW_LAUNCHED", ["rotation", "launch"]),
            "rotation_failure": ("rotation_failed", ["rotation"]),
            "launch_failure": ("launch_failed", ["rotation", "launch"]),
            "launch_error": ("launch_failed", ["rotation", "launch"]),
        }
        with tempfile.TemporaryDirectory() as directory:
            trace = Path(directory) / "commands"
            for case, (expected, commands) in cases.items():
                with self.subTest(case=case):
                    trace.write_text("")
                    result = subprocess.run(
                        ["/bin/zsh", "-c", HARNESS, "watchdog-test", str(SCRIPT)],
                        env={**os.environ, "CASE": case, "TRACE": str(trace)},
                        capture_output=True, text=True, timeout=5,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn(expected, result.stdout)
                    self.assertEqual(trace.read_text().splitlines(), commands)
                    if case != "launcher":
                        self.assertNotIn("HDMI_VIEW_LAUNCHED", result.stdout)


if __name__ == "__main__":
    unittest.main()
