# Search Mode Integration Notes

This frontend currently exposes two search-control groups in the left search sidebar:

- Retrieval mode: `Fast` and `Deep`
- Search modality: `Visual`, `Textual`, and `Hybrid`

## Current backend contract

The existing backend endpoints remain authoritative:

- `POST /api/search/` for Fast retrieval
- `POST /api/aggregatedsearch/` for Deep retrieval

The modality buttons are local frontend state only. They are persisted with the existing local workspace state, but they are not sent to the backend yet and are not shared through the Team Room.

Continuous Visual Search remains separate and does not read the new modality state.

## Future backend wiring point

Search for this source marker:

`BACKEND_INTEGRATION_SEARCH_MODALITY`

The marker lives in `FrontEnd/src/api.ts` inside:

`getSearchModalityRequestFields()`

When the backend defines the request contract for modality, add the agreed field mapping in that one helper. The Fast and Deep request builders already call the helper, so the integration should not require changing search UI components.

Until then, the helper must keep returning an empty object so `/api/search/` and `/api/aggregatedsearch/` payloads stay unchanged.
