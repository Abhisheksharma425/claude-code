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
- `npm run install:all`, `npm run dev:frontend` (:5173), `npm run dev:backend` (:3001), `npm test`.

## Working style
Build ONE step at a time. After each step: run, test, tell the user what to check, wait for OK.

## Step progress
- [x] Step 1: Setup and board (board, move list, undo/redo, flip, reset, PGN/FEN load) — approved
- [x] Step 2: Stockfish engine (lite single-threaded WASM, depth 16, MultiPV 3, eval bar, plain-words eval, top 3 lines, green best-move arrow, mate scores, stop-on-change, on/off toggle) — approved
- [x] Step 3: Move classification (badges in move list, better move shown, accuracy % + counts per side, basic "Analyze game" button) — awaiting user OK
- [ ] Step 4: Position facts and threats (unit-tested)
- [ ] Step 5: AI explanations (OpenAI, provider interface)
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
