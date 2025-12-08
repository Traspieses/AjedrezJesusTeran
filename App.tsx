
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

  // Settings
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.NORMAL);
  const [playAs, setPlayAs] = useState<'w' | 'b'>('w');
  const [isAiThinking, setIsAiThinking] = useState(false);

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
    if (!isGameStarted || game.isGameOver() || isReviewing) return;
    
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
  }, [isGameStarted, game.turn(), whiteTime, blackTime, game, selectedTimeControl, isReviewing]);

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
    // Note: We use the live game for captures display usually, 
    // but in review mode we might want to update it based on reviewIndex?
    // For simplicity, we keep the live captures in the UI during review or just hide/static them.
    // Let's stick to the current game state for consistency.
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
      // CRITICAL: We must clone using loadPgn to preserve history. 
      // Initializing with just FEN (new Chess(fen)) wipes the move history.
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
      // chess.js throws "Invalid move" for illegal moves. 
      // We catch this to prevent app crash/noise, returning false to snap piece back.
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
    if (!isGameStarted || game.isGameOver() || !engineReady || isReviewing) return;

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
  }, [fen, engineReady, playAs, difficulty, isAiThinking, makeMove, isGameStarted, isReviewing, game]);

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

  // Helper to generate a chess instance at a specific history index
  const getGameAtIndex = useCallback((idx: number) => {
    const tempGame = new Chess();
    // Load moves up to idx
    const moves = game.history();
    for (let i = 0; i <= idx; i++) {
      if (moves[i]) tempGame.move(moves[i]);
    }
    return tempGame;
  }, [game]);

  const handleStartReview = () => {
    setIsReviewing(true);
    setReviewIndex(game.history().length - 1); // Start at end
    setReviewGame(game); // Current game state
  };

  const handleReviewNav = (direction: 'start' | 'prev' | 'next' | 'end') => {
    let newIndex = reviewIndex;
    const historyLen = game.history().length;

    if (direction === 'start') newIndex = -1;
    if (direction === 'prev') newIndex = Math.max(-1, reviewIndex - 1);
    if (direction === 'next') newIndex = Math.min(historyLen - 1, reviewIndex + 1);
    if (direction === 'end') newIndex = historyLen - 1;

    setReviewIndex(newIndex);

    // Update the visual board for review
    const tempGame = getGameAtIndex(newIndex);
    setReviewGame(tempGame);
  };

  // Analysis for Review Mode
  useEffect(() => {
    if (isReviewing && reviewGame && engineReady) {
      // Logic:
      // If we are at move N (reviewIndex), we want to critique the move that got us here.
      // That move is game.history()[reviewIndex].
      // To critique it, we need to analyze the position *before* it was made (reviewIndex - 1).
      
      const currentMoveSan = game.history()[reviewIndex];
      
      // If we are at start (-1), no move has been made, just analyze start pos
      if (reviewIndex === -1) {
         setAdvice([{ san: "Inicio", uci: "", score: 0.2, reason: "Posición inicial." }]);
         engine.evaluate(reviewGame.fen(), 12, (data) => setAnalysis(data));
         return;
      }

      // 1. Get position BEFORE the move
      const prevGame = getGameAtIndex(reviewIndex - 1);
      
      // 2. Analyze the previous position to find what WAS the best move
      engine.evaluate(prevGame.fen(), 12, (data) => {
        setAnalysis(data);
        // 3. Generate critique comparing 'currentMoveSan' vs 'data.bestMove'
        if (data.depth >= 10 && currentMoveSan) {
          const critique = generateCritique(prevGame, currentMoveSan, data);
          setAdvice(critique);
        }
      });
    }
  }, [isReviewing, reviewIndex, reviewGame, engineReady, game]);


  const onDrop = (sourceSquare: Square, targetSquare: Square, piece?: string) => {
    if (!isGameStarted || game.turn() !== playAs || isAiThinking || isReviewing) return false;
    
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
    if (isAiThinking || !isGameStarted || isReviewing || game.turn() !== playAs) return;
    
    setIsAiThinking(true);
    
    // Use high depth to find the best possible move (Capablanca style)
    engine.evaluate(game.fen(), 20, async (data) => {
      // We get the Capablanca weighted move, but for the PLAYER'S color
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
  };

  const handleStopGame = () => {
    setIsGameStarted(false);
    setIsReviewing(false);
    setGame(new Chess());
    setFen(new Chess().fen());
    setGameState({ history: [], lastMove: null, captured: { w: [], b: [] } });
  };

  const handleUndo = () => {
    if (isAiThinking || !isGameStarted || game.history().length === 0 || isReviewing) return;
    const gameCopy = new Chess();
    gameCopy.loadPgn(game.pgn());
    
    // Undo twice (AI + Player)
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
    const pgnData = game.pgn();
    const blob = new Blob([pgnData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partida_capablanca_${new Date().toISOString().slice(0,10)}.pgn`;
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
        const loadedGame = new Chess();
        loadedGame.loadPgn(pgnText);
        
        setGame(loadedGame);
        setFen(loadedGame.fen());
        setGameState({
          history: loadedGame.history(),
          lastMove: null,
          captured: { w: [], b: [] }, 
          check: loadedGame.inCheck(),
          checkmate: loadedGame.isCheckmate(),
          draw: loadedGame.isDraw()
        });
        
        // Reset timers and start state
        setWhiteTime(selectedTimeControl);
        setBlackTime(selectedTimeControl);
        setIsGameStarted(true);
        setIsAiThinking(false);
        setIsReviewing(false);
        
        // Clear input so same file can be selected again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
        
      } catch (err) {
        console.error("PGN Load Error", err);
        alert("Archivo PGN inválido. Por favor carga un archivo de ajedrez válido.");
      }
    };
    reader.readAsText(file);
  };

  const isUserTurn = isGameStarted && game.turn() === playAs && !game.isGameOver() && !isReviewing;

  // Calculate captures for rendering
  const { wCaptures, bCaptures, wAdvantage, bAdvantage } = getCapturesAndScore(game.history());

  // Define who is top and bottom
  const topPlayerIsWhite = playAs === 'b';
  const bottomPlayerIsWhite = playAs === 'w';

  // If top player is White, they have captured Black pieces (wCaptures)
  // If top player is Black, they have captured White pieces (bCaptures)
  const topCaptures = topPlayerIsWhite ? wCaptures : bCaptures;
  const topCaptureColor = topPlayerIsWhite ? 'b' : 'w'; // The color of pieces captured
  const topAdvantage = topPlayerIsWhite ? wAdvantage : bAdvantage;

  const bottomCaptures = bottomPlayerIsWhite ? wCaptures : bCaptures;
  const bottomCaptureColor = bottomPlayerIsWhite ? 'b' : 'w';
  const bottomAdvantage = bottomPlayerIsWhite ? wAdvantage : bAdvantage;

  // Determine what board to show: Live or Review
  const displayGame = isReviewing && reviewGame ? reviewGame : game;
  const displayFen = isReviewing && reviewGame ? reviewGame.fen() : fen;

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-7xl mx-auto relative">
      
      {/* Signature Text */}
      <div className="fixed top-2 right-2 md:top-4 md:right-6 z-[100] text-white font-serif text-sm md:text-base font-semibold pointer-events-none drop-shadow-md">
        Jesús Terán
      </div>

      {/* Hidden File Input for Loading Games */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pgn"
        style={{ display: 'none' }} 
      />

      {/* Start Game Overlay */}
      {!isGameStarted && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20">
          <div className="bg-stone-900 border-2 border-amber-600 p-4 md:p-8 rounded-lg shadow-2xl w-[95%] max-w-lg text-center max-h-[80vh] overflow-y-auto">
            <h1 className="text-2xl md:text-4xl font-serif text-amber-500 mb-2">Nueva Partida</h1>
            <p className="text-stone-400 mb-6 text-sm md:text-base">Configura tu desafío contra el maestro</p>
            
            {/* Color Selection */}
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

            {/* Time Control Selection */}
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

      {/* Main Grid -> Flex Container */}
      <div className="flex flex-col lg:flex-row gap-4 w-full items-start justify-center">
        
        {/* Left Panel: Stats & Advisor */}
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
          
          {/* Top Player Info (Opponent) */}
          <div className="w-full flex justify-between items-end max-w-[400px]">
             <div className="flex flex-col gap-1">
               <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full border-2 ${playAs === 'w' ? 'bg-stone-900 border-stone-600' : 'bg-stone-200 border-stone-400'}`}></div>
                  <span className="text-stone-400 font-bold text-sm">Capablanca (IA)</span>
               </div>
               <CapturedPieces 
                  captured={topCaptures} 
                  pieceColor={topCaptureColor} 
                  scoreDifference={topAdvantage} 
               />
             </div>
             <GameTimer 
                time={playAs === 'w' ? blackTime : whiteTime} 
                isActive={isGameStarted && game.turn() !== playAs && !isReviewing} 
             />
          </div>

          <div className="flex flex-row justify-center gap-4 relative">
            <EvaluationBar score={analysis?.evaluation || 0} mate={analysis?.mate} />
            
            <div className="relative">
              <ChessBoard 
                  game={displayGame} 
                  onMove={onDrop} 
                  orientation={playAs === 'w' ? 'white' : 'black'}
                  lastMove={isReviewing ? null : gameState.lastMove} // Hide last move highlight in review for clarity, or fix logic to show review move
                  check={displayGame.inCheck() || false}
                  isInteractable={isGameStarted && game.turn() === playAs && !isReviewing}
              />
              
              {isUserTurn && !gameState.checkmate && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
                  <div className="bg-amber-600/90 text-white px-6 py-2 rounded-full font-bold shadow-lg animate-pulse backdrop-blur-sm border border-amber-400">
                    TU TURNO
                  </div>
                </div>
              )}

              {/* Game Over Modal / Overlay */}
              {(gameState.checkmate || gameState.draw || (selectedTimeControl !== -1 && (whiteTime === 0 || blackTime === 0))) && !isReviewing && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-30 backdrop-blur-sm rounded">
                  <div className="text-center">
                    <h2 className="text-4xl font-serif text-amber-500 mb-2">
                      {gameState.checkmate 
                        ? (game.turn() === 'w' ? 'Ganan Negras' : 'Ganan Blancas') 
                        : (selectedTimeControl !== -1 && (whiteTime === 0 || blackTime === 0) ? 'Tiempo Agotado' : 'Tablas')}
                    </h2>
                    <div className="flex flex-col gap-2 mt-4">
                      <button 
                        onClick={handleStartReview}
                        className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-stone-900 font-bold rounded transition-colors shadow-lg"
                      >
                        Revisar Partida
                      </button>
                      <button 
                        onClick={handleStopGame}
                        className="px-6 py-2 bg-stone-700 hover:bg-stone-600 text-white rounded transition-colors"
                      >
                        Volver al Menú
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Player Info (You) */}
          <div className="w-full flex justify-between items-start max-w-[400px]">
             <div className="flex flex-col gap-1">
               <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full border-2 ${playAs === 'w' ? 'bg-stone-200 border-amber-500' : 'bg-stone-900 border-amber-500'}`}></div>
                  <span className="text-amber-500 font-bold text-sm">Tú</span>
               </div>
               <CapturedPieces 
                  captured={bottomCaptures} 
                  pieceColor={bottomCaptureColor} 
                  scoreDifference={bottomAdvantage} 
               />
             </div>
             <GameTimer 
                time={playAs === 'w' ? whiteTime : blackTime} 
                isActive={isGameStarted && game.turn() === playAs && !isReviewing} 
                isLowTime={selectedTimeControl !== -1 && (playAs === 'w' ? whiteTime : blackTime) < 60}
             />
          </div>
          
          {/* Review Controls (Only in Review Mode) */}
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

        {/* Right Panel: Controls & History */}
        <div className="w-full lg:w-64 space-y-6 order-3 lg:order-3">
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
                 disabled={!isUserTurn || isAiThinking}
                 className="col-span-2 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 disabled:opacity-50 text-white py-2 rounded transition-all text-sm font-bold shadow-md border border-amber-500/50"
                 title="Deja que la máquina haga un movimiento por ti"
               >
                 🪄 Jugar por mí
               </button>
               <button 
                 onClick={handleUndo}
                 disabled={game.history().length === 0 || isAiThinking || !isGameStarted || isReviewing}
                 className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 py-2 rounded transition-colors text-sm font-bold"
               >
                 Deshacer
               </button>
               <button 
                 onClick={handleStopGame}
                 className="bg-amber-900/40 hover:bg-amber-900/60 text-amber-200 py-2 rounded transition-colors border border-amber-900 text-sm font-bold"
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
                          onClick={() => isReviewing ? handleReviewNav('start') /* Placeholder for click to jump */ : null}
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