import React, { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';

interface BoardProps {
  game: Chess;
  onMove: (source: Square, target: Square, piece?: string) => boolean;
  orientation: 'white' | 'black';
  lastMove: { from: Square; to: Square } | null;
  check: boolean;
  isInteractable: boolean;
}

const ChessBoard: React.FC<BoardProps> = ({ 
  game, 
  onMove, 
  orientation, 
  lastMove, 
  check,
  isInteractable 
}) => {
  const [boardWidth, setBoardWidth] = useState(400);
  const [moveSquares, setMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const width = Math.min(window.innerWidth - 32, 600);
      setBoardWidth(width);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // -- Highlighting Logic --

  const getMoveOptions = (square: Square) => {
    const moves = game.moves({
      square,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, React.CSSProperties> = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as Square) && game.get(move.to as Square).color !== game.get(square).color
            ? 'radial-gradient(circle, rgba(255, 85, 85, 0.8) 85%, transparent 85%)' // Capture target
            : 'radial-gradient(circle, rgba(100, 255, 100, 0.5) 25%, transparent 25%)', // Normal move
        borderRadius: '50%',
      };
      return move;
    });
    newSquares[square] = {
      background: 'rgba(255, 255, 0, 0.4)',
    };
    setOptionSquares(newSquares);
    return true;
  };

  const onSquareClick = (square: Square) => {
    if (!isInteractable) return;

    // If we have a selected square and click a target square (attempt to move)
    if (selectedSquare) {
      const success = onMove(selectedSquare, square);
      if (success) {
        setSelectedSquare(null);
        setOptionSquares({});
        return;
      }
    }

    // If we click a new piece, highlight its moves
    if (game.get(square) && game.get(square).color === game.turn()) {
      setSelectedSquare(square);
      getMoveOptions(square);
    } else {
      setSelectedSquare(null);
      setOptionSquares({});
    }
  };

  const onPieceDragBegin = (piece: string, sourceSquare: Square) => {
    if (!isInteractable) return;
    setSelectedSquare(sourceSquare);
    getMoveOptions(sourceSquare);
  };

  const onPieceDragEnd = () => {
    setOptionSquares({});
    setSelectedSquare(null);
  };

  // -- Final Style Merging --
  
  const customSquareStyles: Record<string, React.CSSProperties> = {
    ...optionSquares,
  };

  // Highlight last move (if not overridden by options)
  if (lastMove) {
    if (!customSquareStyles[lastMove.from]) customSquareStyles[lastMove.from] = { backgroundColor: 'rgba(155, 199, 0, 0.4)' };
    if (!customSquareStyles[lastMove.to]) customSquareStyles[lastMove.to] = { backgroundColor: 'rgba(155, 199, 0, 0.4)' };
  }

  // Highlight check
  if (check) {
    const kingSquare = game.board().flat().find(p => p?.type === 'k' && p?.color === game.turn())?.square;
    if (kingSquare) {
      customSquareStyles[kingSquare] = { 
        background: 'radial-gradient(circle, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0) 70%)' 
      };
    }
  }

  const onDrop = (sourceSquare: Square, targetSquare: Square, piece: string) => {
    if (!isInteractable) return false;
    const success = onMove(sourceSquare, targetSquare, piece);
    if (success) {
        setOptionSquares({});
        setSelectedSquare(null);
    }
    return success;
  };

  return (
    <div className="shadow-2xl rounded-sm overflow-hidden"> 
      {/* Container simplified to remove bg color which caused lines */}
      <Chessboard
        id="BasicBoard"
        position={game.fen()}
        onPieceDrop={onDrop}
        onPieceDragBegin={onPieceDragBegin}
        onPieceDragEnd={onPieceDragEnd}
        onSquareClick={onSquareClick}
        boardWidth={boardWidth}
        boardOrientation={orientation}
        arePiecesDraggable={isInteractable}
        customDarkSquareStyle={{ backgroundColor: '#b58863' }}
        customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
        customSquareStyles={customSquareStyles}
        animationDuration={200}
      />
    </div>
  );
};

export default ChessBoard;