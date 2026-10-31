#!/usr/bin/env python3
"""Build the Neo profiles using only Elgato's built-in actions.

Magic Mirror: the eight mode keys (System/Open). VIDEO LOOP and MUSIC LOOP are Multi
Actions that open their control and then Switch Profile to Magic Mirror Playback.
Magic Mirror Playback: VOL+, VOL- and STOP; STOP opens the stop control and switches
back. Both ship in one package so Stream Deck maps the cross-profile references.

The format is taken from Stream Deck 7.6's bundled Neo and package profiles. Import
through Stream Deck; never edit its live profile database or replace the default profile.
"""
import json
from pathlib import Path
import sys
import uuid
from zipfile import ZIP_DEFLATED, ZipFile

MAIN_ID = "a7925f50-0c38-4fe1-84b4-50eec83b2398"
MAIN_PAGE = "45225d01-c350-43ba-b202-dd5cfb3b004a"
MAIN_PINNED = "99293094-82b8-4758-9126-dc3f7ed80752"
PLAYBACK_ID = "3c0b8f1e-6a52-4f0e-9a7d-2f5d0f6b8c41"
PLAYBACK_PAGE = "b8a4d2c7-1e3f-4a6b-9c5d-7e8f9a0b1c2d"
PLAYBACK_PINNED = "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b"

SYMBOLS = {
    "Start": ("#167248", '<path d="M58 29 L58 82 L99 55 Z" fill="white"/>'),
    "Console": ("#6650a4", '<rect x="43" y="30" width="62" height="48" rx="5" fill="none" stroke="white" stroke-width="6"/><path d="M53 42 L64 53 L53 64 M73 64 H92" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round"/>'),
    "Play Loop": ("#315ba8", '<path d="M47 42 A31 31 0 1 1 43 72" fill="none" stroke="white" stroke-width="9"/><path d="M35 33 L60 38 L41 57 Z" fill="white"/>'),
    "Desktop": ("#35656a", '<rect x="42" y="27" width="64" height="44" rx="4" fill="none" stroke="white" stroke-width="6"/><path d="M74 74 V84 M57 86 H91" fill="none" stroke="white" stroke-width="6"/>'),
    "Studio": ("#b26a00", '<path d="M66 31 Q70 53 92 57 Q70 61 66 83 Q62 61 40 57 Q62 53 66 31 Z M97 24 Q98.5 31.5 106 33 Q98.5 34.5 97 42 Q95.5 34.5 88 33 Q95.5 31.5 97 24 Z" fill="white"/>'),
    "Music Loop": ("#087d77", '<path d="M62 72 V32 L98 24 V64 M62 43 L98 35" fill="none" stroke="white" stroke-width="7"/><ellipse cx="53" cy="75" rx="13" ry="9" fill="white"/><ellipse cx="89" cy="67" rx="13" ry="9" fill="white"/>'),
    "Dance Floor": ("#9a266a", '<path d="M44 72 L57 38 L70 66 L83 29 L100 72" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>'),
    "Stop": ("#a3303c", '<rect x="49" y="29" width="49" height="49" rx="5" fill="white"/>'),
    "Volume Up": ("#3d4f66", '<path d="M38 44 H52 L70 30 V82 L52 68 H38 Z" fill="white"/><path d="M84 56 H108 M96 44 V68" stroke="white" stroke-width="7" stroke-linecap="round"/>'),
    "Volume Down": ("#3d4f66", '<path d="M38 44 H52 L70 30 V82 L52 68 H38 Z" fill="white"/><path d="M84 56 H108" stroke="white" stroke-width="7" stroke-linecap="round"/>'),
}


def svg(action: str) -> str:
    color, symbol = SYMBOLS[action]
    # Keep symbols in the upper half, clear of the two-line title area.
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">'
            f'<rect width="144" height="144" rx="20" fill="{color}"/>'
            f'<g transform="translate(18 -4) scale(0.75)">{symbol}</g></svg>')


def state(title: str, icon: str, size: int = 14) -> dict:
    return {"FontFamily": "", "FontSize": size, "FontStyle": "Bold", "FontUnderline": False, "Image": icon,
            "OutlineThickness": 0, "ShowTitle": True, "Title": title, "TitleAlignment": "bottom", "TitleColor": "#ffffff"}


def open_action(controls: Path, action: str, key: str) -> dict:
    app = controls / f"{action} Magic Mirror.app"
    if not app.is_dir():
        raise FileNotFoundError(app)
    return {"ActionID": str(uuid.uuid5(uuid.NAMESPACE_URL, f"magicmirror:{key}")), "LinkedTitle": True, "Name": "Open",
            "Resources": None, "Settings": {"path": f'"{app}"'}, "State": 0, "States": [{}],
            "UUID": "com.elgato.streamdeck.system.open"}


