import { Chess } from 'chess.js';

const DB_NAME = 'CapablancaDB';
const STORE_NAME = 'positions';
const DB_VERSION = 1;

// URL to Capablanca's games
// Note: Direct access might be blocked by CORS depending on the browser/host. 
// We use a CORS proxy concept or fallback to a hardcoded set if fetch fails.
const PGN_URL = 'https://www.pgnmentor.com/players/Capablanca.pgn';

interface PatternData {
  fen: string; // Key (normalized)
  moves: Record<string, number>; // { 'e4': 10, 'd4': 2 }
  total: number;
}

// Open IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fen' });
      }
    };
  });
};

// Normalize FEN to increase pattern matching hits (remove halfmove/fullmove clocks)
const normalizeFen = (fen: string): string => {
  return fen.split(' ').slice(0, 4).join(' ');
};

// Get pattern for a specific position
export const getPatternForFEN = async (fen: string): Promise<PatternData | null> => {
  try {
    const db = await openDB();
    const cleanFen = normalizeFen(fen);
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(cleanFen);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    console.error("Error reading pattern:", e);
    return null;
  }
};

// Save a learned move
const learnMove = async (fen: string, moveSan: string) => {
  const db = await openDB();
  const cleanFen = normalizeFen(fen);
  
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const request = store.get(cleanFen);

  request.onsuccess = () => {
    const data: PatternData = request.result || { fen: cleanFen, moves: {}, total: 0 };
    
    // Update counts
    data.moves[moveSan] = (data.moves[moveSan] || 0) + 1;
    data.total += 1;

    store.put(data);
  };
};

// Parse a massive PGN string and learn
const processPGN = async (pgnText: string) => {
  console.log("Comenzando procesamiento de PGN Capablanca...");
  
  // Split games roughly by Event tag to avoid loading entire file into chess.js at once
  // This is a naive split, but effective for standard PGNs
  const games = pgnText.split('[Event "');
  
  // Process a subset to avoid freezing UI (e.g., first 50 or random ones if we want)
  // Or use a WebWorker in a full prod app. Here we iterate with a slight delay or just batch.
  let learnedCount = 0;

  for (const gameChunk of games) {
    if (!gameChunk.trim()) continue;
    
    const fullPgn = '[Event "' + gameChunk; // Re-add tag
    const tempGame = new Chess();
    
    try {
      tempGame.loadPgn(fullPgn);
      
      // Replay and learn
      const replayGame = new Chess();
      const history = tempGame.history();
      
      for (const move of history) {
        const currentFen = replayGame.fen();
        await learnMove(currentFen, move);
        replayGame.move(move);
      }
      learnedCount++;
    } catch (e) {
      // invalid game chunk, skip
    }
  }
  
  console.log(`Aprendizaje completado. Analizadas ${learnedCount} partidas.`);
};

// Main entry point for Daily Update
export const dailyUpdate = async () => {
  const LAST_UPDATE_KEY = 'capablanca_pgn_last_update';
  const today = new Date().toDateString();
  const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);

  if (lastUpdate === today) {
    console.log("Base de conocimientos de Capablanca está actualizada.");
    return;
  }

  console.log("Buscando nuevas partidas de Capablanca...");

  try {
    // Attempt fetch
    // Note: In a real browser environment, pgnmentor might block CORS.
    // If this fails, we catch it.
    const response = await fetch(PGN_URL);
    if (!response.ok) throw new Error('Fetch failed');
    const pgnText = await response.text();
    
    await processPGN(pgnText);
    localStorage.setItem(LAST_UPDATE_KEY, today);
    
  } catch (error) {
    console.warn("No se pudo descargar PGN remoto (posible CORS). Usando datos cacheados/mock.");
    // Fallback: Learn from a small hardcoded set if network fails
    const mockPGN = `
[Event "New York"]
[Site "New York, NY USA"]
[Date "1927.02.19"]
[White "Capablanca, Jose Raul"]
[Black "Nimzowitsch, Aaron"]
[Result "1-0"]
1. e4 c6 2. d4 d5 3. e5 Bf5 4. Bd3 Bxd3 5. Qxd3 e6 6. Nc3 Qb6 7. Nge2 c5 8. dxc5 Bxc5 9. O-O Ne7 10. Na4 Qc6 11. Nxc5 Qxc5 12. Be3 Qc7 13. f4 Nf5 14. c3 Nc6 15. Rad1 g6 16. g4 Nxe3 17. Qxe3 Qb6 18. Qxb6 axb6 19. a3 h5 20. h3 hxg4 21. hxg4 Ke7 22. Kg2 Rh4 23. Kg3 Rah8 24. Ng1 Rh2 25. Rb1 Rc2 26. Rf2 Rxf2 27. Kxf2 Rh2+ 28. Kg3 Rd2 29. Nf3 Rd3 30. Kf2 d4 31. c4 Rb3 32. Nd2 Rh3 33. Nf3 d3 34. Rd1 Na5 35. Rxd3 Nxc4 36. Rb3 Kd7 37. Rb4 Na5 38. Rxb6 Kc7 39. Rb4 Nc6 40. Rb5 Rh1 41. Ng5 Rh4 42. Kg3 Rh1 43. Nxf7 Rd1 44. Nd6 b6 45. Nc4 Rd3+ 46. Kh4 Rd4 47. b3 Rxf4 48. Kg5 Re4 49. Rxb6 Rxc4 50. bxc4 Kxb6 51. Kxg6 Nxe5+ 52. Kf6 Nxg4+ 53. Kxe6 Kc5 54. a4 Kxc4 55. a5 Kb5 56. a6 Kb6 57. a7 Kb7 58. a8=Q+ Kxa8 1-0

[Event "World Championship 11th"]
[Site "Buenos Aires"]
[Date "1927.09.16"]
[Round "1"]
[White "Capablanca, Jose Raul"]
[Black "Alekhine, Alexander"]
[Result "0-1"]
1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. exd5 exd5 5. Bd3 Nc6 6. Ne2 Nge7 7. O-O Bg4 8. f3 Bh5 9. a3 Bd6 10. Qe1 Bg6 11. Bf4 Bxf4 12. Nxf4 Bxd3 13. Nxd3 O-O 14. Qf2 Nf5 15. Ne2 Qf6 16. c3 Rfe8 17. Rae1 Rad8 18. Ng3 Nxg3 19. Qxg3 Qd6 20. Qxd6 cxd6 21. Kf2 Kf8 22. Nf4 Ne7 23. h4 h6 24. h5 Rc8 25. g4 Rc6 26. Re2 Rb6 27. Rfe1 Rb5 28. Kg1 a5 29. Kf1 a4 30. Kg1 Rb3 31. Nxd5 0-1
`;
    await processPGN(mockPGN);
    // Still mark as updated so we don't retry every reload on failure
    localStorage.setItem(LAST_UPDATE_KEY, today);
  }
};