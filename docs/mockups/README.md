# Mockups

Reference screens from the design phase. They were made in a design tool and need
its runtime, so **they do not open as normal web pages**. Read them as markup:
the HTML shows layout and copy, inline styles show exact colours and sizes, and the
`<script>` at the bottom of each file holds the sample data and interaction logic.

All data in them is **sample data**. Never copy those numbers into the product.

| File | Screen | Use in v1 |
|---|---|---|
| `Main.dc.html` | Discover trends | Yes — phase 5 |
| `Result.dc.html` | Topic page | Only the chart + per-source table (phase 6) |
| `Sources.dc.html` | Sources & help | Yes — phase 7 |
| `States.dc.html` | Empty / error / loading states | Yes — phase 7 |
| `Mobile.dc.html` | Phone layout with drawer | Yes — responsive behaviour |
| `Tokens.dc.html` | Palette and type sheet | Reference for `docs/design.md` |

## Differences from the mockups in v1

- **No Reddit.** The mockups show 5 sources; v1 has 4 (Wikipedia, Hacker News,
  GDELT, Trends RSS). Agreement reads "On X of 4 sources".
- **No time-window dropdown.** v1 uses a fixed 7-day comparison.
- On the topic page, leave out: Why it spiked, Which source moves first, Where it is
  popular, Mentioned alongside, Topic history, the export menu.
- No ⌘K palette, no "Status & errors" nav item (that page only collects the states).
