import { Difficulty } from './types.ts';

// Simplified Capablanca Repertoire for the opening phase
export const CAPABLANCA_OPENINGS: Record<string, string[]> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': ['e2e4', 'd2d4'], // Classic start
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': ['g1f3'], // King's Knight
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2': ['b8c6', 'd7d6'], // Defend center
};

export const DIFFICULTY_CONFIG = {
  [Difficulty.EASY]: { depth: 10, errorMargin: 50 },
  [Difficulty.NORMAL]: { depth: 15, errorMargin: 20 },
  [Difficulty.MASTER]: { depth: 20, errorMargin: 0 },
};

export const TIME_CONTROLS = [
  { label: 'Blitz 3m', value: 180, category: 'Blitz' },
  { label: 'Blitz 5m', value: 300, category: 'Blitz' },
  { label: 'Rápida 10m', value: 600, category: 'Rápida' },
  { label: 'Rápida 30m', value: 1800, category: 'Rápida' },
  { label: 'Clásica 90m', value: 5400, category: 'Clásica' },
  { label: 'Sin Límite', value: -1, category: 'Entrenamiento' },
];

export const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0
};

export const INITIAL_KNOWLEDGE_BASE = {
  lastUpdated: new Date().toISOString(),
  analyzedGames: 583, // Number of known Capablanca games
  favoriteOpenings: ['Ruy Lopez', 'Queen\'s Gambit Declined', 'Caro-Kann']
};

export const SOUNDS = {
  MOVE: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/default/move-self.mp3',
  CAPTURE: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/default/capture.mp3',
  CHECK: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/default/move-check.mp3',
  NOTIFY: 'https://images.chesscomfiles.com/chess-themes/sounds/_common/default/notify.mp3',
};