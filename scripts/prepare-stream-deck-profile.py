#!/usr/bin/env python3
"""Build a six-key Neo profile using Elgato's built-in System/Open action.

The format is taken from Stream Deck 7.6's bundled Neo profile. Import through
Stream Deck; never edit its live profile database or replace the default profile.
"""
import json
from pathlib import Path
import sys
import uuid
from zipfile import ZIP_DEFLATED, ZipFile


def build_profile(controls: Path) -> Path:
    profile_id = "a7925f50-0c38-4fe1-84b4-50eec83b2398"
    page_id = "45225d01-c350-43ba-b202-dd5cfb3b004a"
    pinned_id = "99293094-82b8-4758-9126-dc3f7ed80752"
    base = f"{profile_id.upper()}.sdProfile"
    actions = {}
    images = {}
    for column, row, action, title, color, symbol in [
        (0, 0, "Start", "START\nMIRROR", "#167248", '<path d="M58 29 L58 82 L99 55 Z" fill="white"/>'),
        (1, 0, "Console", "CONSOLE", "#6650a4", '<rect x="43" y="30" width="62" height="48" rx="5" fill="none" stroke="white" stroke-width="6"/><path d="M53 42 L64 53 L53 64 M73 64 H92" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/>'),
        (2, 0, "Play Loop", "PLAY\nLOOP", "#315ba8", '<path d="M47 42 A31 31 0 1 1 43 72" fill="none" stroke="white" stroke-width="9"/><path d="M35 33 L60 38 L41 57 Z" fill="white"/>'),
        (3, 0, "Desktop", "DESKTOP", "#35656a", '<rect x="42" y="27" width="64" height="44" rx="4" fill="none" stroke="white" stroke-width="6"/><path d="M74 74 V84 M57 86 H91" fill="none" stroke="white" stroke-width="6"/>'),
        (0, 1, "Studio", "STUDIO", "#b26a00", '<path d="M66 31 Q70 53 92 57 Q70 61 66 83 Q62 61 40 57 Q62 53 66 31 Z M97 24 Q98.5 31.5 106 33 Q98.5 34.5 97 42 Q95.5 34.5 88 33 Q95.5 31.5 97 24 Z" fill="white"/>'),
        (3, 1, "Stop", "STOP", "#a3303c", '<rect x="49" y="29" width="49" height="49" rx="5" fill="white"/>'),
    ]:
        app = controls / f"{action} Magic Mirror.app"
        if not app.is_dir():
            raise FileNotFoundError(app)
        icon = f"Images/{action.lower().replace(' ', '-')}.svg"
        # Keep symbols in the upper half, clear of the two-line title area.
        images[icon] = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">'
            f'<rect width="144" height="144" rx="20" fill="{color}"/>'
            f'<g transform="translate(18 -4) scale(0.75)">{symbol}</g></svg>'
        )
        actions[f"{column},{row}"] = {
            "ActionID": str(uuid.uuid5(uuid.NAMESPACE_URL, f"magicmirror:{action}")),
            "LinkedTitle": True,
            "Name": "Open",
            "Resources": None,
            "Settings": {"path": f'"{app}"'},
            "State": 0,
            "States": [{
                "FontFamily": "", "FontSize": 12 if action in ("Console", "Desktop") else 14, "FontStyle": "Bold",
                "FontUnderline": False, "Image": icon, "OutlineThickness": 0,
                "ShowTitle": True, "Title": title,
                "TitleAlignment": "bottom", "TitleColor": "#ffffff",
            }],
            "UUID": "com.elgato.streamdeck.system.open",
        }
    manifest = {
        "Device": {"Model": "20GBJ9901", "UUID": ""}, "Name": "Magic Mirror",
        "Pages": {"Current": page_id, "Default": pinned_id, "Pages": [page_id]},
        "Version": "3.0",
    }
    destination = controls / "Magic Mirror.streamDeckProfile"
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        def put(path, value):
            archive.writestr(f"{base}/{path}", json.dumps(value, indent=2))
        put("manifest.json", manifest)
        put(f"Profiles/{page_id.upper()}/manifest.json", {
            "Controllers": [{"Type": "Keypad", "Actions": actions}], "Icon": "", "Name": "",
        })
        put(f"Profiles/{pinned_id.upper()}/manifest.json", {
            "Controllers": [{"Type": "Keypad", "Actions": {}}], "Icon": "", "Name": "",
        })
        for name, svg in images.items():
            archive.writestr(f"{base}/Profiles/{page_id.upper()}/{name}", svg)
    return destination


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare-stream-deck-profile.py CONTROLS_DIRECTORY")
    print(build_profile(Path(sys.argv[1]).resolve()))
