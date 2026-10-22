# Chess Analyser

## Goal
Beginner-friendly chess analyser web app. The user plays or loads moves; the app shows the best move,
threats, move ratings and simple explanations so beginners understand the position and improve.

## CORE RULE
**Stockfish decides which moves are best. The AI (OpenAI API) only EXPLAINS the engine's analysis and
computed facts. It never chooses moves itself.**

## Stack
- `frontend/`: React + Vite + TypeScript, chess.js (rules), react-chessboard v5 (board; uses the `options` prop),
  Stockfish WASM (stockfish.js) in a Web Worker (Step 2).
- `backend/`: small Node/Express (TypeScript, run with tsx) for AI calls via the official `openai` and `@anthropic-ai/sdk` SDKs (Step 5; Claude added later).
  Secrets live in `backend/.env` (gitignored); see `.env.example`. The browser never sees the key.
- Vite dev server proxies `/api` to the backend on :3001.

## Commands
- `npm run install:all`, `npm run dev` (backend :3001 + frontend :5173 together), `npm run dev:frontend`, `npm run dev:backend`,
  `npm test` (frontend + backend tests), `npm run typecheck`, `npm run build`. Needs Node >= 22.12.

## Working style
Build ONE step at a time. After each step: run, test, tell the user what to check, wait for OK.

## Step progress
- [x] Step 1: Setup and board (board, move list, undo/redo, flip, reset, PGN/FEN load) — approved
- [x] Step 2: Stockfish engine (lite single-threaded WASM, depth 16, MultiPV 3, eval bar, plain-words eval, top 3 lines, green best-move arrow, mate scores, stop-on-change, on/off toggle) — approved
- [x] Step 3: Move classification (badges in move list, better move shown, accuracy % + counts per side, basic "Analyze game" button) — approved
- [x] Step 4: Position facts and threats (unit-tested; facts panel, Your/Opponent's threats lists, red/orange highlights, Show threat button + X key) — approved
- [x] Step 5: AI explanations (OpenAI via /api/explain, provider interface, structured outputs, coach panel with loading/cache/errors) — approved
- [x] Step 6: Big Picture overview (same /api/explain response; Overview tab; Simple/Detailed toggle; code-computed purpose tags; engine line story) — approved
- [x] Step 7: Speed and polish (Lichess cloud eval + local fallback, analyze full game + key moments/graph, error handling, README, final review) — awaiting user OK

## Notes
- Game model is `frontend/src/lib/game.ts` (pure, tested). Playing from mid-game replaces later moves.
  Promotion auto-queens (Step 1 simplification).
- Shortcuts: ← / → undo/redo, F flip. (X reserved for "show threat" in Step 4.)

## Engine notes (Step 2)
- `stockfish` npm package (GPL-3.0). `frontend/scripts/copy-engine.mjs` copies the 1.8 MB lite single-threaded build
  into `frontend/public/engine/` (gitignored) on install/dev/build. Single-threaded = no COOP/COEP headers needed.
- `lib/engine.ts`: UCI wrapper; one search at a time; a new request sends `stop` and starts only after the old `bestmove`.
- `lib/uci.ts`: pure, tested helpers. Scores are always stored from **White's point of view** (flipped from the engine's
  side-to-move view). Step 3 classification must convert to the mover's view.
- `lib/useEngine.ts`: hook; finished analyses cached per position (first 4 FEN fields).

## Classification notes (Step 3)
- `lib/classify.ts` (pure, tested). Loss = mover's eval before (engine top line) minus eval after, in centipawns from the
  **mover's** point of view; scores capped at ±1000 so being "more winning" is never a loss. Best = engine top move;
  <50 Good, 50-<100 Inaccuracy, 100-200 Mistake, >200 Blunder. Missed mate = mover had a forced mate and no longer does.
- If the played move is among the engine's MultiPV lines, that line's score is used for "after" (same search, like-for-like);
  otherwise the analysis of the resulting position is used. Checkmate/stalemate after a move is scored without the engine.
- Accuracy per move = f(drop in win%) (logistic win% curve); side accuracy = mean over rated moves.
- `lib/analysisStore.ts`: shared cache of finished analyses; ratings are derived from it, so they appear as analyses finish.
- `lib/gameAnalysis.ts`: sequential batch ("Analyze game"); pauses the live-position hook while running. Engine `stop(id)`
  only cancels the caller's own job. Step 7 should add: jump-to-blunders, nicer progress.

## Facts & threats notes (Step 4)
- `lib/facts.ts` (pure, tested): phase, material, hanging / attacked-by-lower pieces, forks, pins, skewers, checks, mate-in-1,
  king safety, center control, undeveloped minors, pawn structure, open/half-open files, weak squares (holes), last-move type.
  `analyzePosition(fen, last?)` returns `PositionFacts`; Step 5 sends this (plus engine data) to the AI.
- Tactics for the side NOT to move are found by flipping the turn in the FEN (`positionWithTurn`); skipped (`available: false`)
  when the side to move is in check, like Lichess "show threat". Pins/skewers are pure geometry (turn independent).
