#!/usr/bin/env python3
"""Build a two-key Neo profile using Elgato's built-in System/Open action.

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
    for column, action, color, symbol in [
        (0, "Start", "#167248", '<path d="M58 29 L58 82 L99 55 Z" fill="white"/>'),
        (1, "Stop", "#a3303c", '<rect x="49" y="29" width="49" height="49" rx="5" fill="white"/>'),
    ]:
        app = controls / f"{action} Magic Mirror.app"
        if not app.is_dir():
            raise FileNotFoundError(app)
        icon = f"Images/{action.lower()}.svg"
        images[icon] = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">'
            f'<rect width="144" height="144" rx="20" fill="{color}"/>{symbol}</svg>'
        )
        actions[f"{column},0"] = {
            "ActionID": str(uuid.uuid5(uuid.NAMESPACE_URL, f"magicmirror:{action}")),
            "LinkedTitle": True,
            "Name": "Open",
            "Resources": None,
            "Settings": {"path": f'"{app}"'},
            "State": 0,
            "States": [{
                "FontFamily": "", "FontSize": 14, "FontStyle": "Bold",
                "FontUnderline": False, "Image": icon, "OutlineThickness": 0,
                "ShowTitle": True, "Title": f"{action.upper()}\nMIRROR",
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
