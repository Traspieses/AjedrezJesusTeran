import { Square, Move } from 'chess.js';

export enum PlayerType {
  HUMAN = 'HUMAN',
  AI = 'AI'
}

export enum Difficulty {
  EASY = 'EASY', // Depth 8, high randomness in top 3
  NORMAL = 'NORMAL', // Depth 15, strict Capablanca heuristics
  MASTER = 'MASTER' // Depth 22, Perfect play
}

export interface EngineAnalysis {
  bestMove: string;
  ponder?: string;
  evaluation: number; // centipawns
  mate?: number; // moves to mate
  depth: number;
  lines: Array<{
    move: string;
    score: number;
    pv: string;
  }>;
}

export interface GameState {
  fen: string;
  turn: 'w' | 'b';
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
  draw: boolean;
  history: string[]; // PGN array
  lastMove: { from: Square; to: Square } | null;
  captured: { w: string[]; b: string[] };
}

export interface MoveAdvice {
  uci: string;
  san: string;
  score: number;
  reason: string;
}

export interface DailyKnowledge {
  lastUpdated: string;
  analyzedGames: number;
  favoriteOpenings: string[];
}

export interface SavedGame {
  id: string;
  date: string;
  pgn: string;
  fen: string;
}