# Sector Rotation Map · Synthetic Demo

Public, static interface preview for the Sector Rotation Map member product.
Every coordinate is generated deterministically in the browser and is not
market data, trading research, or investment advice.

The preview includes four universes (21 global cross-asset members, 11 U.S.
sectors, 20 curated U.S. industry ETF proxies, and 8 global markets),
sector-to-industry drill-down, parent-sector colours, gradient light paths,
and a synthetic 520-session timeline with scrub, play/pause, and
0.5×/1×/2× playback. The default 1× cadence advances one trading session every
200ms.

The private data engine, SQLite state, production snapshots, provider adapter,
and WordPress intake endpoint are intentionally excluded from this repository.

```text
npm test
python -m http.server 4173
```

`ponytail:` this public repository is an intentionally small presentation
mirror. The private WordPress plugin remains the canonical renderer; replace
manual mirroring with a checksum-verified release copy if the files begin to
drift.
