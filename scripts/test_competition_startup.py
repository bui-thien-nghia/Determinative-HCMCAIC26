from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"

TEAM_ROOM_STARTUP_SCRIPTS = (
    "start_client.sh",
    "start_client.ps1",
    "start_host.sh",
    "start_host.ps1",
)
CLIENT_SCRIPTS = ("start_client.sh", "start_client.ps1")
HOST_SCRIPTS = ("start_host.sh", "start_host.ps1")


def read_script(name: str) -> str:
    return (SCRIPTS_DIR / name).read_text()


class CompetitionStartupScriptTests(unittest.TestCase):
    def test_start_client_sh_contains_no_docker_invocation(self):
        self.assertNotIn("docker", read_script("start_client.sh").lower())

    def test_start_client_ps1_contains_no_docker_invocation(self):
        self.assertNotIn("docker", read_script("start_client.ps1").lower())

    def test_start_host_sh_contains_no_docker_invocation(self):
        self.assertNotIn("docker", read_script("start_host.sh").lower())

    def test_start_host_ps1_contains_no_docker_invocation(self):
        self.assertNotIn("docker", read_script("start_host.ps1").lower())

    def test_team_room_startup_scripts_do_not_check_qdrant_ports(self):
        for script_name in TEAM_ROOM_STARTUP_SCRIPTS:
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertNotIn("6333", text)
                self.assertNotIn("6334", text)

    def test_team_room_startup_scripts_do_not_auto_start_aic_qdrant(self):
        for script_name in TEAM_ROOM_STARTUP_SCRIPTS:
            with self.subTest(script=script_name):
                self.assertNotIn("aic-qdrant", read_script(script_name))

    def test_no_fake_listener_for_6334_exists(self):
        listener_patterns = (
            r"TcpListener",
            r"HttpListener",
            r"\bnc\s+-l\b",
            r"\bsocat\b",
            r"http\.server\s+6334",
            r"listen\([^)]*6334",
            r"runserver\s+[^\n]*6334",
        )
        for path in SCRIPTS_DIR.glob("start_*"):
            text = path.read_text()
            with self.subTest(script=path.name):
                for pattern in listener_patterns:
                    self.assertIsNone(re.search(pattern, text, re.IGNORECASE))

    def test_clients_still_write_team_room_backend_url(self):
        for script_name in CLIENT_SCRIPTS:
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertIn("VITE_TEAM_ROOM_BACKEND_URL", text)
                self.assertIn(".env.local", text)

    def test_clients_still_run_start_all(self):
        for script_name in CLIENT_SCRIPTS:
            with self.subTest(script=script_name):
                self.assertIn("npm run start:all", read_script(script_name))

    def test_hosts_still_perform_8100_health_check(self):
        for script_name in HOST_SCRIPTS:
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertIn("127.0.0.1:8100/api/team-room/health/", text)
                self.assertRegex(text, r"Wait-?ForStatus|wait_for_status")

    def test_hosts_still_require_search_404(self):
        for script_name in HOST_SCRIPTS:
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertIn("127.0.0.1:8100/api/search/", text)
                self.assertIn("404", text)

    def test_hosts_still_require_filter_404(self):
        for script_name in HOST_SCRIPTS:
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertIn("127.0.0.1:8100/api/filter/", text)
                self.assertIn("404", text)

    def test_hosts_still_use_explicit_allowed_hosts_behavior(self):
        shell_host = read_script("start_host.sh")
        powershell_host = read_script("start_host.ps1")

        self.assertIn("DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,$TAILSCALE_HOSTNAME", shell_host)
        self.assertIn('"$SCRIPT_DIR/start_team_room.sh" "$TAILSCALE_HOSTNAME"', shell_host)
        self.assertIn("DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,$TailscaleHostname", powershell_host)
        self.assertIn(
            '$TeamRoomArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$TeamRoomScript`" `"$TailscaleHostname`""',
            powershell_host,
        )

    def test_hosts_use_funnel_only_for_8100(self):
        for script_name in HOST_SCRIPTS:
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertIn("tailscale funnel --bg 8100", text)
                self.assertNotIn("tailscale funnel --bg 8000", text)
                self.assertNotIn("tailscale funnel --bg 5173", text)

    def test_allowed_hosts_wildcard_is_never_used(self):
        for script_name in (
            "start_host.sh",
            "start_host.ps1",
            "start_team_room.sh",
            "start_team_room.ps1",
        ):
            with self.subTest(script=script_name):
                text = read_script(script_name)
                self.assertNotIn('ALLOWED_HOSTS=["*"]', text)
                self.assertNotIn("ALLOWED_HOSTS=['*']", text)
                self.assertNotIn('DJANGO_ALLOWED_HOSTS="*"', text)
                self.assertNotIn("$env:DJANGO_ALLOWED_HOSTS = '*'", text)

    def test_windows_team_room_helper_sets_allowed_hosts_from_hostname(self):
        text = read_script("start_team_room.ps1")
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


if __name__ == "__main__":
    unittest.main()
