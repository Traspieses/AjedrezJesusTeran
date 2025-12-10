import React from 'react';

interface Props {
  score: number; // centipawns
  mate?: number;
}

const EvaluationBar: React.FC<Props> = ({ score, mate }) => {
  // Normalize score for display (-500 to 500 range mostly)
  let percentage = 50;

  if (mate) {
    percentage = mate > 0 ? 100 : 0;
  } else {
    // Sigmoid-like clamping for visual bar
    const clampedScore = Math.max(-1000, Math.min(1000, score));
    percentage = 50 + (clampedScore / 1000) * 50;
  }

  const evalText = mate 
    ? `M${Math.abs(mate)}` 
    : (score / 100).toFixed(1);

  const isWhiteWinning = score > 0 || (mate && mate > 0);

  return (
    <div className="flex flex-row md:flex-col h-8 md:h-[600px] w-full md:w-8 bg-stone-700 rounded overflow-hidden border border-stone-600 relative my-4 md:my-0">
      {/* Black's share */}
      <div 
        className="h-full md:w-full bg-stone-800 transition-all duration-700 ease-in-out absolute top-0 left-0"
        style={{ 
          width: window.innerWidth < 768 ? `${100 - percentage}%` : '100%',
          height: window.innerWidth >= 768 ? `${100 - percentage}%` : '100%'
        }} 
      />
      {/* White's share */}
      <div 
        className="h-full md:w-full bg-stone-200 transition-all duration-700 ease-in-out absolute bottom-0 right-0"
        style={{ 
          width: window.innerWidth < 768 ? `${percentage}%` : '100%',
          height: window.innerWidth >= 768 ? `${percentage}%` : '100%'
        }} 
      />
      
      {/* Label */}
      <div className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${isWhiteWinning ? 'text-stone-800' : 'text-stone-200'} mix-blend-difference`}>
        {score > 0 ? '+' : ''}{evalText}
      </div>
    </div>
  );
};

export default EvaluationBar;