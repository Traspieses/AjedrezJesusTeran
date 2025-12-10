import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Chess, Square, Move } from 'chess.js';
import ChessBoard from './components/ChessBoard.tsx';
import EvaluationBar from './components/EvaluationBar.tsx';
import AdvicePanel from './components/AdvicePanel.tsx';
import GameTimer from './components/GameTimer.tsx';
import CapturedPieces from './components/CapturedPieces.tsx';
import { Difficulty, GameState, PlayerType, EngineAnalysis, MoveAdvice, DailyKnowledge, SavedGame } from './types.ts';
import { engine } from './services/engineService.ts';
import { getCapablancaMove, generateAdvice, generateCritique } from './services/capablancaService.ts';
import { updateKnowledgeBase } from './services/storageService.ts';
import { dailyUpdate } from './services/pgnLearningService.ts';
import { DIFFICULTY_CONFIG, SOUNDS, TIME_CONTROLS, PIECE_VALUES } from './constants.ts';

const App: React.FC = () => {
  // Game State
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [gameState, setGameState] = useState<Partial<GameState>>({
    history: [],
    captured: { w: [], b: [] },
    lastMove: null
  });
  
  // Player Names State
  const [whitePlayerName, setWhitePlayerName] = useState("Capablanca (IA)");
  const [blackPlayerName, setBlackPlayerName] = useState("Tú");
  
  // PGN Loading State
  const [showNameModal, setShowNameModal] = useState(false);
  const [tempLoadedGame, setTempLoadedGame] = useState<Chess | null>(null);
  const [tempHeaders, setTempHeaders] = useState<Record<string, string>>({});
  const [tempWhiteName, setTempWhiteName] = useState("");
  const [tempBlackName, setTempBlackName] = useState("");

  // Game Metadata Display State
  const [gameHeaders, setGameHeaders] = useState<Record<string, string> | null>(null);

  // Multi-Game PGN Selection State
  const [multiGameList, setMultiGameList] = useState<{headers: any, pgn: string}[]>([]);
  const [showMultiGameSelection, setShowMultiGameSelection] = useState(false);
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);

  // Review Mode State
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(-1); // -1 means showing live/end position
  const [reviewGame, setReviewGame] = useState<Chess | null>(null);

  // Time Control State
  const [selectedTimeControl, setSelectedTimeControl] = useState<number>(600); // Default 10 min
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  
  // AI / Analysis State
  const [engineReady, setEngineReady] = useState(false);
  const [analysis, setAnalysis] = useState<EngineAnalysis | null>(null);
  const [advice, setAdvice] = useState<MoveAdvice[]>([]);
  const [knowledge, setKnowledge] = useState<DailyKnowledge | null>(null);
  
  // UI State
  const historyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Settings
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.NORMAL);
  const [playAs, setPlayAs] = useState<'w' | 'b'>('w');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isResigned, setIsResigned] = useState(false);

  // Sound Refs
  const audioMove = useRef(new Audio(SOUNDS.MOVE));
  const audioCapture = useRef(new Audio(SOUNDS.CAPTURE));
  const audioCheck = useRef(new Audio(SOUNDS.CHECK));

  // Initialize
  useEffect(() => {
    const init = async () => {
      // Init Engine
      const ready = await engine.init();
      setEngineReady(ready);
      
      // Mock Storage update
      const kb = updateKnowledgeBase();
      setKnowledge(kb);
      
      // Real PGN Learning (Async background)
      dailyUpdate().catch(err => console.error("Error en aprendizaje diario:", err));
    };
    init();
    return () => { engine.quit(); };
  }, []);

  // Scroll history to bottom
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [gameState.history, fen, reviewIndex]);

  // Timer Logic
  useEffect(() => {
    if (!isGameStarted || game.isGameOver() || isReviewing || isResigned) return;
    
    // Check for Unlimited time (-1)
    if (selectedTimeControl === -1) return;

    const timer = setInterval(() => {
      if (game.turn() === 'w') {
        setWhiteTime(t => Math.max(0, t - 1));
      } else {
        setBlackTime(t => Math.max(0, t - 1));
      }
    }, 1000);

    if (whiteTime === 0 || blackTime === 0) {
      clearInterval(timer);
    }

    return () => clearInterval(timer);
  }, [isGameStarted, game.turn(), whiteTime, blackTime, game, selectedTimeControl, isReviewing, isResigned]);

  // Check Notification Logic
  useEffect(() => {
    if (isGameStarted && !isReviewing && !game.isGameOver() && !isResigned) {
      if (game.inCheck()) {
        setNotification("¡JAQUE!");
        const timer = setTimeout(() => setNotification(null), 2000);
        return () => clearTimeout(timer);
      }
    }
    // Clear notification if game ends or not in check
    if (!game.inCheck()) {
      setNotification(null);
    }
  }, [fen, isGameStarted, isReviewing, isResigned, game]);

  // Play Sounds
  const playSound = (move: Move) => {
    if (game.inCheck()) {
      audioCheck.current.play().catch(() => {});
    } else if (move.captured) {
      audioCapture.current.play().catch(() => {});
    } else {
      audioMove.current.play().catch(() => {});
    }
  };

  // Helper to calculate captures from history
  const getCapturesAndScore = useCallback((currentHistory: string[]) => {
    const wCaptures: string[] = [];
    const bCaptures: string[] = [];
    let wScore = 0;
    let bScore = 0;

    try {
      const historyVerbose = game.history({ verbose: true });
      historyVerbose.forEach(move => {
        if (move.captured) {
          if (move.color === 'w') {
            wCaptures.push(move.captured); // White captured a black piece
            wScore += PIECE_VALUES[move.captured] || 0;
          } else {
            bCaptures.push(move.captured); // Black captured a white piece
            bScore += PIECE_VALUES[move.captured] || 0;
          }
        }
      });
    } catch (e) {
      console.warn("Error calculating captures", e);
    }

    return { 
      wCaptures, 
      bCaptures,
      wAdvantage: wScore - bScore,
      bAdvantage: bScore - wScore
    };
  }, [game]);

  // Safe Game Mutation
  const makeMove = useCallback((move: string | { from: string; to: string; promotion?: string }) => {
    try {
      const gameCopy = new Chess();
      gameCopy.loadPgn(game.pgn());

      let result;

      if (typeof move === 'string') {
        result = gameCopy.move(move);
      } else {
        const movePayload: { from: string; to: string; promotion?: string } = {
          from: move.from,
          to: move.to
        };
        if (move.promotion) {
          movePayload.promotion = move.promotion;
        }
        result = gameCopy.move(movePayload);
      }
      
      if (result) {
        setGame(gameCopy);
        setFen(gameCopy.fen());
        setGameState(prev => ({
          ...prev,
          lastMove: { from: result.from, to: result.to },
          history: gameCopy.history(),
          check: gameCopy.inCheck(),
          checkmate: gameCopy.isCheckmate(),
          draw: gameCopy.isDraw()
        }));
        playSound(result);
        return true;
      }
    } catch (e: any) {
      if (e?.message?.startsWith('Invalid move')) {
        return false;
      }
      console.error("Move failed:", e);
      return false;
    }
    return false;
  }, [game]);

  // AI Turn Logic (Live Game)
  useEffect(() => {
    if (!isGameStarted || game.isGameOver() || !engineReady || isReviewing || isResigned) return;

    const isAiTurn = game.turn() !== playAs;

    if (isAiTurn && !isAiThinking) {
      setIsAiThinking(true);
      const config = DIFFICULTY_CONFIG[difficulty];
      
      setTimeout(() => {
        engine.evaluate(game.fen(), config.depth, async (data) => {
          setAnalysis(data); 
          
          if (data.depth >= Math.max(10, config.depth)) { 
             const aiMoveUCI = await getCapablancaMove(game, data, difficulty);
             
             const from = aiMoveUCI.substring(0, 2);
             const to = aiMoveUCI.substring(2, 4);
             const promotion = aiMoveUCI.length > 4 ? aiMoveUCI.substring(4, 5) : undefined;
             
             makeMove({ from, to, promotion });
             setIsAiThinking(false);
          }
        });
      }, 500);
    }
  }, [fen, engineReady, playAs, difficulty, isAiThinking, makeMove, isGameStarted, isReviewing, game, isResigned]);

  // Advisor Logic (Live Game)
  useEffect(() => {
    if (isGameStarted && game.turn() === playAs && !game.isGameOver() && engineReady && !isReviewing) {
      engine.evaluate(game.fen(), 12, (data) => {
        setAnalysis(data);
        if (data.depth >= 10) {
           const adviceList = generateAdvice(game, data);
           setAdvice(adviceList);
        }
      });
    }
  }, [fen, playAs, engineReady, isGameStarted, isReviewing]);

  // --- REVIEW MODE LOGIC ---
  const getGameAtIndex = useCallback((idx: number) => {
    const tempGame = new Chess();
    const moves = game.history();
    for (let i = 0; i <= idx; i++) {
      if (moves[i]) tempGame.move(moves[i]);
    }
    return tempGame;
  }, [game]);

  const handleStartReview = () => {
    setIsReviewing(true);
    setReviewIndex(game.history().length - 1);
    setReviewGame(game);
  };

  const handleReviewNav = (direction: 'start' | 'prev' | 'next' | 'end') => {
    let newIndex = reviewIndex;
    const historyLen = game.history().length;

    if (direction === 'start') newIndex = -1;
    if (direction === 'prev') newIndex = Math.max(-1, reviewIndex - 1);
    if (direction === 'next') newIndex = Math.min(historyLen - 1, reviewIndex + 1);
    if (direction === 'end') newIndex = historyLen - 1;

    setReviewIndex(newIndex);
    const tempGame = getGameAtIndex(newIndex);
    setReviewGame(tempGame);
  };

  const handleJumpToMove = (index: number) => {
    setReviewIndex(index);
    const tempGame = getGameAtIndex(index);
    setReviewGame(tempGame);
  };

  // Analysis for Review Mode
  useEffect(() => {
    if (isReviewing && reviewGame && engineReady) {
      const currentMoveSan = game.history()[reviewIndex];
      
      if (reviewIndex === -1) {
         setAdvice([{ san: "Inicio", uci: "", score: 0.2, reason: "Posición inicial." }]);
         engine.evaluate(reviewGame.fen(), 12, (data) => setAnalysis(data));
         return;
      }

      const prevGame = getGameAtIndex(reviewIndex - 1);
      
      engine.evaluate(prevGame.fen(), 12, (data) => {
        setAnalysis(data);
        if (data.depth >= 10 && currentMoveSan) {
          const critique = generateCritique(prevGame, currentMoveSan, data);
          setAdvice(critique);
        }
      });
    }
  }, [isReviewing, reviewIndex, reviewGame, engineReady, game]);

  const onDrop = (sourceSquare: Square, targetSquare: Square, piece?: string) => {
    if (!isGameStarted || game.turn() !== playAs || isAiThinking || isReviewing || isResigned) return false;
    
    const isPawn = piece ? piece[1].toLowerCase() === 'p' : false;
    const isPromotionRank = (targetSquare[1] === '8' || targetSquare[1] === '1');
    const promotion = (isPawn && isPromotionRank) ? 'q' : undefined;

    const success = makeMove({ 
      from: sourceSquare, 
      to: targetSquare, 
      promotion
    });

    return success;
  };

  const handleMoveForMe = () => {
    if (isAiThinking || !isGameStarted || isReviewing || game.turn() !== playAs || isResigned) return;
    
    setIsAiThinking(true);
    engine.evaluate(game.fen(), 20, async (data) => {
      const bestMoveUCI = await getCapablancaMove(game, data, Difficulty.MASTER);
      const from = bestMoveUCI.substring(0, 2);
      const to = bestMoveUCI.substring(2, 4);
      const promotion = bestMoveUCI.length > 4 ? bestMoveUCI.substring(4, 5) : undefined;
      makeMove({ from, to, promotion });
      setIsAiThinking(false);
    });
  };

  const handleStartGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setGameState({ history: [], lastMove: null, captured: { w: [], b: [] } });
    setAnalysis(null);
    setAdvice([]);
    setWhiteTime(selectedTimeControl);
    setBlackTime(selectedTimeControl);
    setIsAiThinking(false);
    setIsGameStarted(true);
    setIsReviewing(false);
    setReviewGame(null);
    setIsResigned(false);
    setNotification(null);
    setGameHeaders(null);
    setWhitePlayerName("Capablanca (IA)");
    setBlackPlayerName("Tú");
    if (playAs === 'w') {
        setWhitePlayerName("Tú");
        setBlackPlayerName("Capablanca (IA)");
    }
  };

  const handleStopGame = () => {
    setIsGameStarted(false);
    setIsReviewing(false);
    setGame(new Chess());
    setFen(new Chess().fen());
    setGameState({ history: [], lastMove: null, captured: { w: [], b: [] } });
    setIsResigned(false);
    setNotification(null);
    setGameHeaders(null);
  };

  const handleResign = () => {
    setIsResigned(true);
    setIsAiThinking(false);
  };

  const handleUndo = () => {
    if (isAiThinking || !isGameStarted || game.history().length === 0 || isReviewing || isResigned) return;
    const gameCopy = new Chess();
    gameCopy.loadPgn(game.pgn());
    gameCopy.undo(); 
    gameCopy.undo(); 
    setGame(gameCopy);
    setFen(gameCopy.fen());
    setGameState(prev => ({
      ...prev,
      history: gameCopy.history(),
      lastMove: null 
    }));
  };

  const handleDownloadGame = () => {
    if (game.history().length === 0) {
      alert("¡No hay jugadas para guardar!");
      return;
    }
    const gameCopy = new Chess();
    gameCopy.loadPgn(game.pgn());
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    
    let result = "*";
    if (gameState.checkmate) {
      result = game.turn() === 'w' ? "0-1" : "1-0";
    } else if (gameState.draw) {
      result = "1/2-1/2";
    } else if (isResigned) {
      result = playAs === 'w' ? "0-1" : "1-0";
    }

    gameCopy.header(
      'Event', 'Partida vs Capablanca Engine',
      'Site', 'Capablanca Chess App',
      'Date', dateStr,
      'Round', '1',
      'White', whitePlayerName,
      'Black', blackPlayerName,
      'Result', result,
      'PlyCount', game.history().length.toString(),
      'EventDate', dateStr
    );

    const pgnData = gameCopy.pgn();
    const blob = new Blob([pgnData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partida_${whitePlayerName}_vs_${blackPlayerName}_${dateStr.replace(/\./g, '-')}.pgn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTriggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const pgnText = e.target?.result as string;
      try {
        // Split PGNs by Event tag to handle multiple games
        const rawGames = pgnText.split(/\[Event "/);
        const validGames: {headers: any, pgn: string}[] = [];

        // Note: split usually produces an empty string at index 0 if the file starts with [Event "
        for (let i = 0; i < rawGames.length; i++) {
          if (!rawGames[i].trim()) continue;
          
          // Re-add the tag unless it's already there (rare case of split behavior differences)
          let gamePgn = rawGames[i];
          if (!gamePgn.startsWith('[Event "')) {
             gamePgn = '[Event "' + gamePgn;
          }

          try {
            const c = new Chess();
            c.loadPgn(gamePgn);
            if (c.history().length > 0 || Object.keys(c.header()).length > 0) {
                validGames.push({
                   headers: c.header(),
                   pgn: gamePgn
                });
            }
          } catch (err) {
            // Skip invalid chunks
          }
        }

        if (validGames.length === 0) {
            alert("No se encontraron partidas válidas en el archivo PGN.");
            return;
        }

        if (validGames.length === 1) {
             // Single game, load directly
             loadGameIntoState(validGames[0].pgn);
        } else {
             // Multiple games, show selection
             setMultiGameList(validGames);
             setSelectedGameIndex(0);
             setShowMultiGameSelection(true);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error("PGN Load Error", err);
        alert("Archivo PGN inválido o corrupto.");
      }
    };
    reader.readAsText(file);
  };

  const loadGameIntoState = (pgn: string) => {
      try {
        const loadedGame = new Chess();
        loadedGame.loadPgn(pgn);
        const headers = loadedGame.header();
        setTempHeaders(headers);
        setTempWhiteName(headers['White'] || "Jugador Blancas");
        setTempBlackName(headers['Black'] || "Jugador Negras");
        setTempLoadedGame(loadedGame);
        setShowNameModal(true);
      } catch (e) {
        console.error("Error loading specific game", e);
      }
  };

  const handleSelectGameFromList = () => {
     if (multiGameList[selectedGameIndex]) {
         loadGameIntoState(multiGameList[selectedGameIndex].pgn);
         setShowMultiGameSelection(false);
         setMultiGameList([]);
     }
  };

  const handleSortByYear = () => {
    const sorted = [...multiGameList].sort((a, b) => {
      const dateA = a.headers['Date'] || '0000';
      const dateB = b.headers['Date'] || '0000';
      return dateA.localeCompare(dateB);
    });
    setMultiGameList(sorted);
    setSelectedGameIndex(0);
  };

  const handleSortByName = () => {
    const sorted = [...multiGameList].sort((a, b) => {
      const nameA = `${a.headers['White'] || ''} ${a.headers['Black'] || ''}`.toLowerCase();
      const nameB = `${b.headers['White'] || ''} ${b.headers['Black'] || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
    setMultiGameList(sorted);
    setSelectedGameIndex(0);
  };

  const confirmLoadedGame = (mode: 'play' | 'review') => {
    if (!tempLoadedGame) return;

    setGame(tempLoadedGame);
    setFen(tempLoadedGame.fen());
    setGameState({
      history: tempLoadedGame.history(),
      lastMove: null,
      captured: { w: [], b: [] }, 
      check: tempLoadedGame.inCheck(),
      checkmate: tempLoadedGame.isCheckmate(),
      draw: tempLoadedGame.isDraw()
    });
    
    setWhitePlayerName(tempWhiteName);
    setBlackPlayerName(tempBlackName);
    setWhiteTime(selectedTimeControl);
    setBlackTime(selectedTimeControl);
    setIsAiThinking(false);
    setIsResigned(false);
    setShowNameModal(false);
    setTempLoadedGame(null);
    setNotification(null);
    setGameHeaders(tempHeaders);

    if (mode === 'review') {
      setIsReviewing(true);
      setIsGameStarted(false); 
      const lastIndex = tempLoadedGame.history().length - 1;
      setReviewIndex(lastIndex);
      setReviewGame(tempLoadedGame);
    } else {
      setIsReviewing(false);
      setIsGameStarted(true);
    }
  };

  // Logic to determine Game Over Details
  const getEndGameDetails = () => {
    const isTimeout = selectedTimeControl !== -1 && (whiteTime === 0 || blackTime === 0);
    
    if (gameState.checkmate) {
      return {
        title: "Jaque Mate",
        subtitle: game.turn() === 'w' ? "¡Ganan las Negras!" : "¡Ganan las Blancas!"
      };
    }
    if (isResigned) {
      return {
        title: "Rendición",
        subtitle: playAs === 'w' ? "Ganan las Negras" : "Ganan las Blancas"
      };
    }
    if (isTimeout) {
      return {
        title: "Tiempo Agotado",
        subtitle: whiteTime === 0 ? "Ganan las Negras" : "Ganan las Blancas"
      };
    }
    if (gameState.draw) {
      let reason = "Tablas";
      if (game.isThreefoldRepetition()) reason = "Tablas por Repetición";
      if (game.isInsufficientMaterial()) reason = "Tablas por Material Insuficiente";
      if (game.isStalemate()) reason = "Tablas por Rey Ahogado";
      return {
        title: reason,
        subtitle: "Empate"
      };
    }
    return null;
  };

  const isUserTurn = isGameStarted && game.turn() === playAs && !game.isGameOver() && !isReviewing && !isResigned;
  const endGameDetails = getEndGameDetails();
  const showGameOverModal = (endGameDetails !== null) && !isReviewing;

  // Calculate captures for rendering
  const { wCaptures, bCaptures, wAdvantage, bAdvantage } = getCapturesAndScore(game.history());
  const topPlayerIsWhite = playAs === 'b';
  const bottomPlayerIsWhite = playAs === 'w';
  const topCaptures = topPlayerIsWhite ? wCaptures : bCaptures;
  const topCaptureColor = topPlayerIsWhite ? 'b' : 'w'; 
  const topAdvantage = topPlayerIsWhite ? wAdvantage : bAdvantage;
  const topName = topPlayerIsWhite ? whitePlayerName : blackPlayerName;
  const bottomCaptures = bottomPlayerIsWhite ? wCaptures : bCaptures;
  const bottomCaptureColor = bottomPlayerIsWhite ? 'b' : 'w';
  const bottomAdvantage = bottomPlayerIsWhite ? wAdvantage : bAdvantage;
  const bottomName = bottomPlayerIsWhite ? whitePlayerName : blackPlayerName;
  const displayGame = isReviewing && reviewGame ? reviewGame : game;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-7xl mx-auto relative">
      
      {/* Signature Text */}
      <div className="fixed top-2 right-2 md:top-4 md:right-6 z-[100] text-white font-serif text-sm md:text-base font-semibold pointer-events-none drop-shadow-md">
        Jesús Terán
      </div>

      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pgn"
        style={{ display: 'none' }} 
      />

      {/* Multi Game Selection Modal */}
      {showMultiGameSelection && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           <div className="bg-stone-900 border-2 border-amber-600 rounded-lg shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in duration-200">
             <div className="p-6">
                <h2 className="text-xl font-serif text-amber-500 mb-4 text-center">Seleccionar Partida</h2>
                <p className="text-stone-400 text-sm mb-4 text-center">Se encontraron {multiGameList.length} partidas en el archivo.</p>
                
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-stone-500 text-xs font-bold uppercase">Ordenar por:</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleSortByYear}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-500 text-xs rounded border border-stone-700 transition-colors"
                        title="Ordenar cronológicamente"
                      >
                        📅 Año
                      </button>
                      <button 
                        onClick={handleSortByName}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-500 text-xs rounded border border-stone-700 transition-colors"
                        title="Ordenar alfabéticamente por jugadores"
                      >
                        🔤 Nombre
                      </button>
                    </div>
                  </div>
                  <label className="block text-stone-500 text-xs font-bold mb-2 uppercase">Partida</label>
                  <select 
                    value={selectedGameIndex}
                    onChange={(e) => setSelectedGameIndex(Number(e.target.value))}
                    className="w-full bg-stone-800 border border-stone-700 text-stone-200 p-3 rounded focus:outline-none focus:border-amber-600"
                  >
                    {multiGameList.map((g, idx) => (
                      <option key={idx} value={idx}>
                         {idx + 1}. {g.headers['White'] || '?'} vs {g.headers['Black'] || '?'} ({g.headers['Date']?.substring(0,4) || '?'}) - {g.headers['Result'] || '*'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                   <button 
                     onClick={handleSelectGameFromList}
                     className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-stone-900 font-bold rounded shadow-lg"
                   >
                     Continuar
                   </button>
                   <button 
                     onClick={() => { setShowMultiGameSelection(false); setMultiGameList([]); }}
                     className="px-4 py-3 bg-stone-700 hover:bg-stone-600 text-white rounded font-bold"
                   >
                     Cancelar
                   </button>
                </div>
             </div>
           </div>
        </div>
      )}

      {/* PGN Details Modal */}
      {showNameModal && !showMultiGameSelection && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           <div className="bg-stone-900 border-2 border-amber-600 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
             <div className="p-6 overflow-y-auto">
               <h2 className="text-2xl font-serif text-amber-500 mb-6 text-center">Detalles de la Partida</h2>
               
               <div className="bg-stone-800 rounded p-4 mb-6 border border-stone-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Evento</span>
                        <span className="text-stone-200 truncate">{tempHeaders['Event'] || '?'}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Lugar</span>
                        <span className="text-stone-200 truncate">{tempHeaders['Site'] || '?'}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Fecha</span>
                        <span className="text-stone-200">{tempHeaders['Date'] || '?'}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Resultado</span>
                        <span className="text-amber-500 font-bold">{tempHeaders['Result'] || '*'}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Blancas</span>
                        <span className="text-white font-bold truncate">{tempHeaders['White'] || '?'}</span>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Negras</span>
                        <span className="text-white font-bold truncate">{tempHeaders['Black'] || '?'}</span>
                     </div>
                     {tempHeaders['ECO'] && (
                       <div className="flex flex-col">
                          <span className="text-stone-500 font-bold uppercase text-xs">ECO</span>
                          <span className="text-stone-300">{tempHeaders['ECO']}</span>
                       </div>
                     )}
                     <div className="flex flex-col">
                        <span className="text-stone-500 font-bold uppercase text-xs">Movimientos</span>
                        <span className="text-stone-300">{(tempLoadedGame?.history().length || 0) / 2} turnos</span>
                     </div>
                  </div>
               </div>
               
               <div className="space-y-4 mb-6 p-4 bg-stone-800/30 rounded border border-stone-700/50">
                  <h3 className="text-stone-400 font-bold text-xs uppercase tracking-wider mb-2">Configurar Nombres (Opcional)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-stone-500 text-xs font-bold mb-1">Blancas</label>
                      <input 
                        type="text" 
                        value={tempWhiteName}
                        onChange={(e) => setTempWhiteName(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-500 text-xs font-bold mb-1">Negras</label>
                      <input 
                        type="text" 
                        value={tempBlackName}
                        onChange={(e) => setTempBlackName(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
               </div>

               <div className="flex flex-col md:flex-row gap-3">
                 <button 
                    onClick={() => confirmLoadedGame('play')}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-stone-900 font-bold rounded transition-colors flex items-center justify-center gap-2 shadow-lg"
                 >
                   <span>⚔️</span> Seguir Partida
                 </button>
                 <button 
                    onClick={() => confirmLoadedGame('review')}
                    className="flex-1 py-3 bg-stone-700 hover:bg-stone-600 text-white font-bold rounded transition-colors flex items-center justify-center gap-2 shadow-lg"
                 >
                   <span>🔍</span> Revisar Partida
                 </button>
               </div>
               <button 
                  onClick={() => { setShowNameModal(false); setTempLoadedGame(null); }}
                  className="w-full mt-3 py-2 text-stone-500 hover:text-stone-300 font-medium text-sm transition-colors"
               >
                 Cancelar
               </button>
             </div>
           </div>
        </div>
      )}

      {/* Start Game Modal */}
      {!isGameStarted && !showNameModal && !isReviewing && !showMultiGameSelection && (
        <div className="fixed top-0 left-0 w-full z-50 flex items-start justify-center p-4 pt-10 pointer-events-none">
          <div className="bg-stone-900 border-2 border-amber-600 p-4 md:p-8 rounded-lg shadow-2xl w-[95%] max-w-lg text-center max-h-[80vh] overflow-y-auto pointer-events-auto">
            <h1 className="text-2xl md:text-4xl font-serif text-amber-500 mb-2">Nueva Partida</h1>
            <p className="text-stone-400 mb-6 text-sm md:text-base">Configura tu desafío contra el maestro</p>
            
            <div className="mb-6">
               <h3 className="text-stone-300 font-bold mb-3 uppercase text-xs tracking-wider">Elige Bando</h3>
               <div className="flex justify-center gap-4 md:gap-6">
                <button 
                  onClick={() => setPlayAs('w')}
                  className={`flex flex-col items-center gap-2 p-2 md:p-4 rounded-lg border-2 transition-all w-24 md:w-28 ${playAs === 'w' ? 'border-amber-500 bg-stone-800' : 'border-stone-700 hover:border-stone-500'}`}
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-stone-200"></div>
                  <span className="text-xs md:text-sm font-bold">Blancas</span>
                </button>
                <button 
                  onClick={() => setPlayAs('b')}
                  className={`flex flex-col items-center gap-2 p-2 md:p-4 rounded-lg border-2 transition-all w-24 md:w-28 ${playAs === 'b' ? 'border-amber-500 bg-stone-800' : 'border-stone-700 hover:border-stone-500'}`}
                >
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-stone-900 border border-stone-600"></div>
                  <span className="text-xs md:text-sm font-bold">Negras</span>
                </button>
              </div>
            </div>

            <div className="mb-8">
               <h3 className="text-stone-300 font-bold mb-3 uppercase text-xs tracking-wider">Control de Tiempo</h3>
               <div className="grid grid-cols-2 gap-2 md:gap-3">
                 {TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.label}
                      onClick={() => setSelectedTimeControl(tc.value)}
                      className={`py-2 px-2 md:px-3 rounded border text-xs md:text-sm font-medium transition-all ${
                        selectedTimeControl === tc.value 
                          ? 'bg-amber-600/20 border-amber-500 text-amber-500' 
                          : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500'
                      }`}
                    >
                      {tc.label}
                    </button>
                 ))}
               </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={handleStartGame}
                disabled={!engineReady}
                className="w-full py-3 md:py-4 bg-amber-600 hover:bg-amber-500 text-stone-900 font-bold text-lg md:text-xl rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20"
              >
                {engineReady ? 'Comenzar Partida' : 'Cargando Motor...'}
              </button>
              <button 
                onClick={handleTriggerFileUpload}
                className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold rounded transition-colors border border-stone-700 text-sm"
              >
                Cargar Partida (Disco)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full flex justify-between items-center mb-6 border-b border-stone-800 pb-4">
        <div>
          <h1 className="text-xl md:text-3xl font-serif font-bold text-amber-500">
            Motor <span className="text-stone-500">Capablanca</span>
          </h1>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={handleStopGame} className="text-xs text-stone-500 hover:text-stone-300 underline">
            Salir
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex flex-col lg:flex-row gap-4 w-full items-start justify-center">
        
        {/* Left Panel */}
        <div className="w-full lg:w-64 space-y-6 order-2 lg:order-1">
          <div className="bg-stone-900 p-4 rounded border border-stone-800">
             <h3 className="text-stone-400 font-bold mb-2 text-sm uppercase">Evaluación</h3>
             <div className="text-3xl font-mono text-white mb-1">
                {analysis ? (analysis.evaluation / 100).toFixed(2) : '0.00'}
             </div>
             <div className="h-1 w-full bg-stone-800 rounded overflow-hidden">
                <div 
                  className={`h-full ${analysis && analysis.evaluation > 0 ? 'bg-green-500' : 'bg-red-500'}`} 
                  style={{ width: `${Math.min(100, Math.abs(analysis?.evaluation || 0) / 5)}%` }}
                ></div>
             </div>
          </div>

          <AdvicePanel 
            advice={advice} 
            loading={isReviewing && !analysis} 
          />
        </div>

        {/* Center: Board */}
        <div className="flex flex-col items-center w-full lg:w-auto order-1 lg:order-2 gap-4">
          
          {/* Top Player Info */}
          <div className="w-full flex justify-between items-end max-w-[400px]">
             <div className="flex flex-col gap-1">
               <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full border-2 ${playAs === 'w' ? 'bg-stone-900 border-stone-600' : 'bg-stone-200 border-stone-400'}`}></div>
                  <span className="text-stone-400 font-bold text-sm">{topName}</span>
               </div>
               <CapturedPieces 
                  captured={topCaptures} 
                  pieceColor={topCaptureColor} 
                  scoreDifference={topAdvantage} 
               />
             </div>
             <GameTimer 
                time={playAs === 'w' ? blackTime : whiteTime} 
                isActive={isGameStarted && game.turn() !== playAs && !isReviewing && !isResigned} 
             />
          </div>

          <div className="flex flex-row justify-center gap-4 relative">
            <EvaluationBar score={analysis?.evaluation || 0} mate={analysis?.mate} />
            
            <div className="relative">
              <ChessBoard 
                  game={displayGame} 
                  onMove={onDrop} 
                  orientation={playAs === 'w' ? 'white' : 'black'}
                  lastMove={isReviewing ? null : gameState.lastMove}
                  check={displayGame.inCheck() || false}
                  isInteractable={isGameStarted && game.turn() === playAs && !isReviewing && !isResigned}
              />
              
              {/* Turn Indicator */}
              {isUserTurn && !gameState.checkmate && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
                  <div className="bg-amber-600/90 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-pulse backdrop-blur-sm border border-amber-400">
                    TU TURNO
                  </div>
                </div>
              )}

              {/* Check Notification Overlay */}
              {notification && !showGameOverModal && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none w-full flex justify-center">
                  <div className="bg-red-600/90 text-white px-8 py-3 rounded-xl text-2xl font-black shadow-2xl animate-bounce border-2 border-red-400 backdrop-blur tracking-widest uppercase">
                    {notification}
                  </div>
                </div>
              )}

              {/* Centralized Game Over Modal */}
              {showGameOverModal && endGameDetails && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-40 backdrop-blur-sm rounded overflow-hidden">
                  <div className="bg-stone-900 border-2 border-amber-600 p-6 rounded-lg shadow-2xl text-center max-w-[80%] animate-in fade-in zoom-in duration-300">
                    <h2 className="text-3xl md:text-4xl font-serif text-amber-500 mb-2 font-bold drop-shadow-md">
                      {endGameDetails.title}
                    </h2>
                    <p className="text-stone-300 text-lg mb-6 border-b border-stone-700 pb-4">
                      {endGameDetails.subtitle}
                    </p>
                    <div className="flex flex-col gap-3">
                      <button 
                        onClick={handleStartReview}
                        className="px-6 py-3 bg-amber-700 hover:bg-amber-600 text-stone-100 font-bold rounded shadow-lg transition-all transform hover:scale-105"
                      >
                        🔍 Revisar Partida
                      </button>
                      <button 
                        onClick={handleStopGame}
                        className="px-6 py-3 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white rounded border border-stone-700 transition-colors"
                      >
                        Volver al Menú
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Player Info */}
          <div className="w-full flex justify-between items-start max-w-[400px]">
             <div className="flex flex-col gap-1">
               <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full border-2 ${playAs === 'w' ? 'bg-stone-200 border-amber-500' : 'bg-stone-900 border-amber-500'}`}></div>
                  <span className="text-amber-500 font-bold text-sm">{bottomName}</span>
               </div>
               <CapturedPieces 
                  captured={bottomCaptures} 
                  pieceColor={bottomCaptureColor} 
                  scoreDifference={bottomAdvantage} 
               />
             </div>
             <GameTimer 
                time={playAs === 'w' ? whiteTime : blackTime} 
                isActive={isGameStarted && game.turn() === playAs && !isReviewing && !isResigned} 
                isLowTime={selectedTimeControl !== -1 && (playAs === 'w' ? whiteTime : blackTime) < 60}
             />
          </div>
          
          {/* Review Controls */}
          {isReviewing && (
            <div className="w-full max-w-[400px] flex justify-between gap-2 bg-stone-900 p-2 rounded border border-amber-900/50">
               <button onClick={() => handleReviewNav('start')} className="p-2 bg-stone-800 rounded hover:bg-stone-700 text-stone-300">{'<<'}</button>
               <button onClick={() => handleReviewNav('prev')} className="p-2 bg-stone-800 rounded hover:bg-stone-700 text-stone-300">{'<'}</button>
               <div className="flex items-center text-sm font-bold text-amber-500">
                  {reviewIndex === -1 ? "Inicio" : `${Math.floor(reviewIndex/2) + 1}${reviewIndex % 2 === 0 ? '.' : '...'}`}
               </div>
               <button onClick={() => handleReviewNav('next')} className="p-2 bg-stone-800 rounded hover:bg-stone-700 text-stone-300">{'>'}</button>
               <button onClick={() => handleReviewNav('end')} className="p-2 bg-stone-800 rounded hover:bg-stone-700 text-stone-300">{'>>'}</button>
            </div>
          )}

        </div>

        {/* Right Panel */}
        <div className="w-full lg:w-64 space-y-6 order-3 lg:order-3">
          
          {gameHeaders && (
            <div className="bg-stone-900 p-4 rounded border border-stone-800 text-sm shadow-lg">
              <h3 className="text-amber-500 font-bold mb-3 border-b border-stone-800 pb-2 flex items-center gap-2">
                <span>ℹ️</span> Información
              </h3>
              <div className="space-y-3">
                <div>
                    <span className="text-stone-500 text-[10px] uppercase font-bold tracking-wider block">Evento</span>
                    <span className="text-stone-300 block truncate" title={gameHeaders['Event']}>{gameHeaders['Event'] || '?'}</span>
                </div>
                <div>
                    <span className="text-stone-500 text-[10px] uppercase font-bold tracking-wider block">Lugar</span>
                    <span className="text-stone-300 block truncate" title={gameHeaders['Site']}>{gameHeaders['Site'] || '?'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <span className="text-stone-500 text-[10px] uppercase font-bold tracking-wider block">Fecha</span>
                        <span className="text-stone-300 block">{gameHeaders['Date'] || '?'}</span>
                    </div>
                    <div>
                        <span className="text-stone-500 text-[10px] uppercase font-bold tracking-wider block">Resultado</span>
                        <span className="text-amber-500 font-bold block">{gameHeaders['Result'] || '*'}</span>
                    </div>
                </div>
                {gameHeaders['ECO'] && (
                    <div>
                        <span className="text-stone-500 text-[10px] uppercase font-bold tracking-wider block">Apertura (ECO)</span>
                        <span className="text-stone-300 block">{gameHeaders['ECO']}</span>
                    </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-stone-900 p-4 rounded border border-stone-800 space-y-4">
            <div>
              <label className="text-xs text-stone-500 uppercase font-bold block mb-2">Dificultad</label>
              <select 
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                disabled={isReviewing}
                className="w-full bg-stone-800 border border-stone-700 text-stone-200 p-2 rounded focus:outline-none focus:border-amber-600 transition-colors disabled:opacity-50"
              >
                <option value={Difficulty.EASY}>Aprendiz (Fácil)</option>
                <option value={Difficulty.NORMAL}>Jugador de Club (Normal)</option>
                <option value={Difficulty.MASTER}>Gran Maestro (Maestro)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
               <button 
                 onClick={handleMoveForMe}
                 disabled={!isUserTurn || isAiThinking || isResigned}
                 className="col-span-2 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 disabled:opacity-50 text-white py-2 rounded transition-all text-sm font-bold shadow-md border border-amber-500/50"
                 title="Deja que la máquina haga un movimiento por ti"
               >
                 🪄 Jugar por mí
               </button>
               <button 
                 onClick={handleUndo}
                 disabled={game.history().length === 0 || isAiThinking || !isGameStarted || isReviewing || isResigned}
                 className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 py-2 rounded transition-colors text-sm font-bold"
               >
                 Deshacer
               </button>
               <button 
                 onClick={handleResign}
                 disabled={!isGameStarted || game.isGameOver() || isReviewing || isResigned}
                 className="bg-amber-900/40 hover:bg-amber-900/60 disabled:opacity-50 text-amber-200 py-2 rounded transition-colors border border-amber-900 text-sm font-bold"
               >
                 Rendirse
               </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 border-t border-stone-700 pt-3">
               <button 
                 onClick={handleDownloadGame}
                 disabled={!isGameStarted && game.history().length === 0}
                 className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-400 hover:text-white py-2 rounded transition-colors text-xs uppercase font-bold"
               >
                 Guardar (DL)
               </button>
               <button 
                 onClick={handleTriggerFileUpload}
                 className="bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white py-2 rounded transition-colors text-xs uppercase font-bold"
               >
                 Cargar (Disco)
               </button>
            </div>
          </div>

          <div className="bg-stone-900 rounded border border-stone-800 h-64 flex flex-col">
            <div className="p-3 border-b border-stone-800 font-bold text-stone-400 text-sm">Historial</div>
            <div className="flex-1 overflow-y-auto p-2 font-mono text-sm scroll-smooth" ref={historyRef}>
               <div className="grid grid-cols-[30px_1fr_1fr] gap-y-1">
                 {game.history().map((move, i) => {
                   const isSelected = isReviewing && i === reviewIndex;
                   return (
                      <React.Fragment key={i}>
                        {i % 2 === 0 && (
                          <div className="text-stone-600 text-right pr-2">{Math.floor(i/2) + 1}.</div>
                        )}
                        <div 
                          className={`
                            rounded px-1 cursor-pointer transition-colors
                            ${isSelected ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:bg-stone-800'}
                          `}
                          onClick={() => isReviewing ? handleJumpToMove(i) : null}
                        >
                          {move}
                        </div>
                      </React.Fragment>
                   );
                 })}
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;