def switch_action(target: str, key: str) -> dict:
    return {"ActionID": str(uuid.uuid5(uuid.NAMESPACE_URL, f"magicmirror:{key}")), "LinkedTitle": True,
            "Name": "Switch Profile", "Resources": None, "Settings": {"DeviceUUID": "", "ProfileUUID": target.upper()},
            "State": 0, "States": [{}], "UUID": "com.elgato.streamdeck.profile.rotate"}


def key(controls: Path, action: str, title: str, switch_to=None, size: int = 14):
    icon = f"Images/{action.lower().replace(' ', '-')}.svg"
    opened = open_action(controls, action, action if switch_to is None else f"{action}:open")
    if switch_to is None:
        return {**opened, "States": [state(title, icon, size)]}, icon
    # Open the control first, then show the matching key set. A failed mode still lands
    # on the target profile; its STOP (or the main keys) recover as usual.
    return {
        "ActionID": str(uuid.uuid5(uuid.NAMESPACE_URL, f"magicmirror:{action}:multi")),
        "Actions": [{"Actions": [opened, switch_action(switch_to, f"{action}:switch")]}],
        "LinkedTitle": True, "Name": "Multi Action", "Resources": None, "Settings": {}, "State": 0,
        "States": [state(title, icon, size)], "UUID": "com.elgato.streamdeck.multiactions.routine",
    }, icon


def build_profile(controls: Path) -> Path:
    main = [
        (0, 0, "Start", "START\nMIRROR", None), (1, 0, "Console", "CONSOLE", None),
        (2, 0, "Play Loop", "VIDEO\nLOOP", PLAYBACK_ID), (3, 0, "Desktop", "DESKTOP", None),
        (0, 1, "Studio", "STUDIO", None), (1, 1, "Music Loop", "MUSIC\nLOOP", PLAYBACK_ID),
        (2, 1, "Dance Floor", "DANCE\nFLOOR", None), (3, 1, "Stop", "STOP", None),
    ]
    playback = [
        (0, 0, "Volume Up", "VOL +", None), (0, 1, "Volume Down", "VOL −", None),
        (3, 1, "Stop", "STOP", MAIN_ID),
    ]
    destination = controls / "Magic Mirror.streamDeckProfile"
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        def profile(profile_id, page_id, pinned_id, name, keys):
            base = f"Profiles/{profile_id.upper()}.sdProfile"
            actions, images = {}, {}
            for column, row, action, title, switch_to in keys:
                actions[f"{column},{row}"], icon = key(controls, action, title, switch_to,
                                                       12 if action in ("Console", "Desktop") else 14)
                images[icon] = svg(action)
            archive.writestr(f"{base}/manifest.json", json.dumps({
                "Device": {"Model": "20GBJ9901", "UUID": ""}, "Name": name,
                "Pages": {"Current": page_id, "Default": pinned_id, "Pages": [page_id]}, "Version": "3.0"}, indent=2))
            archive.writestr(f"{base}/Profiles/{page_id.upper()}/manifest.json", json.dumps(
                {"Controllers": [{"Type": "Keypad", "Actions": actions}], "Icon": "", "Name": ""}, indent=2))
            archive.writestr(f"{base}/Profiles/{pinned_id.upper()}/manifest.json", json.dumps(
                {"Controllers": [{"Type": "Keypad", "Actions": {}}], "Icon": "", "Name": ""}, indent=2))
            for name, image in images.items():
                archive.writestr(f"{base}/Profiles/{page_id.upper()}/{name}", image)
        archive.writestr("package.json", json.dumps({
            "AppVersion": "7.6.0.23012", "DeviceModel": "20GBJ9901", "DeviceSettings": None, "FormatVersion": 1,
            "OSType": "macOS", "OSVersion": "27.0.0",
            "RequiredPlugins": ["com.elgato.streamdeck.system.open", "com.elgato.streamdeck.multiactions",
                                "com.elgato.streamdeck.profile.rotate"]}))
        profile(MAIN_ID, MAIN_PAGE, MAIN_PINNED, "Magic Mirror", main)
        profile(PLAYBACK_ID, PLAYBACK_PAGE, PLAYBACK_PINNED, "Magic Mirror Playback", playback)
    return destination


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare-stream-deck-profile.py CONTROLS_DIRECTORY")
    print(build_profile(Path(sys.argv[1]).resolve()))
