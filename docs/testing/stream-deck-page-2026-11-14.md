# Stream Deck falls back to the main keys during a music loop — 2026-11-14

Owner report (11-14): while MUSIC LOOP played the Yunelle folder, the Neo went back to the
top-level keys after some time; VOL± was then out of reach, and pressing MUSIC LOOP to get
the Music page back restarted the music at the first song. Metadata only.

## Cause

- The Music and Playback pages are separate Stream Deck profiles, reached by the keys'
  Switch Profile actions. The main profile was marked default (`AppIdentifier: "*"`).
- Stream Deck selects the default profile whenever another app comes to the front, unless
  its own window is open. The mirror itself has not taken focus since 11-01, but anything
  else on the Mac does: on 11-14 the button log shows MUSIC LOOP 09:05:30, folder 1
  09:05:32, VOL− 09:05:41, then MUSIC LOOP again at 09:46:54. In between, WindowServer logged
  the first front-app change at 09:27:55 (Stream Deck's update prompt was answered, then
  System Settings, Finder and other apps came to the front), and more until 09:42. The exact
  moment the page left was not recorded then.
- MUSIC LOOP pressed while a subfolder played returned to MusicLoop's own files, first song.

## Proof (Stream Deck 7.6.0, app stopped, 16:24–16:30)

The plugin now logs when its Music page keys appear or leave
(`~/Library/Logs/MagicMirror/deck.log`). The Music page was put up without a key press by
making it the Neo's preferred profile while Stream Deck was quit.

| Main profile | Stream Deck window | App switches | Music page |
| --- | --- | --- | --- |
| marked default | open | several (Finder, System Settings, Stream Deck) | stayed |
| marked default | closed | Finder | hidden at once |
| no mark | closed, background launch | 5 (Finder, System Settings, System Information) | stayed |
| marked default | closed, background launch | none needed | hidden at launch |
| no mark (final), main preferred | closed, background launch | Finder | main keys, no change |

## Fix

1. No profile is marked default: the `AppIdentifier` key was removed from the main profile's
   manifest with Stream Deck quit; it kept the change across relaunches. The Neo's preferred
   profile is the main keys. Backup of the manifest before:
   `~/Library/Caches/MagicMirror/stream-deck-main-manifest-before-2026-11-14.json`.
2. MUSIC LOOP pressed while a subfolder plays keeps that music (`src/main/index.ts`). Live at
   1% on the production app, 16:38: MUSIC LOOP (5 files), folder 1 (84 files), MUSIC LOOP
   again: accepted, no playlist reload, the folder still marked playing; STOP; levels read
   back at the defaults. 95 tests in the music and operator files, typecheck, build.
3. The plugin's page log stays as the diagnostic.

## Rapid presses 09:46:54–09:47:31 (audit, same day)

Owner: a second person pressed keys quickly and things went wrong; is there press protection?

- What was pressed (button log, app log, WindowServer log). Positions: Music page VOL− and
  main-page DANCE FLOOR are both `2,1`; NEXT and MUSIC LOOP both `1,1`.

  | Time | Key received | Result |
  | --- | --- | --- |
  | 09:46:54 | MUSIC LOOP (deck had fallen back to the main keys) | music restarted on MusicLoop's own files, levels reset |
  | 09:46:58 | folder 1 | folder restarted at song 1 |
  | 09:46:59.6, 09:47:02.1 | VOL− | two steps down |
  | 09:47:02.3 | (none) | the VOL− helper app became the front app (WindowServer); the return to the main keys is inferred from the next row, the page log did not exist yet |
  | 09:47:02.6, 03.0, 03.3 | DANCE FLOOR ×3, same position as VOL− | one Dance start (music stopped, TV woken), two debounced |
  | 09:47:07.5 | MUSIC LOOP | Dance cancelled, music restarted on its own files, levels reset |
  | 09:47:08.8 | VOL+ | one step up; its helper became the front app |
  | 09:47:12.3 | MUSIC LOOP | accepted, levels reset again |
  | 09:47:15 | folder 1 | folder restarted at song 1 |
  | 09:47:20–31 | VOL− ×4 | four steps down |

- Cause: the same default-profile fault. A key's own helper app can come to the front (seen
  for Volume Down, Dance Floor and Volume Up; not on every press, reason not established), so
  the page changed under the finger and presses meant for VOL− started Dance Floor. The app
  executed every received press correctly and in order; no failure marker in that window.
- Protection that exists: the eight mode keys run one at a time through a queue; the same
  mode key within 3 s of its last accepted press is dropped (`debounced`); a repeated MUSIC
  LOOP or DANCE FLOOR keeps what plays; presses older than 120 s expire; STOP cancels a
  pending start. VOL± and PREV/NEXT are deliberately not debounced: every press counts.
- Gap closed: a folder key pressed again while its folder plays restarted it at song 1. It
  now keeps the song (`operator_loop_music_folder_kept`).
- Checks 16:48–16:52, app stopped except for the 1% run:
  - Music page shown, no default mark, 5 VOL− and 3 VOL+ helper launches 0.4 s apart: 8 steps
    logged, page log unchanged. In this run no helper became the front app, so the front-app
    case rests on the on/off/on table above.
  - Production app at 1%: MUSIC LOOP, folder 1, then the folder key 4 times 0.3 s apart,
    MUSIC LOOP, folder key: two playlist loads in the whole run, five `folder_kept`; three
    NEXT presses 0.3 s apart moved from song 1 to song 4. STOP; levels read back at the defaults.
    151 tests in the music and operator files, typecheck, build.
- Not changed (owner's call): different mode keys pressed in quick succession all run, in
  order, and the last one decides the mode; a repeated MUSIC LOOP press resets the speaker
  levels; a double tap on MUSIC LOOP could land its second tap on NEXT (same position once the
  Music page appears; not tested, no such pair in the button log).

## Stream Deck 7.6.1 (17:55, owner's request)

Updated 7.6.0 → 7.6.1 from Elgato's signed, notarized package with Stream Deck quit; Magic
Mirror stopped. After it: 18 profile JSON files byte-identical, no profile marked default,
main keys preferred, plugin connected, Neo attached. Music page preferred, background launch,
five app switches (Finder, System Settings): `music_page=shown`, never hidden; main keys
restored. Stream Deck logs one `Failed to save Node.js manifest` line at launch (its Node
plugin runtime; our plugin is native). Not checked: a physical key press on 7.6.1.

## Limits

- No physical key press was possible: the path "MUSIC LOOP key → Music page → app switch"
  is proven only from the Music page reached by the preferred-profile route.
- Whether Stream Deck stores the page a Switch Profile action selected as the preferred one
  is unknown; if it does, a restart during music comes back on the Music page (STOP returns
  to the main keys).
- A repeated MUSIC LOOP press still sets the speakers to their normal levels (existing
  ruling), so it undoes a VOL± change.
