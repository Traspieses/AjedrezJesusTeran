import React from 'react';
import { PIECE_VALUES } from '../constants.ts';

interface Props {
  captured: string[]; // Array of piece codes: 'p', 'n', 'b', 'r', 'q'
  pieceColor: 'w' | 'b'; // The color of the pieces being displayed (e.g. if White captured, these are 'b')
  scoreDifference?: number; // Material advantage (e.g. +3)
}

const CapturedPieces: React.FC<Props> = ({ captured, pieceColor, scoreDifference }) => {
  // Sort order: Q, R, B, N, P
  const sortOrder = ['q', 'r', 'b', 'n', 'p'];
  
  const sortedPieces = [...captured].sort((a, b) => {
    return sortOrder.indexOf(a) - sortOrder.indexOf(b);
  });

  if (sortedPieces.length === 0 && (!scoreDifference || scoreDifference <= 0)) {
    return <div className="h-6"></div>; // Maintain height
  }

  // Base URL for piece images (matching chess.com/lichess style often used by react-chessboard default)
  const getPieceUrl = (type: string, color: 'w' | 'b') => {
    const c = color === 'w' ? 'w' : 'b';
    const p = type.toUpperCase();
    // Using Wikimedia commons standard SVG naming convention or a stable CDN
    // Using a reliable CDN for standard chess pieces
    return `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${c}${p.toLowerCase()}.png`;
  };

  return (
    <div className="flex items-center gap-2 h-8 px-2 bg-stone-800/50 rounded border border-stone-800/50">
      <div className="flex -space-x-2">
        {sortedPieces.map((piece, idx) => (
          <img 
            key={`${piece}-${idx}`}
            src={getPieceUrl(piece, pieceColor)} 
            alt={piece}
            className="w-6 h-6 object-contain filter drop-shadow-md"
          />
        ))}
      </div>
      {scoreDifference && scoreDifference > 0 && (
        <span className="text-xs font-bold text-stone-400">
          +{scoreDifference}
        </span>
      )}
    </div>
  );
};

export default CapturedPieces;