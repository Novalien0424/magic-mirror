# Offline wake pronunciation data

`data.ts` is a gzip/base64 JSON dictionary, decompressed once by Electron Main. It contains public pronunciation data, not a neural model or user data. `provenance.json` pins upstream commits, source hashes and entry counts; adjacent license files must ship with this source.

The character map chooses the first pypinyin pronunciation. The phrase map stores the first reading of each syllable for phrases up to eight characters; runtime chooses the longest matching phrase before character fallback. The English map uses CMU dictionary lowercase words and their first pronunciation. Unknown words and model-incompatible tokens fail explicitly. Dictionary readings are not a guarantee for every proper name or accent.

No source is fetched at application startup. Updating this data is a deliberate source update; do not install Python, alter the neural package or change runtime model IDs to accept an ordinary supported phrase.

`src/shared/command-lexicon.json` is the browser-safe Mandarin pronunciation subset for whole-utterance spoken commands. Regenerate it from this pinned dictionary with `node --experimental-strip-types scripts/generate-command-lexicon.mjs`. It retains contextual phrase readings, strips tones and omits the English dictionary. The adjacent licenses and provenance apply to this derivative too. Command matching applies only the folds approved in `DECISIONS.md`; the dictionary does not authorize a command.
