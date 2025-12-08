import React from 'react';

interface Props {
  time: number; // in seconds, or -1 for unlimited
  isActive: boolean;
  isLowTime?: boolean;
}

const GameTimer: React.FC<Props> = ({ time, isActive, isLowTime }) => {
  if (time === -1) {
    return (
      <div className={`
        px-4 py-2 rounded font-mono text-2xl font-bold border transition-colors
        ${isActive 
          ? 'bg-amber-900/40 border-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)]' 
          : 'bg-stone-800 border-stone-700 text-stone-500'}
      `}>
        ∞
      </div>
    );
  }

  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  // If more than 60 minutes, allow showing hours implicitly or just minutes > 60
  const displayMinutes = minutes.toString().padStart(2, '0');

  return (
    <div className={`
      px-4 py-2 rounded font-mono text-2xl font-bold border transition-colors
      ${isActive 
        ? 'bg-amber-900/40 border-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.3)]' 
        : 'bg-stone-800 border-stone-700 text-stone-500'}
      ${isLowTime && isActive ? 'animate-pulse text-red-400 border-red-500' : ''}
    `}>
      {displayMinutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
};

export default GameTimer;