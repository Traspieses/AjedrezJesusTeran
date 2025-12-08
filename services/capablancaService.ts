import { Chess, Move } from 'chess.js';
import { Difficulty, EngineAnalysis, MoveAdvice } from '../types.ts';
import { CAPABLANCA_OPENINGS } from '../constants.ts';
import { getPatternForFEN } from './pgnLearningService.ts';

/**
 * The "Soul" of the machine.
 * Filters Stockfish moves to find the one most like Capablanca.
 */
export const getCapablancaMove = async (
  chess: Chess, 
  analysis: EngineAnalysis, 
  difficulty: Difficulty
): Promise<string> => {
  const fen = chess.fen();
  const validMoves = chess.moves({ verbose: true });
  
  // 1. Opening Book (Hardcoded Knowledge Base)
  const bookMoves = CAPABLANCA_OPENINGS[fen];
  if (bookMoves && bookMoves.length > 0) {
    const chance = difficulty === Difficulty.EASY ? 0.5 : 0.8;
    if (Math.random() < chance) {
      const selected = bookMoves[Math.floor(Math.random() * bookMoves.length)];
      const move = validMoves.find(m => m.from + m.to === selected);
      if (move) return selected;
    }
  }

  // 2. Real Capablanca Patterns (IndexedDB Learning)
  const learnedPattern = await getPatternForFEN(fen);
  
  if (learnedPattern && learnedPattern.total > 0) {
    // Sort moves by frequency
    const bestLearnedMove = Object.entries(learnedPattern.moves)
      .sort(([, a], [, b]) => b - a)[0]; // [San, count]
    
    if (bestLearnedMove) {
      const [moveSan, count] = bestLearnedMove;
      const frequency = count / learnedPattern.total;
      
      // If he played it often enough
      if (frequency > 0.3 || count > 2) {
        console.log(`Capablanca Style Match: Played ${moveSan} ${count} times.`);
        const moveObj = validMoves.find(m => m.san === moveSan);
        
        if (moveObj) {
           // In "Master", trust Capablanca. In "Normal", verify not a blunder.
           if (difficulty === Difficulty.MASTER) return moveObj.from + moveObj.to;
           if (analysis.evaluation > -150) {
             return moveObj.from + moveObj.to;
           }
        }
      }
    }
  }

  // 3. Endgame Superiority
  const isWinning = analysis.evaluation > 100;
  if (isWinning) {
    return analysis.bestMove;
  }

  // 4. Positional Logic vs Tactical Complications (Easy Mode randomness)
  if (difficulty === Difficulty.EASY) {
    if (Math.random() < 0.2 && validMoves.length > 1) {
      const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
      return randomMove.from + randomMove.to;
    }
  }

  return analysis.bestMove;
};

/**
 * Generates concrete, specific chess advice based on the move properties.
 */
export const generateAdvice = (chess: Chess, analysis: EngineAnalysis): MoveAdvice[] => {
  const bestMove = analysis.bestMove;
  if (!bestMove) return [];

  // Get the move object to analyze details (piece, color, flags, captured, etc)
  const moves = chess.moves({ verbose: true });
  const moveObj = moves.find(m => m.from + m.to === bestMove);
  const san = moveObj ? moveObj.san : bestMove;

  // Helper to generate the text
  const reasoning = getConcreteReasoning(chess, moveObj, analysis);

  return [
    {
      uci: bestMove,
      san: san,
      score: analysis.evaluation / 100,
      reason: reasoning
    }
  ];
};

/**
 * Generates a critique of a move played in the past compared to the best engine move.
 */
export const generateCritique = (
  chessBeforeMove: Chess, 
  movePlayedSan: string, 
  analysis: EngineAnalysis
): MoveAdvice[] => {
  const bestMoveUCI = analysis.bestMove;
  const bestMoveSan = analysis.lines[0]?.pv.split(' ')[0] || ''; // Rough conversion or use logic
  
  // Find the move object for the move actually played
  const moves = chessBeforeMove.moves({ verbose: true });
  const playedMoveObj = moves.find(m => m.san === movePlayedSan);
  
  // Find the move object for the best move
  const bestMoveObj = moves.find(m => m.from + m.to === bestMoveUCI);
  
  const movePlayedUCI = playedMoveObj ? playedMoveObj.from + playedMoveObj.to : '';

  let critique = "";
  let scoreDisplay = analysis.evaluation / 100;

  // Case 1: The move played IS the best move (or very close)
  if (movePlayedUCI === bestMoveUCI) {
     critique = "¡Excelente! Una jugada precisa, digna de una máquina. Mantiene la armonía y la iniciativa.";
  } else {
    // Determine how "bad" it was based on difference? 
    // Since we don't have the eval of the *played* move without re-analyzing, 
    // we assume if it differs from Best Move, it's suboptimal.
    // In a real full engine implementation, we'd check the eval loss.
    
    // Heuristic based on piece type
    if (playedMoveObj?.captured) {
      critique = `Interesante captura, aunque ${bestMoveObj?.san} parecía posicionalmente superior.`;
    } else if (playedMoveObj?.piece === 'k') {
      critique = "Movimiento de rey algo pasivo. Cuidado con la seguridad.";
    } else if (playedMoveObj?.piece === 'p') {
      critique = `Avance de peón sólido, pero ${bestMoveObj?.san} controlaba mejor el centro.`;
    } else {
      critique = `Una alternativa jugable, aunque la precisión de ${bestMoveObj?.san || bestMoveUCI} era preferible según mi cálculo.`;
    }
  }

  return [{
    uci: movePlayedUCI,
    san: movePlayedSan,
    score: scoreDisplay,
    reason: critique
  }];
};

