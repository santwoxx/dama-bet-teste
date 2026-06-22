import React from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Sparkles } from 'lucide-react';

interface DepositPageProps {
  onActionComplete: () => void;
  token: string;
}

export default function DepositPage({ onActionComplete, token }: DepositPageProps) {
  return (
    <div className="w-full max-w-xl mx-auto grid grid-cols-1 gap-6 items-start relative z-10 font-sans px-2">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#FAF8EB] text-[#4A3B32] border-2 border-[#DCD6C2] rounded-2xl p-8 shadow-2xl relative text-center"
      >
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18] rounded-t-xl" />
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#FABF18]/30 rounded-tl" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#FABF18]/30 rounded-tr" />

        <h2 className="text-xl font-black uppercase text-[#4A3B32] tracking-wider mb-2 flex items-center justify-center gap-2">
          <span>⚡ Depositar</span>
          <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
        </h2>
        <p className="text-stone-600 text-xs mb-6 font-medium leading-relaxed">
          Clique no botão abaixo para fazer seu depósito no checkout seguro da LivePix.
        </p>

        <button
          onClick={() => window.open('https://livepix.gg/damabet', '_blank')}
          className="w-full bg-gradient-to-r from-[#FABF18] via-[#d97706] to-[#FABF18] text-[#142c23] font-black py-4 px-4 rounded-xl shadow-lg uppercase text-xs tracking-wider cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(250,191,24,0.4)]"
        >
          <ExternalLink className="w-4 h-4" />
          IR PARA LIVEPIX
        </button>
      </motion.div>
    </div>
  );
}
