from pathlib import Path
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import codex_models as harness


def row(model, **overrides):
    return {"model": model, "hidden": False, "inputModalities": ["text", "image"],
            "supportedReasoningEfforts": [{"reasoningEffort": "medium"}], **overrides}


class FamilyResolutionTests(unittest.TestCase):
    def setUp(self):
        self.rows = [row("gpt-6-astra"), row("gpt-6.1-sol"), row("gpt-6.1-terra")]

    def test_new_versions_are_resolved_numerically_without_cross_family_fallback(self):
        rows = self.rows + [row("gpt-6.9-sol"), row("gpt-6.10-sol"),
                            row("gpt-7-terra-preview"), row("gpt-8-terra", hidden=True),
                            row("gpt-7-astra-2026-11-11")]
        self.assertEqual(harness.resolve(rows), {
            "astra": "gpt-6-astra", "sol": "gpt-6.10-sol", "terra": "gpt-6.1-terra"})
        with self.assertRaisesRegex(ValueError, "No available stable terra"):
            harness.resolve(self.rows[:2])

    def test_incompatible_new_model_does_not_silently_select_old_model(self):
        with self.assertRaisesRegex(ValueError, "medium"):
            harness.resolve(self.rows + [row("gpt-7-sol", supportedReasoningEfforts=[])])
        with self.assertRaisesRegex(ValueError, "image"):
            harness.resolve(self.rows + [row("gpt-7-terra", inputModalities=["text"])])

    def test_config_update_preserves_unrelated_settings_and_is_idempotent(self):
        original = '''# User configuration
model = "old"
approval_policy = "never"
notify = ["example", "keep this"]
[plugins.example]
enabled = true
[agents]
enabled = false
max_concurrent_threads_per_session = 4
default_subagent_model = "old"
'''
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            (home / "config.toml").write_text(original)
            (home / "nova-auto.config.toml").write_text('sandbox_mode = "workspace-write"\n')
            changes = harness.config_changes(home, harness.resolve(self.rows))
            actual = tomllib.loads(changes[home / "config.toml"])
            expected = tomllib.loads(original)
            expected.update(model="gpt-6-astra", model_reasoning_effort="medium")
            expected["agents"].update(default_subagent_model="gpt-6.1-sol",
                                      default_subagent_reasoning_effort="medium")
            self.assertEqual(actual, expected)
            self.assertEqual(tomllib.loads(changes[home / "nova-auto.config.toml"])["sandbox_mode"],
                             "workspace-write")
            for path, content in changes.items():
                harness.atomic_write(path, content)
            self.assertEqual(changes, harness.config_changes(home, harness.resolve(self.rows)))
            terra = tomllib.loads(changes[home / "agents/computer_use.toml"])
            self.assertEqual(terra["model"], "gpt-6.1-terra")
            self.assertNotIn("sandbox_mode", terra)

    def test_bad_catalog_leaves_config_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "config.toml"
            config.write_text('model = "existing"\n')
            with patch.object(harness, "codex_home", return_value=Path(temp)), \
                 patch.object(harness.shutil, "which", return_value="codex"), \
                 patch.object(harness, "catalog", return_value=self.rows[:2]):
                with self.assertRaises(ValueError):
                    harness.refresh()
            self.assertEqual(config.read_text(), 'model = "existing"\n')

    def test_existing_config_without_final_newline_and_commented_table(self):
        content = 'approval_policy = "never"\n[agents] # local choices\nenabled = false'
        result = harness.set_values(content, "agents", {"default_subagent_model": "gpt-6.1-sol"})
        self.assertEqual(tomllib.loads(result), {
            "approval_policy": "never",
            "agents": {"enabled": False, "default_subagent_model": "gpt-6.1-sol"},
        })
        result = harness.set_values('approval_policy = "never"', "", {"model": "gpt-6-astra"})
        self.assertEqual(tomllib.loads(result)["approval_policy"], "never")

    def test_explicit_model_and_profile_survive_alias_launch(self):
        for args in (["exec", "-m", "chosen", "hello"], ["--profile=custom", "hello"]):
            with patch.object(harness.sys, "argv", ["codex-sol", *args]), \
                 patch.object(harness, "refresh", return_value=("/bin/codex", harness.resolve(self.rows))), \
                 patch.object(harness.os, "execv") as execute:
                harness.main()
                execute.assert_called_once_with("/bin/codex", ["/bin/codex", *args])

    def test_alias_uses_config_overrides_supported_by_administrative_commands(self):
        with patch.object(harness.sys, "argv", ["codex-terra", "app-server", "--stdio"]), \
             patch.object(harness, "refresh", return_value=("/bin/codex", harness.resolve(self.rows))), \
             patch.object(harness.os, "execv") as execute:
            harness.main()
            execute.assert_called_once_with("/bin/codex", [
                "/bin/codex", "-c", 'model="gpt-6.1-terra"',
                "-c", 'model_reasoning_effort="medium"', "app-server", "--stdio",
            ])


if __name__ == "__main__":
    unittest.main()
