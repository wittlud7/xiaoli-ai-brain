import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, RotateCw } from 'lucide-react';

interface FlashcardProps {
  id: string;
  term: string;
  points: string[];
  onDelete: (id: string) => void;
}

export const Flashcard: React.FC<FlashcardProps> = ({ id, term, points, onDelete }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="relative h-64 w-full perspective-1000 group">
      <motion.div
        className="w-full h-full relative preserve-3d cursor-pointer"
        initial={false}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {/* Front Side */}
        <div className="absolute inset-0 backface-hidden bg-white border-2 border-zinc-200 rounded-2xl p-6 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-2xl font-bold text-zinc-800 text-center">{term}</h3>
          <div className="absolute bottom-4 right-4 text-zinc-400 flex items-center gap-1 text-xs">
            <RotateCw size={14} />
            点击翻转
          </div>
        </div>

        {/* Back Side */}
        <div
          className="absolute inset-0 backface-hidden bg-zinc-900 border-2 border-zinc-800 rounded-2xl p-6 flex flex-col justify-center shadow-lg"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <div className="space-y-3">
            {points.map((point, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-emerald-400 font-mono text-sm mt-1 shrink-0">0{index + 1}</span>
                <p className="text-zinc-100 text-sm leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Delete Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
        className="absolute -top-2 -right-2 p-2 bg-red-50 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 z-10"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};
