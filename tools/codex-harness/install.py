#!/usr/bin/env python3
"""Install the portable user harness and optional macOS hourly catalog refresh."""
import argparse
import datetime
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

SOURCE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hourly", action="store_true", help="Enable per-user macOS catalog refresh")
    args = parser.parse_args()
    if args.hourly and sys.platform != "darwin":
        parser.error("--hourly is supported on macOS only")
    home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    target = home / "harness"
    bindir = Path.home() / ".local/bin"
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = home / "backups" / f"harness-install-{stamp}"
    backup.mkdir(parents=True, mode=0o700)
    paths = [home / name for name in (
        "AGENTS.md", "config.toml", "nova-auto.config.toml", "astra.config.toml",
        "sol.config.toml", "terra.config.toml", "family-models.json",
        "agents/implementer.toml", "agents/computer_use.toml", "harness",
    )]
    for path in paths:
        if path.exists():
            dest = backup / path.relative_to(home)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if path.is_dir():
                shutil.copytree(path, dest)
            else:
                shutil.copy2(path, dest)
    target.mkdir(parents=True, exist_ok=True)
    for name in ("codex_models.py", "AGENTS.md", "README.md"):
        shutil.copy2(SOURCE / name, target / name)
    shutil.copytree(SOURCE / "agents", target / "agents", dirs_exist_ok=True)
    os.chmod(target / "codex_models.py", 0o755)
    instructions = home / "AGENTS.md"
    begin, end = "<!-- codex-family-harness:start -->", "<!-- codex-family-harness:end -->"
    existing = instructions.read_text() if instructions.exists() else ""
    block = begin + "\n" + (SOURCE / "AGENTS.md").read_text().rstrip() + "\n" + end
    if begin in existing and end in existing:
        left, rest = existing.split(begin, 1)
        _, right = rest.split(end, 1)
        existing = left + block + right
    else:
        existing = existing.rstrip() + ("\n\n" if existing.strip() else "") + block + "\n"
    instructions.write_text(existing)
    bindir.mkdir(parents=True, exist_ok=True)
    for name in ("codex-models", "codex-astra", "codex-sol", "codex-terra"):
        alias = bindir / name
        if alias.exists() or alias.is_symlink():
            shutil.copy2(alias, backup / name, follow_symlinks=False)
            alias.unlink()
        alias.symlink_to(target / "codex_models.py")
    if str(bindir) not in os.get_exec_path():
        # Preserve the user's shell setup; add one guarded PATH entry.
        shellrc = Path.home() / ".zshrc"
        if shellrc.exists():
            shutil.copy2(shellrc, backup / ".zshrc")
        entry = '\n# Codex family aliases\nexport PATH="$HOME/.local/bin:$PATH"\n'
        if entry not in (shellrc.read_text() if shellrc.exists() else ""):
            with shellrc.open("a") as stream:
                stream.write(entry)
    result = subprocess.run([sys.executable, str(target / "codex_models.py"), "refresh"])
    if result.returncode:
        print(f"Install refresh failed; backup: {backup}", file=sys.stderr)
        return result.returncode
    if args.hourly:
        label = "local.codex.family-models"
        plist = Path.home() / "Library/LaunchAgents" / f"{label}.plist"
        plist.parent.mkdir(parents=True, exist_ok=True)
        if plist.exists():
            shutil.copy2(plist, backup / plist.name)
            subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{label}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        job = {
            "Label": label,
            "ProgramArguments": [sys.executable, str(target / "codex_models.py"), "refresh"],
            "RunAtLoad": True, "StartInterval": 3600,
            "EnvironmentVariables": {"PATH": os.environ["PATH"], "CODEX_HOME": str(home)},
            "StandardOutPath": str(home / "family-models.log"),
            "StandardErrorPath": str(home / "family-models-error.log"),
        }
        plist.write_bytes(plistlib.dumps(job))
        subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(plist)], check=True)
    print(f"Installed user-wide family aliases. Backup: {backup}")
    print("New terminals: codex-astra / codex-sol / codex-terra. Existing sessions keep their model.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
