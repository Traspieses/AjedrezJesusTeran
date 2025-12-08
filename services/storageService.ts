import { Chess } from 'chess.js';
import { DailyKnowledge, SavedGame } from '../types.ts';
import { INITIAL_KNOWLEDGE_BASE } from '../constants.ts';

const DB_KEY = 'capablanca_chess_db';
const SAVED_GAMES_KEY = 'capablanca_saved_games';

export const getDailyKnowledge = (): DailyKnowledge => {
  const stored = localStorage.getItem(DB_KEY);
  if (!stored) {
    return INITIAL_KNOWLEDGE_BASE;
  }
  return JSON.parse(stored);
};

export const updateKnowledgeBase = (): DailyKnowledge => {
  const current = getDailyKnowledge();
  const today = new Date().toDateString();
  const lastUpdate = new Date(current.lastUpdated).toDateString();

  if (today !== lastUpdate) {
    const updated: DailyKnowledge = {
      lastUpdated: new Date().toISOString(),
      analyzedGames: current.analyzedGames + Math.floor(Math.random() * 5),
      favoriteOpenings: current.favoriteOpenings
    };
    localStorage.setItem(DB_KEY, JSON.stringify(updated));
    return updated;
  }

  return current;
};

export const getSavedGames = (): SavedGame[] => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_GAMES_KEY) || '[]');
  } catch {
    return [];
  }
};

export const saveGameToStorage = (gameInstance: Chess): SavedGame => {
  const games = getSavedGames();
  const newGame: SavedGame = {
    id: Date.now().toString(),
    date: new Date().toLocaleString(),
    pgn: gameInstance.pgn(),
    fen: gameInstance.fen()
  };
  
  // Keep last 20 games
  const updatedGames = [newGame, ...games].slice(0, 20);
  localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(updatedGames));
  return newGame;
};