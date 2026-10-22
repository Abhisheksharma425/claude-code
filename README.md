# Chess Analyser

A beginner-friendly chess analyser that runs in your browser. Play moves or load a game, and the app shows the
best move, threats, a rating for every move, and short plain-English explanations so you can understand the
position and improve.

> **The one rule:** Stockfish decides which moves are best. The AI (OpenAI) only *explains* the engine's analysis
> and facts the code computed. It never chooses a move, and the backend rejects any answer that mentions a move
> that wasn't in the data it was given.

## What it does

| | |
|---|---|
| **Board** | Drag pieces (legal moves only), click any move in the list to jump, undo/redo, flip, new game. Load a game from a PGN or a position from a FEN. Works on phones. |
| **Engine** | Stockfish 19 (WebAssembly, in a Web Worker): depth 16, top 3 lines, eval bar, evaluation in plain words ("White is slightly better"), green best-move arrow, mate scores. |
| **Move ratings** | Best / Good / Inaccuracy / Mistake / Blunder / Missed mate for every move, from the mover's point of view, with the better move shown. Accuracy % and counts per side. |
| **Analyze full game** | Rates the whole game, draws an evaluation graph, and lists the key moments (blunders, mistakes, missed mates) you can click to jump to. |
| **Facts & threats** | Computed in code (not by the AI): game phase, material, hanging pieces, forks, pins, skewers, checks, mate in one, king safety, pawn structure, open files, weak squares. "Your threats" and "Opponent's threats" lists, with red/orange highlights on the board. |
| **Show threat** (`X`) | Like Lichess: gives the opponent a free move and asks Stockfish what it would play (red arrow). Labelled "Serious threat" if it swings the evaluation by more than 1 pawn. |
| **Coach** (AI) | A short explanation of the best move, your last move, the threats, and one lesson. |
| **Overview** (AI) | The big picture: game phase, who is better and why, each side's plan, what the played and best moves are *for* (Develops, Controls center, Attacks, ...), the engine's line told as a story, and key features. Simple / Detailed toggle. |
| **Lichess cloud eval** | For positions other people have already analysed, results come from Lichess's free public API instantly. Everything else (and any failure) falls back to local Stockfish. |

## Requirements

- **Node.js 22.12 or newer** (and npm). Check with `node -v`.
- A modern browser (Chrome, Edge, Firefox, Safari) with WebAssembly. No special server headers are needed.
- *Optional:* an [OpenAI API key](https://platform.openai.com/api-keys) for the Coach and Overview tabs. Everything
  else (board, engine, ratings, facts, threats) works without one.

## Setup

```bash
git clone <this repository>
cd <the folder>

npm run install:all        # installs the frontend and the backend
```

`install:all` also copies the Stockfish engine files into `frontend/public/engine/` (about 2 MB).

### Add your OpenAI API key (for Coach and Overview)

```bash
cp .env.example backend/.env
```

Then open `backend/.env` and fill in two lines:

```ini
OPENAI_API_KEY=sk-...your key...
OPENAI_MODEL=<a current OpenAI chat model that supports structured outputs>
```

- Pick the model yourself from OpenAI's current model list. A smaller, cheaper model is fine for this: the AI is
  only putting the engine's analysis into words.
- The file `backend/.env` is ignored by git, and the key stays on the backend. The browser never sees it. (A `.env`
  in the repository root works too.)
- Restart the backend after changing the file. When it starts you'll see `AI: ready`, or a message saying what's missing.

## Run it

```bash
npm run dev
```

This starts the backend on <http://localhost:3001> and the app on **<http://localhost:5173>**. Open the second one.
Press `Ctrl+C` to stop both.

You can also run them separately in two terminals: `npm run dev:backend` and `npm run dev:frontend`.

To try a production build: `npm run build`, then `npm --prefix frontend run preview` (keep the backend running).

## Using the app

1. Drag a piece, or open the **Load** tab and paste a PGN or FEN (or press **Try an example**).
2. The engine starts automatically. The right-hand panel shows the evaluation and the top 3 lines.
3. Open **Summary** and press **Analyze full game** (or use **Load and analyze**) to rate every move.
   Click a key moment, or press `]` / `[`, to jump between blunders.
4. Open **Coach** or **Overview** and press the button to get an AI explanation. One request fills both tabs.

**Keyboard shortcuts**

| Key | Action |
|---|---|
| `←` / `→` | Previous / next move |
| `F` | Flip the board |
| `X` | Show / hide the opponent's threat |
| `[` / `]` | Previous / next key moment (blunder, mistake, missed mate) |

## Lichess cloud evaluations and privacy

When the engine is on, the app asks Lichess's public Cloud Eval API about the position on screen (just the position,
no personal data). It sends at most about one request per second and pauses for a minute if Lichess says it's busy
(HTTP 429), or for a few minutes if it can't be reached. If Lichess doesn't know a position, local Stockfish
answers instead. Only the public HTTP API is used, none of Lichess's code.

