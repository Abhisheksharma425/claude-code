const MAX_FILE_BYTES = 1_000_000
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i
const WRONG_KIND = /\.(pdf|docx?|zip|rar|7z|exe|mp4|mov)$/i

/** Why a chosen file can't be loaded, or null if it's worth trying. Only plain-text PGN/FEN files are read. */
export function gameFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.type.startsWith('image/') || IMAGE.test(file.name)) {
    return "That's a picture. I can only read game files in text form (.pgn). Export the game as PGN from chess.com or Lichess and upload that."
  }
  if (WRONG_KIND.test(file.name)) return 'I can only read PGN game files (.pgn or .txt).'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_FILE_BYTES) return 'That file is too big (over 1 MB). Upload a single game, or a smaller PGN file.'
  return null
}
