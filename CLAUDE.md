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
- `backend/`: small Node/Express (TypeScript, run with tsx) for AI calls via the official `openai` SDK (Step 5).
  Secrets live in `backend/.env` (gitignored); see `.env.example`. The browser never sees the key.
- Vite dev server proxies `/api` to the backend on :3001.

## Commands
- `npm run install:all`, `npm run dev:frontend` (:5173), `npm run dev:backend` (:3001), `npm test` (frontend + backend tests).

## Working style
Build ONE step at a time. After each step: run, test, tell the user what to check, wait for OK.

## Step progress
- [x] Step 1: Setup and board (board, move list, undo/redo, flip, reset, PGN/FEN load) — approved
- [x] Step 2: Stockfish engine (lite single-threaded WASM, depth 16, MultiPV 3, eval bar, plain-words eval, top 3 lines, green best-move arrow, mate scores, stop-on-change, on/off toggle) — approved
- [x] Step 3: Move classification (badges in move list, better move shown, accuracy % + counts per side, basic "Analyze game" button) — approved
- [x] Step 4: Position facts and threats (unit-tested; facts panel, Your/Opponent's threats lists, red/orange highlights, Show threat button + X key) — approved
- [x] Step 5: AI explanations (OpenAI via /api/explain, provider interface, structured outputs, coach panel with loading/cache/errors) — awaiting user OK
- [ ] Step 6: Big Picture overview
- [ ] Step 7: Speed and polish (Lichess cloud eval, analyze full game, README)

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