You can switch it off with the **Lichess cloud** button under the engine lines. Then every position stays on your computer.

## Troubleshooting

| Problem | What to do |
|---|---|
| **"The engine couldn't run" / the engine never starts** | Reload the page and press *Try again*. The engine is WebAssembly in a Web Worker; some privacy extensions or very old browsers block that. Check that `frontend/public/engine/` contains two `stockfish-19-lite-single` files (run `npm run install:all` again if not). |
| **"Can't reach the AI backend"** | The backend isn't running. Use `npm run dev`, or `npm run dev:backend` in another terminal. |
| **"The AI isn't set up yet"** | `backend/.env` is missing `OPENAI_API_KEY` or `OPENAI_MODEL`. Add them and restart the backend. |
| **"OpenAI rejected the API key"** | The key is wrong, revoked, or from another project. Check `OPENAI_API_KEY`. |
| **"Your OpenAI account has no credit left"** | Add credit or a payment method at platform.openai.com. |
| **"... rate limit"** | You're sending requests too fast. Wait a moment and try again. |
| **"OpenAI doesn't know the model ..."** | Check the spelling of `OPENAI_MODEL`, and that your key can use it. |
| **"couldn't process the request ... structured outputs"** | The model you chose doesn't support JSON-schema structured outputs. Pick a current chat model that does. |
| **The AI's answer was thrown away** | The AI mentioned a move Stockfish never suggested, or left parts out. The app already retried once. Press the button again. |
| **A PGN won't load** | The message names the exact move that isn't legal (for example "Move 5. Qh8 isn't legal in that position"). Check for a typo or a missing move before it. PGNs with several games load the first game. `0-0` and `O-O` are both accepted. |
| **Cloud evals look wrong or backwards** | Turn off *Lichess cloud* and compare: the local engine is the reference. Please report it. |
| **Port already in use** | Something else is on 3001 or 5173. Stop it, or set `PORT` in `backend/.env` (and change the proxy target in `frontend/vite.config.ts`). |

## Tests and checks

```bash
npm test             # frontend (Vitest) and backend tests
npm run typecheck    # TypeScript for both packages
npm run build        # production build of the frontend
```

The tests cover the pure logic: rules and PGN/FEN parsing, move classification, every position fact and threat,
move purposes, the Lichess client and its rate limiting, the engine wrapper (with a fake worker), the batch runner,
the AI prompt, validation and the "no invented moves" guard, and the backend's HTTP API (with a mock OpenAI server).
No test needs a real API key or network access.

## How it fits together

```
frontend/  React + Vite + TypeScript
  src/lib/        pure, tested logic
    game.ts            game state, PGN/FEN parsing
    engine.ts          Stockfish worker wrapper (UCI)
    cloudEval.ts       Lichess Cloud Eval client (rate limited)
    evaluate.ts        cloud first, local engine as the fallback
    classify.ts        move ratings and accuracy
    facts.ts           position facts      threats.ts   threat lists + "show threat"
    purposes.ts        why a move is played (computed, offered to the AI as the only choices)
    keyMoments.ts      blunder list and evaluation graph
    explain*.ts        builds the request for the backend
  src/components/ UI: board, engine panel, tabs
backend/   Node + Express (TypeScript)
  src/ai/         provider interface (OpenAI today), prompt, JSON schema, validation, move guard
```

- **Adding another AI provider:** implement `AIProvider` in `backend/src/ai/provider.ts`, add a `case` in
  `createProvider`, and set `AI_PROVIDER`.
- **The guard:** every move the AI writes must already appear in the data it was sent, the purpose tags must come
  from the list the code computed, and the engine line's moves come from Stockfish (the AI only supplies the words).

## Known limitations

- Pawn promotion always promotes to a queen.
- The engine is the small single-threaded Stockfish build (about 2 MB) so it works everywhere. It is strong, but a
  desktop Stockfish at high depth will see more.
- The AI explanations depend on the model you choose and can be slower or costlier with larger models.
- Several games in one PGN: only the first is loaded.

## Licenses

The code in this repository is MIT licensed (see `LICENSE`). It uses
[stockfish.js](https://github.com/nmrugg/stockfish.js), which is **GPL-3.0**: if you publish a build of this app
you must comply with the GPL for the engine files. Lichess's data comes from its public API, used according to
Lichess's terms.