- Fork rule: a legal move whose piece is safe on arrival and attacks >=2 targets (king, or a piece worth more than the forker,
  or an undefended piece worth >=3). Relative pin: front piece (>=3) in front of a more valuable one; skewer: valuable front piece
  (king/>=5) with a >=3 piece behind.
- `lib/threats.ts`: `buildThreatLists(facts, me)` ("me" = the side at the bottom of the board), `highlightSquares` (red = my piece
  in danger, orange = enemy piece I attack), `threatFen`, `evaluateThreat` (swing > 100cp from the threatener's view = "Serious threat").
- `lib/useThreat.ts`: engine "Show threat"; waits until the real position is analysed (needs it for the swing), then analyses the
  flipped FEN through the same engine (job-id stop, so it never cancels someone else's search). X key toggles it.
- `lib/factsText.ts`: plain-words lines for the Position facts panel.

## AI explanation notes (Step 5)
- Setup: `cp .env.example backend/.env`, set `OPENAI_API_KEY` and `OPENAI_MODEL` (no default model on purpose), restart the backend.
  `backend/src/env.ts` loads `backend/.env` then repo-root `.env`; empty env vars count as unset. `.env` is gitignored.
- `backend/src/ai/provider.ts`: `AIProvider.complete({system,user,schema}) -> JSON string`; `createProvider()` switches on
  `AI_PROVIDER`. To add a provider: implement the interface, add a `case`. `openai.ts` uses chat completions + `json_schema`
  structured outputs (strict) and maps SDK errors to friendly `AIError`s (bad_key, no_credit, rate_limit, bad_model, ...).
- `ai/explain.ts` = prompt -> provider -> `parseExplanation` -> **guard** (`ai/guard.ts`): any move the AI writes (Nf3, exd5, O-O)
  must already appear in the data we sent, else one retry, then an error. This enforces the CORE RULE in code.
- System prompt is verbatim from the spec (`ai/prompt.ts`); data conventions live in the user message. Response JSON:
  `moveExplanation, lastMoveFeedback, threats, lesson`. Step 6 extends the schema (same endpoint).
- `ai/validate.ts` whitelists/limits the request body. Types are mirrored in `frontend/src/lib/explainTypes.ts` (keep in sync).
- Frontend: `lib/explainPayload.ts` builds the request from engine lines + classification + facts + threat lists (all computed);
  `lib/useExplanation.ts` caches per position/move/viewer; the Coach panel only explains after the engine finishes (button, so no
  surprise API spend). Browser only ever calls `/api/explain`.
- Testing without a key: backend tests use a mock OpenAI HTTP server; set `OPENAI_BASE_URL` to point at any compatible server.

## UI layout notes (design pass after Step 5)
- App-style shell: `.app` = top bar + `.workspace`. >=900px the page fits the window (no page scroll): board sized by
  `--board-size` (height-limited), one right-hand `.panel` = compact `EnginePanel` (score chip, words, depth bar, 3 one-line
  lines, on/off switch) + `Tabs` + `.tab-body`. >=1400px the move list is its own column; below that "Moves" is the first tab.
  <900px everything stacks and the page scrolls.
- Tabs: Moves (narrow only), Coach, Threats (red dot when your pieces are in danger), Facts, Summary, Load. New features
  (Step 6 "Big Picture") should be added as a tab in `App.tsx` (`tabs` + `switch (activeTab)`), not as another stacked card.
- Styling: design tokens in `:root` + dark mode via `prefers-color-scheme` in `styles.css`; board is soft blue-grey so the
  green (best) / red (threat) arrows and yellow last-move highlight contrast. Reusable classes: `.btn(.primary/.ghost/.small/.wide)`,
  `.callout(.error/.ok/.warn/.danger)`, `.badge`, `.empty-state`.

## Choosing the AI: OpenAI or Claude (added after Step 7)
- Both providers sit behind `AIProvider`: `ai/openai.ts` (chat completions + strict `json_schema`) and `ai/anthropic.ts` (Messages API,
  `output_config.format` json_schema; reads only `text` blocks; `stop_reason` refusal / max_tokens map to friendly errors).
  Config: `OPENAI_API_KEY`+`OPENAI_MODEL`, `ANTHROPIC_API_KEY`+`ANTHROPIC_MODEL` (no default model in code; `.env.example` suggests
  `claude-haiku-5-5`). `AI_PROVIDER` is only the default when the browser doesn't say.
- The browser sends optional `provider: 'openai' | 'anthropic'` in the `/api/explain` body; `app.ts` rejects unknown names (400) and
  calls `getProvider(name)`; `index.ts` caches one provider object per name. `/api/health` now also returns `providers: {openai, anthropic}`
  (which have keys). The same prompt, schema, parser and move guard are used for both: the CORE RULE is provider-independent.
- Frontend: `lib/aiProvider.ts` (tiny store, choice remembered in localStorage, reads `/api/health` once) + `components/ProviderPicker.tsx`
  rendered by `ExplainGate` (so on both Coach and Overview). The provider is part of the explanation cache key in `App.tsx`.
- Anthropic SDK 1.x sends the key as `Authorization: Bearer`, not `x-api-key` (the backend test accounts for it). Not yet tried against the
  live API from the sandbox: tested with a mock Anthropic server only.

## Big Picture notes (Step 6)
- One request, one response: `/api/explain` now returns `{moveExplanation,lastMoveFeedback,threats,lesson, overview}`. The Coach and
  Overview tabs share the same fetched data (`ExplainGate` handles loading/error/ask states), so asking in either tab fills both.
- `overview` = phase, whoIsBetter, plans.{white,black}, playedMove/bestMove `{tag, reason}`, story[], keyFeatures.{pawnStructure,
  openFiles,weakSquares,pieceActivity}. Every prose section is `{simple, detailed}` (1 sentence / 2-3), so the Simple/Detailed toggle is
  instant and free; the choice is remembered in localStorage (display only). Purpose `reason` is a single sentence.
- CORE RULE enforcement, in code: (1) purpose tags are computed by `frontend/src/lib/purposes.ts` (`movePurposes`: Develops, Controls
  center, Attacks, Defends, Creates threat, Trades, King safety, Prepares plan, Sets trap) and sent as candidates with notes
  ("Attacks: attacks the rook on a8"); the backend coerces any other tag to the first candidate; "None" when there is no move.
  (2) Story moves come from the engine's top line (`topLine.plies`); the AI only writes the words, the backend zips them to the moves
  and requires exactly one step per ply. (3) The move guard scans every string in the overview, retrying once then erroring.
- `facts.ts` gained piece activity (mobility-based active/passive pieces) and exports `HOME_SQUARES`; `factLines` mentions it.
- "Sets trap" = bait: after the move the opponent has a capture after which the mover has mate in one (`setsTrap`).
- Cost note: the overview roughly doubles the response size (both versions of each text). If latency/cost matters, add an `include`
  flag to the request and split Coach/Overview into separate calls.

## Speed & polish notes (Step 7)
- **Lichess Cloud Eval** (`lib/cloudEval.ts`): public API only (`GET https://lichess.org/api/cloud-eval?fen=..&multiPv=3`, called straight
  from the browser). Scores are assumed to be from White's point of view; castling given as king-takes-rook is rewritten to e1g1 style.
  Politeness: token bucket (burst 3, ~1 request/s), HTTP 404 = unknown position (remembered, never re-asked), HTTP 429 = pause 65 s,
  3 failures in a row = pause 5 min. Requests are never queued: if no token is free we skip the cloud and use the local engine.
  User toggle ("Lichess cloud" chip, remembered in localStorage) turns it off completely. **Not verified against the live API from the
  dev sandbox (lichess.org was blocked there); verified with intercepted responses.** If the cloud eval ever looks backwards, check the sign.
- `lib/evaluate.ts` = the single entry point for evaluating a position: cloud lookup first; local Stockfish starts immediately on a miss/
  skip/error, or after 700 ms if Lichess is slow (whichever finishes first wins; the loser is cancelled). Used by `useEngine`,
  `useThreat` and the batch (`gameAnalysis.ts`). `analysisStore` remembers each result's `source` ('cloud' | 'local').
- **Analyze full game**: batch runs through `evaluatePosition` (reports how many positions came from the cloud). `lib/keyMoments.ts`:
  key moments = blunders, mistakes, missed mates; `[` / `]` jump between them; `EvalGraph` (click to jump). "Load and analyze" button.
- **Error handling**: engine worker crash / startup timeout (20 s) reports to every waiting job (`onError`), so nothing hangs, the panel
  shows "Try again"; Lichess failures fall back silently (status note under the engine lines); bad PGN messages name the exact move
  (`diagnosePgn` in `game.ts`), accept `0-0`, load the first game of a multi-game file (+ notice bar), 200k-char cap; React `ErrorBoundary`.
- `engine.stop(id)` no longer sends a second `stop` to a search that was already told to stop.
- README.md documents setup, `.env`, running, troubleshooting. `scripts/dev.mjs` runs both servers by launching Node directly (vite / tsx),
  with no npm and no shell: an earlier version used `shell: true` on Windows and broke when the project path contained a space.
- **Repo hygiene lesson:** the inherited Python `.gitignore` had `lib/`, which silently ignored all of `frontend/src/lib` (it is now
  anchored as `/lib/`). Before calling a step done, verify with a fresh `git clone` of the remote: `npm run install:all && npm test &&
  npm run typecheck && npm run build` (this is how it was found).
- Known limitation: a game analysed partly from the Lichess cloud (deep, ~depth 40) and partly locally (depth 16) can produce slightly
  noisy ratings where the two sources meet, because a move's "before" and "after" evals may come from different searches. Moves that
  appear in the same MultiPV result are compared like-for-like. Turn the cloud chip off for fully consistent ratings.
