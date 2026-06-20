import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, ArrowRight, Share2, Wallet, Check, Sparkles } from 'lucide-react';

interface CustomParticle {
  id: number;
  type: 'money50' | 'money100' | 'coin' | 'sparkle';
  x: number;
  size: number;
  delay: number;
  duration: number;
  rotateStart: number;
  rotateSpeed: number;
  swingSpeed: number;
}

interface VictoryAnimationProps {
  winnerName: string;
  isDraw?: boolean;
  isPlayerWinner?: boolean;
  prize?: number;
  balance?: number;
  onClose: () => void;
}

export default function VictoryAnimation({
  winnerName,
  isDraw = false,
  isPlayerWinner = true,
  prize = 20,
  balance = 247.5,
  onClose
}: VictoryAnimationProps) {
  const [particles, setParticles] = useState<CustomParticle[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate particles - Tigrinho style: more coins, bigger sparkles
    const generated: CustomParticle[] = [];
    const types: ('money50' | 'money100' | 'coin' | 'sparkle')[] = [
      'money100', 'coin', 'money50', 'coin', 'sparkle', 'coin', 'money100', 'coin', 'sparkle', 'coin'
    ];

    for (let i = 0; i < 65; i++) {
      generated.push({
        id: i,
        type: types[i % types.length],
        x: Math.random() * 100,
        size: Math.random() * 30 + 20,
        delay: Math.random() * 3,
        duration: Math.random() * 4 + 3.5,
        rotateStart: Math.random() * 360,
        rotateSpeed: Math.random() * 250 + 150,
        swingSpeed: Math.random() * 3 + 1
      });
    }
    setParticles(generated);
  }, []);

  const handleShare = () => {
    const textToShare = `🔥 Conquistei a vitória na DamaBet! Faturei R$ ${prize.toFixed(2)} em dinheiro real num duelo de Damas eletrizante! Inscreva-se e jogue agora: ${window.location.origin}`;
    navigator.clipboard.writeText(textToShare);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Render individual realistic banknote or coin particle
  const renderParticle = (p: CustomParticle) => {
    const width = p.type.startsWith('money') ? p.size * 2 : p.size;
    const height = p.type.startsWith('money') ? p.size : p.size;

    if (p.type === 'money100') {
      return (
        <div 
          className="relative rounded border border-cyan-400/30 bg-gradient-to-r from-[#033649] via-[#0A4D68] to-[#088395] shadow-lg flex flex-col justify-between p-1 select-none overflow-hidden"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          {/* Security stripe */}
          <div className="absolute inset-y-0 left-1/4 w-[1.5px] bg-[#00FFFF]/50" />
          <div className="flex justify-between items-start text-[6px] font-black leading-none text-[#00FFFF]/80 font-mono">
            <span>R$100</span>
            <span>100</span>
          </div>
          {/* Soft watermarks of the fish real logo */}
          <div className="mx-auto w-1.5 h-2 rounded bg-[#0A4D68]/40 border border-[#00FFFF]/10" />
          <div className="flex justify-between items-end text-[6px] font-black leading-none text-[#00FFFF] font-mono">
            <span className="text-[4px] uppercase tracking-tighter opacity-50">DamaBet</span>
            <span>R$100</span>
          </div>
        </div>
      );
    }

    if (p.type === 'money50') {
      return (
        <div 
          className="relative rounded border border-amber-600/30 bg-gradient-to-r from-[#4E3629] via-[#855848] to-[#C99B75] shadow-lg flex flex-col justify-between p-1 select-none overflow-hidden"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          {/* Security stripe */}
          <div className="absolute inset-y-0 left-1/4 w-[1.5px] bg-amber-300/40" />
          <div className="flex justify-between items-start text-[6px] font-black leading-none text-amber-200/80 font-mono">
            <span>R$50</span>
            <span>50</span>
          </div>
          {/* Watermark jaguar */}
          <div className="mx-auto w-2 h-1.5 rounded-full bg-amber-900/40" />
          <div className="flex justify-between items-end text-[6px] font-black leading-none text-amber-100 font-mono">
            <span className="text-[4px] uppercase tracking-tighter opacity-50">DamaBet</span>
            <span>R$50</span>
          </div>
        </div>
      );
    }

    if (p.type === 'coin') {
      return (
        <div 
          className="rounded-full bg-gradient-to-r from-amber-600 via-[#FABF18] to-amber-400 border border-[#FFF] shadow-md flex items-center justify-center font-mono font-black text-amber-900 leading-none select-none"
          style={{ 
            width: `${p.size}px`, 
            height: `${p.size}px`, 
            fontSize: `${p.size * 0.45}px`,
            boxShadow: '0 0 10px rgba(250,191,24,0.6)'
          }}
        >
          $
        </div>
      );
    }

    // Sparkle star
    return (
      <div 
        className="text-[#FABF18] animate-pulse filter drop-shadow-[0_0_8px_rgba(250,191,24,0.8)]"
        style={{ fontSize: `${p.size}px` }}
      >
        ✦
      </div>
    );
  };

  return (
    <div 
      id="victory-screen-root" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 overflow-hidden select-none"
      style={{
        backgroundImage: 'radial-gradient(circle at center, rgba(16,33,54,0.8) 0%, rgba(10,13,18,0.98) 100%)'
      }}
    >
      
      {/* 1. Backdrop checkerboard matrix mimicking the Dama ground */}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-10 pointer-events-none">
        {Array.from({ length: 64 }).map((_, i) => {
          const isDark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          return (
            <div 
              key={i} 
              className={`w-full h-full ${isDark ? 'bg-stone-500/10' : 'bg-transparent'}`} 
            />
          );
        })}
      </div>

      {/* 2. Falling Real Money notes & Golden Coin rainfall */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ 
              y: '-12vh', 
              x: `${p.x}vw`, 
              rotate: p.rotateStart, 
              opacity: 0,
              scale: 0.9 
            }}
            animate={{ 
              y: '108vh', 
              rotate: p.rotateStart + p.rotateSpeed,
              x: [
                `${p.x}vw`, 
                `${p.x + Math.sin(p.id) * 4}vw`, 
                `${p.x - Math.cos(p.id) * 3}vw`, 
                `${p.x + Math.sin(p.id + 1) * 3}vw`
              ],
              opacity: [0, 1, 1, 0],
              scale: 1
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
            className="absolute"
          >
            {renderParticle(p)}
          </motion.div>
        ))}
      </div>

      {/* 3. Main Center Interface Container - Tigrinho Victory */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ type: 'spring', damping: 20, stiffness: 180 }}
        className="relative w-full max-w-sm flex flex-col items-center justify-between text-center space-y-6 z-20 px-3"
      >
        {/* Sparkly background glow halo */}
        <motion.div
          className="absolute -top-16 w-80 h-80 bg-[#FABF18] rounded-full blur-3xl pointer-events-none"
          animate={{ opacity: [0.05, 0.15, 0.05], scale: [1, 1.2, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-8 left-0 w-40 h-40 bg-cyan-500 rounded-full blur-3xl pointer-events-none"
          animate={{ opacity: [0.03, 0.1, 0.03] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />

        {/* Brand header title visual accent like the picture */}
        <div className="flex flex-col items-center space-y-1">
          {/* Glorious crown animation */}
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Crown className="w-11 h-11 text-[#FABF18] filter drop-shadow-[0_0_12px_rgba(250,191,24,0.7)] fill-[#FABF18]" />
          </motion.div>
          
          {/* Heavy 3D-styled Victory header - Tigrinho Gold */}
          <motion.h1
            animate={{ textShadow: ['0 2px 25px rgba(250,191,24,0.3)', '0 2px 45px rgba(250,191,24,0.6)', '0 2px 25px rgba(250,191,24,0.3)'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl sm:text-6xl font-black tracking-tight leading-none uppercase select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] bg-gradient-to-b from-[#FFE386] via-[#FABF18] to-[#AE730B] bg-clip-text text-transparent transform scale-y-110 font-sans"
          >
            {isDraw ? 'EMPATE' : isPlayerWinner ? 'VITÓRIA' : 'FIM DE JOGO'}
          </motion.h1>
          
          <p className="text-stone-300 font-bold text-xs tracking-wider uppercase drop-shadow">
            {isDraw 
              ? 'Nenhum jogador perdeu moedas' 
              : isPlayerWinner 
              ? 'Você venceu a partida!' 
              : `Oponente (${winnerName}) venceu a partida`}
          </p>
        </div>

        {/* Neon Cyan + Gold Tigrinho Prize Card */}
        <motion.div
          animate={{ boxShadow: ['0 0 40px rgba(34,211,238,0.25)', '0 0 60px rgba(34,211,238,0.35)', '0 0 40px rgba(34,211,238,0.25)'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="w-full bg-[#050C16]/85 backdrop-blur-xl border border-cyan-400 rounded-[28px] p-6 relative overflow-hidden flex flex-col items-center justify-center space-y-5"
          style={{ boxShadow: 'inset 0 0 15px rgba(34,211,238,0.1), 0 10px 40px rgba(0,0,0,0.8)' }}
        >
          {/* Inner golden neon flare */}
          <motion.div
            className="absolute -top-12 w-64 h-16 bg-gradient-to-r from-transparent via-[#FABF18] to-transparent blur-2xl rounded-full"
            animate={{ x: ['-25%', '25%', '-25%'], opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          
          <div className="space-y-0.5">
            <span className="text-[11px] text-stone-400 font-black tracking-widest uppercase block">
              ✦ PRÊMIO ✦
            </span>
            <motion.span
              animate={{ textShadow: ['0 2px 8px rgba(250,191,24,0.5)', '0 2px 25px rgba(250,191,24,0.8)', '0 2px 8px rgba(250,191,24,0.5)'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="text-4xl font-mono font-black tracking-tight text-[#FABF18] gold-glow"
            >
              {isDraw ? 'R$ 0,00' : `R$ ${prize.toFixed(2)}`}
            </motion.span>
          </div>

          {/* Dynamic elegant Wallet Illustration with glowing stripes */}
          <div className="relative flex items-center justify-center w-36 h-28 my-1">
            {/* Solar gold burst glow in background */}
            <div className="absolute w-20 h-20 bg-[#FABF18]/30 rounded-full blur-2xl animate-pulse" />
            
            {/* Overlapping coin entering wallet */}
            <motion.div 
              animate={{ y: [4, -4, 4] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-2 z-10 w-12 h-12 rounded-full bg-gradient-to-b from-cyan-400 via-cyan-500 to-[#102A45] border-2 border-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.8)] flex items-center justify-center font-mono font-black text-xs text-white"
            >
              R$
            </motion.div>

            {/* Glowing leather wallet */}
            <div className="w-28 h-20 bg-gradient-to-b from-[#14233c] to-[#080d16] border border-[#1e3d6b] rounded-2xl shadow-2xl relative flex flex-col justify-between p-2 z-20">
              {/* Seam line neon border strip */}
              <div className="absolute inset-1 rounded-xl border border-dashed border-cyan-400/40 pointer-events-none" />
              <div className="absolute bottom-1 right-1 inset-x-1 h-[2px] bg-cyan-400 shadow-[0_0_8px_#00FFFF]" />
              
              {/* Clasp button detail */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-5 bg-[#09111c] border-l-2 border-y-2 border-cyan-400 rounded-l-md flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              </div>

              {/* Wallet internal card textures */}
              <div className="w-12 h-2 rounded bg-cyan-900/40 border border-cyan-500/20" />
              <div className="text-[7px] text-stone-500 font-mono">DamaBet wallet</div>
            </div>
          </div>

          {/* Success Validation check */}
          <div className="flex items-center gap-2 bg-[#022030]/65 py-2 px-4 rounded-full border border-cyan-500/20">
            <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5 text-black stroke-[3.5px]" />
            </div>
            <span className="text-[10px] text-cyan-300 font-extrabold tracking-wide uppercase">
              {isDraw ? 'Aposta reembolsada integral' : 'Valor creditado na sua carteira'}
            </span>
          </div>
        </motion.div>

        {/* Current Balance widget - Tigrinho Glow */}
        <div className="w-full bg-[#111622]/90 border border-stone-850 py-3.5 px-5 rounded-2xl flex items-center justify-between shadow-lg relative group hover:border-[#FABF18]/30 hover:shadow-[0_0_15px_rgba(250,191,24,0.1)] transition-all">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-[#FABF18]" />
            </div>
            <div className="text-left">
              <span className="text-[8px] sm:text-[9px] text-[#FABF18] font-black uppercase tracking-widest block leading-none">
                SALDO ATUAL
              </span>
              <span className="text-sm font-black font-mono text-white leading-none mt-1 inline-block">
                {balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

          <ArrowRight className="w-4 h-4 text-stone-500 group-hover:translate-x-1 transition-transform" />
        </div>

        {/* Large Golden-Orange gradient button - Tigrinho Enhanced */}
        <button
          onClick={onClose}
          className="w-full bg-gradient-to-b from-[#FCD34D] via-[#FABF18] to-[#C2410C] hover:from-[#FDE047] hover:to-[#EA580C] text-[#142c23] hover:text-[#0a1712] font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-[0_10px_35px_rgba(245,158,11,0.35)] cursor-pointer hover:scale-[1.03] active:scale-[0.97] transition-all duration-150 relative overflow-hidden btn-shimmer"
        >
          {/* Enhanced shimmer sweep */}
          <div className="absolute inset-y-0 -left-12 w-12 bg-white/25 skew-x-12 animate-shimmer pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-50" />
          <motion.div
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2)_0%,transparent_70%)]"
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          ✦ CONTINUAR ✦
        </button>

        {/* Bottom Social share shortcut - Tigrinho */}
        <button
          onClick={handleShare}
          className="text-[11px] text-[#00FFFF] hover:text-cyan-300 font-black uppercase tracking-widest flex items-center gap-2 transition-all hover:scale-105 hover:drop-shadow-[0_0_10px_cyan]"
        >
          <Share2 className="w-3.5 h-3.5 stroke-[2.5px]" />
          {copied ? '✦ VITÓRIA COPIADA! ✦' : '✦ COMPARTILHAR VITÓRIA ✦'}
        </button>
      </motion.div>

    </div>
  );
}
