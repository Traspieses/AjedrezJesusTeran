import React from 'react';
import { MoveAdvice } from '../types.ts';

interface Props {
  advice: MoveAdvice[];
  loading: boolean;
}

const AdvicePanel: React.FC<Props> = ({ advice, loading }) => {
  if (loading) {
    return (
      <div className="p-4 bg-stone-900/50 rounded-lg border border-stone-700 animate-pulse">
        <div className="h-4 bg-stone-700 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-stone-800 rounded w-1/2"></div>
      </div>
    );
  }

  if (advice.length === 0) return null;

  return (
    <div className="bg-stone-900 border border-amber-900/30 rounded-lg p-4 shadow-lg">
      <h3 className="text-amber-500 font-serif font-bold mb-3 flex items-center gap-2">
        <span className="text-xl">♔</span> Consejo de Capablanca
      </h3>
      <div className="space-y-3">
        {advice.map((item, idx) => (
          <div key={idx} className="group cursor-default">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-stone-100 bg-stone-800 px-2 py-0.5 rounded text-sm">{item.san}</span>
              <span className={`text-xs ${item.score > 0 ? 'text-green-400' : 'text-red-400'}`}>
                Eval: {item.score > 0 ? '+' : ''}{item.score.toFixed(2)}
              </span>
            </div>
            <p className="text-sm text-stone-400 italic border-l-2 border-amber-700 pl-2">
              "{item.reason}"
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdvicePanel;