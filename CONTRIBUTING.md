# Contributing

1. Run `npm start` and open http://localhost:8765.
2. Keep pure logic in `src/js/core/` (no DOM, testable in Node) and page code in `src/js/ui/`, one file per part of the page.
3. Every new number shown or played must come from the plan (`src/js/core/plan.js`), so sound, score, table and exports stay identical.
4. Never present sample or typed numbers as measurements. Real data needs a source line (`origin`) and an offline snapshot in `src/js/data/snapshots.js`.
5. Before a pull request: `npm run check && npm run build && npm test`.

Style: 2-space indent, single quotes, no build step, no frameworks, no external requests except the public data APIs listed in the README.
