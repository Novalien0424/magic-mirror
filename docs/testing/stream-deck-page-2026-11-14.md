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

## Limits

- No physical key press was possible: the path "MUSIC LOOP key → Music page → app switch"
  is proven only from the Music page reached by the preferred-profile route.
- Whether Stream Deck stores the page a Switch Profile action selected as the preferred one
  is unknown; if it does, a restart during music comes back on the Music page (STOP returns
  to the main keys).
- A repeated MUSIC LOOP press still sets the speakers to their normal levels (existing
  ruling), so it undoes a VOL± change.
