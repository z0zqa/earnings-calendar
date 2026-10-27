# Logo audit — October 2026

Scope: the 463 companies the app shows by default (top 9 per session, plus watchlist) across the weeks of
Oct 5 – Nov 6, 2026. Each FMP logo was checked by eye against the company name, next to the Parqet logo for
the same ticker.

| Finding | Tickers | Fix |
| --- | --- | --- |
| Wrong image | IBN (promo banner), RBC (Regal, not RBC Bearings), BCTX (not BriaCell), CAR | pinned to Parqet |
| Outdated after a rebrand | FLG (old NYCB logo), MSTR (old MicroStrategy), NUE, WDC | pinned to Parqet |
| Cropped or unclear mark | APH, CHTR, LYV, CDNS, BAM, CAT, BAH, TRI, VTR | pinned to Parqet |
| No usable logo in either source | BNY, LKFN, UNTY, AXSM (cropped in both) | monogram |
| White mark on transparent background | IBM, CSX, LMT, AN, CEG, STLD, EQT, AME, BMRA and others | detected automatically → dark tile |
| Mark lost in padding | AAPL, CORZ, DX, CRCL, EPAC and others | cropped automatically |
| Duplicate image | GOOG = GOOGL | correct (same company) |

Still to confirm: **APD** (green "AP" mark) and **XYZ** (Block, colourful 3D cube); both kept as FMP.

Parqet alone would have been wrong more often (COR → CoreSite, TEAM → Ormat, GLDG → Barrick, DVN → Newron,
SPCX → AXS, APD → aprendere, NOW → a leaf), so FMP stays the primary source.

New companies appear every week; the Sunday workflow saves `out/logo-audit-<week>.png` (see README).

## Follow-up, October 27, 2026

77 companies new to the default view since the first audit. Fixed: **CORT** (FMP had a promo image) and **WGS**
(old Sema4 logo) pinned to Parqet; **SYRE** (old Aeglea logo in both sources) set to a monogram. Still to
confirm: **ABEV** (red "a") and **ETR** (pink "e").

## Navy marks, October 27, 2026

Every logo is now redrawn in the app's navy by `scripts/logos.mjs`. Reviewing the 540 audited logos as marks,
the badge-style logos that lose their shape as one colour fall back to a monogram (HOMB, FLXS, DOC, MO, NE,
RYAAY, CTBI) and six switch to Parqet, whose version draws cleanly (FCX, FRHC, SHEL, NSC, XYZ, VRT).
37 overrides in total.