/**
 * logic to determine specific reasons for a move
 */
const getConcreteReasoning = (chess: Chess, move: Move | undefined, analysis: EngineAnalysis): string => {
  if (!move) return "Mejora la posición general.";

  const isCheck = move.san.includes('+');
  const isCapture = !!move.captured;
  const isPromotion = !!move.promotion;
  const isCastling = move.san.includes('O-O');
  const piece = move.piece; // p, n, b, r, q, k
  const to = move.to;
  
  // 1. Forced Mate
  if (analysis.mate) {
    return `Mate forzado en ${Math.abs(analysis.mate)} jugadas. No hay defensa.`;
  }

  // 2. Winning huge material
  if (analysis.evaluation > 500 && !move.san.includes('#')) {
    return "Gana material decisivo (probablemente una torre o dama).";
  }

  // 3. Tactical Captures
  if (isCapture) {
    const capturedPiece = move.captured === 'p' ? 'peón' : 
                          move.captured === 'n' ? 'caballo' :
                          move.captured === 'b' ? 'alfil' :
                          move.captured === 'r' ? 'torre' : 'dama';
    
    // Recapture logic check (simplistic)
    const history = chess.history({ verbose: true });
    const lastMove = history.length > 0 ? history[history.length - 1] : null;
    if (lastMove && lastMove.to === move.to) {
      return `Recaptura el ${capturedPiece} y mantiene el equilibrio material.`;
    }
    return `Gana un ${capturedPiece} expuesto o realiza un cambio favorable.`;
  }

  // 4. Checks
  if (isCheck) {
    return "Jaque intermedio que obliga al rey a moverse y rompe su coordinación.";
  }

  // 5. Castling
  if (isCastling) {
    return "Pone al rey en seguridad y conecta las torres.";
  }

  // 6. Promotion
  if (isPromotion) {
    return "Corona el peón para obtener una nueva Dama. Ventaja decisiva.";
  }

  // 7. Piece Specific Development & Positioning
  
  // Center Control
  const centerSquares = ['d4', 'd5', 'e4', 'e5'];
  const isCenter = centerSquares.includes(to);

  if (piece === 'p') {
    if (isCenter) return "Ocupa el centro del tablero y gana espacio.";
    if (to[1] === '6' || to[1] === '3') return "Refuerza la estructura de peones y controla casillas vitales.";
    if (to[1] === '7' || to[1] === '2') return "Peón pasado: avanza hacia la coronación.";
  }

  if (piece === 'n') {
    if (isCenter) return "Centraliza el caballo donde ataca 8 casillas.";
    if (to === 'f3' || to === 'f6') return "Desarrolla el caballo hacia el flanco de rey y controla el centro.";
    if (to === 'c3' || to === 'c6') return "Desarrolla el caballo presionando el centro (d4/d5).";
    return "Mejora la posición del caballo buscando puestos avanzados.";
  }

  if (piece === 'b') {
    if (move.san.includes('x')) return "Elimina una pieza defensora clave.";
    return `Desarrolla el alfil a una diagonal activa apuntando al flanco ${to[0] > 'd' ? 'de rey' : 'de dama'}.`;
  }

  if (piece === 'r') {
    if (to[1] === '1' || to[1] === '8') return "Mueve la torre a una columna (posiblemente) abierta.";
    if (to[1] === '2' || to[1] === '7') return "Coloca la torre en la séptima fila para atacar la base de peones.";
    return "Activa la torre mejorando su movilidad.";
  }

  if (piece === 'q') {
    return "Centraliza la dama o mejora su actividad ofensiva.";
  }

  if (piece === 'k') {
    if (chess.moveNumber() > 20) return "Activa el rey, pieza fundamental en el final.";
    return "Aparta al rey de una posible amenaza.";
  }

  // Default fallback if no specific rule matches
  return "Jugada profiláctica: mejora la posición y previene amenazas futuras.";
};