from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CompetitionStartupScriptTests(unittest.TestCase):
    def test_windows_team_room_helper_sets_allowed_hosts_from_hostname(self):
        text = (ROOT / "scripts" / "start_team_room.ps1").read_text()
        expected_for_windows_regression = "localhost,127.0.0.1,desktop-pmub11e.tail371063.ts.net"

        self.assertIn('$env:DJANGO_ALLOWED_HOSTS = ($AllowedHosts -join ",")', text)
        self.assertIn('$AllowedHosts = @("localhost", "127.0.0.1")', text)
        self.assertIn("$AllowedHosts += $NormalizedHostname", text)
        self.assertEqual(
            expected_for_windows_regression,
            "localhost,127.0.0.1," + "desktop-pmub11e.tail371063.ts.net",
        )
        self.assertNotIn("desktop-pmub11e.tail371063.ts.net", text)
        self.assertNotIn('ALLOWED_HOSTS=["*"]', text)

    def test_windows_host_passes_detected_hostname_to_team_room_helper(self):
        text = (ROOT / "scripts" / "start_host.ps1").read_text()

        self.assertIn("DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,$TailscaleHostname", text)
        self.assertIn('$TeamRoomArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$TeamRoomScript`" `"$TailscaleHostname`""', text)
        self.assertIn("tailscale funnel --bg 8100", text)
        self.assertNotIn("tailscale funnel --bg 8000", text)
        self.assertNotIn("tailscale funnel --bg 6333", text)
        self.assertNotIn("tailscale funnel --bg 5173", text)


if __name__ == "__main__":
    unittest.main()
