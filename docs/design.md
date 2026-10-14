# Design

Keep the **existing layout of the site** (left sidebar, topbar, pages side by side,
tables rather than card grids). Change the look, not the structure.
Visual reference: `docs/mockups/`.

## Colours — CSS variables in one file (`public/styles/tokens.css`)

```css
:root {
  /* ground */
  --pitch:   #15121A;  /* page background */
  --panel:   #19151F;  /* sidebar, panels */
  --input:   #1C1824;  /* inputs, chips */
  --raised:  #241E2E;  /* active nav item, tooltips, toasts */
  --control: #2A2435;  /* selected segment, menu button */
  --line:    #241F2D;  /* light dividers */
  --seam:    #2E2838;  /* table header rule */
  --border:  #3A3348;  /* button outlines */

  /* text */
  --chalk:   #F2EDF7;  /* primary */
  --soft:    #D6CFE0;  /* strong secondary */
  --haze:    #A79FB4;  /* secondary */
  --mute:    #8C85A0;  /* captions */
  --dim:     #6F6880;  /* notes, axis labels */

  /* heat — red is a scale, not a flat accent */
  --ember:   #FF2E63;
  --flare:   #FF9A4D;
  --heat-gradient: linear-gradient(135deg, #FF9A4D 0%, #FF2E63 68%);
  --rise-text: #FFB3C3;  /* positive change figures */

  /* sources — each keeps one colour everywhere */
  --src-wikipedia: #FF9A4D;
  --src-hn:        #FFD166;
  --src-gdelt:     #A78BFA;
  --src-rss:       #7E7691;
}
```

The mockups also use `#FF2E63` for Reddit. Reddit is not in v1 — give that colour
to nothing for now; the Rising-now agreement badges and the brand mark keep using it.

## Type

- Headings, figures, wordmark: **Bricolage Grotesque** 700/800, tight letter-spacing
  (-0.02 to -0.035em)
- Everything else: **Figtree** 400/500/600/700
- Both from Google Fonts, with system fallbacks
- Page title 32px · section 19–22px · body 15px · table 15px · captions 12–13px

## Layout

- Sidebar 248px: brand, then main group (Discover trends, CSV analytics, Compare
  topics, Seasonality), divider, work group (Saved topics, Import data,
  Sources & help). Active item: `--raised` background + a 3px heat-gradient bar.
- Topbar: search, last-updated time on the right.
- Content padding 28px, sections 22–26px apart.
- Below ~900px the sidebar becomes a slide-out drawer (see `Mobile.dc.html`).

## Components

- **Tables** over card grids. Header row 12px `--dim`, rows divided by `--line`.
- **Grouped table** on Discover: group heading = pill badge ("On 3 of 4 sources")
  + short hint + topic count. 4/4 badge uses the heat gradient, 3/4 a red tint,
  2/4 `--control`.
- **Source dots**: 9px circles in source colours; grey `--seam` for sources not rising.
- **Charts**: inline SVG, one line per source, gridlines `#231E2C`, crosshair on
  hover, tooltip on `--raised` with raw value + unit per source.
- **Buttons**: primary = heat gradient, white text; secondary = transparent with
  `--border` outline. Radius 10px.
- **Toasts** bottom-centre on `--raised`.
- Touch targets at least 44px. Visible focus states. Never colour alone — every
  colour-coded thing also has a label.

## Tone

Short, plain English. Always say what a number is. Say limits openly — the
Sources page and the empty states are part of the product, not an afterthought.
