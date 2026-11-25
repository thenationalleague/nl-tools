# Transcribe: what it fetches

Nothing third-party is committed here. Three things are fetched from other
hosts when someone presses Transcribe. All are downloads only: the recording
is never sent anywhere, and nothing is saved to the database.

| What | From | Pinned to |
|---|---|---|
| The library, Transformers.js (Apache-2.0) | `cdn.jsdelivr.net/npm/@huggingface/transformers` | 4.3.2, in `_worker.js` |
| Its runtime, `onnxruntime-web` (about 20 MB) | `cdn.jsdelivr.net/npm/onnxruntime-web` | the version the library was built against |
| The models, kept by the browser after first use | `huggingface.co` | by name, below |

Models: the transcriber the person picks (`Xenova/whisper-tiny.en`,
`-base.en` or `-small.en`, MIT), and for telling speakers apart
`onnx-community/pyannote-segmentation-3.0` (MIT) and
`onnx-community/wespeaker-voxceleb-resnet34-LM` (CC BY 4.0).

The library is not committed the way `system/_vendor/` is because GitHub's
push protection reads a 32-letter class name in its minified file as an API
key and refuses the push. It is not a key, but switching that check off for
a file is a decision for a person, not for the change that added the file.
To commit it later: allow the file in the repo's secret-scanning settings,
`npm pack @huggingface/transformers@4.3.2`, copy `dist/transformers.min.js`
to `transcribe/_vendor/`, and point `LIBRARY` in `_worker.js` at it.

To upgrade the library, change the version in `LIBRARY` and run the tool
once on a recording with two or more people in it.

If either host is blocked on a network, the tool says something went wrong
during the download, and nothing else is affected.
