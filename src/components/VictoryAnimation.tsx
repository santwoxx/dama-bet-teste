import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Share2, Wallet, Check, Flame, Trophy, Zap, Repeat, Home } from 'lucide-react';

interface BurstParticle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  delay: number;
}

interface VictoryAnimationProps {
  winnerName: string;
  isDraw?: boolean;
  isPlayerWinner?: boolean;
  prize?: number;
  balance?: number;
  onClose: () => void;
}

function getStreak(): { count: number; totalEarned: number } {
  try {
    const c = parseInt(localStorage.getItem('damabet_win_streak') || '0', 10);
    const t = parseFloat(localStorage.getItem('damabet_total_earned') || '0');
    return { count: isNaN(c) ? 0 : c, totalEarned: isNaN(t) ? 0 : t };
  } catch {
    return { count: 0, totalEarned: 0 };
  }
}

function saveStreak(count: number, totalEarned: number) {
  try {
    localStorage.setItem('damabet_win_streak', String(count));
    localStorage.setItem('damabet_total_earned', String(totalEarned));
  } catch { /* ignore */ }
}

const BURST_EMOJIS = ['💰', '✨', '🪙', '💎', '🌟', '🔥', '👑', '💵'];

export default function VictoryAnimation({
  winnerName,
  isDraw = false,
  isPlayerWinner = true,
  prize = 20,
  balance = 247.5,
  onClose
}: VictoryAnimationProps) {
  const [stage, setStage] = useState<'enter' | 'count' | 'reveal' | 'done'>('enter');
  const [displayAmount, setDisplayAmount] = useState(0);
  const [bursts, setBursts] = useState<BurstParticle[]>([]);
  const [clicks, setClicks] = useState(0);
  const [copied, setCopied] = useState(false);

  const streak = useMemo(() => {
    if (isDraw) return { count: 0, totalEarned: 0 };
    const s = getStreak();
    if (isPlayerWinner) {
      const newCount = s.count + 1;
      saveStreak(newCount, s.totalEarned + prize);
      return { count: newCount, totalEarned: s.totalEarned + prize };
    }
    saveStreak(0, s.totalEarned);
    return { count: 0, totalEarned: s.totalEarned };
  }, [isDraw, isPlayerWinner, prize]);

  const streakBonus = Math.floor(prize * Math.min(streak.count * 0.05, 0.5));
  const totalPrize = prize + streakBonus;
  const burstIdRef = useRef(0);

  const addBurst = useCallback((clientX: number, clientY: number) => {
    const newBursts: BurstParticle[] = [];
    for (let i = 0; i < 6; i++) {
      burstIdRef.current += 1;
      newBursts.push({
        id: burstIdRef.current,
        x: clientX + (Math.random() - 0.5) * 120,
        y: clientY + (Math.random() - 0.5) * 120,
        emoji: BURST_EMOJIS[Math.floor(Math.random() * BURST_EMOJIS.length)],
        delay: Math.random() * 0.15,
      });
    }
    setBursts((prev) => [...prev.slice(-40), ...newBursts]);
    setClicks((c) => c + 1);
  }, []);

  const handleBgClick = useCallback((e: React.MouseEvent) => {
    addBurst(e.clientX, e.clientY);
  }, [addBurst]);

  // Stage transitions
  useEffect(() => {
    const t1 = setTimeout(() => setStage('count'), 400);
    const t2 = setTimeout(() => {
      setStage('reveal');
      setDisplayAmount(0);
      const start = Date.now();
      const duration = 1200;
      const step = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayAmount(Math.floor(eased * totalPrize));
        if (progress < 1) requestAnimationFrame(step);
        else setStage('done');
      };
      requestAnimationFrame(step);
    }, 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [totalPrize]);

  const handleShare = () => {
    const txt = `🔥 Acabei de ganhar R$ ${prize.toFixed(2)} na DamaBet! ${streak.count > 1 ? `Minha streak de ${streak.count} vitórias! 🏆` : ''} Jogue agora: ${window.location.origin}`;
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const rainParticles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      type: i % 4 === 0 ? 'coin' : 'sparkle',
      x: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 3 + Math.random() * 4,
      size: 14 + Math.random() * 22,
    })), []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at center, #0f1a2e 0%, #05080e 100%)' }}
    >
      {/* Background click catcher */}
      <div className="absolute inset-0 z-10" onClick={handleBgClick} />

      {/* Checkerboard backdrop */}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-[0.06] pointer-events-none z-0">
        {Array.from({ length: 64 }).map((_, i) => (
          <div key={i} className={`w-full h-full ${(Math.floor(i / 8) + (i % 8)) % 2 === 1 ? 'bg-stone-300/10' : ''}`} />
        ))}
      </div>

      {/* Particle rain */}
      <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
        {rainParticles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute"
            style={{ left: `${p.x}%`, top: '-8%' }}
            initial={{ y: '-10vh', opacity: 0, scale: 0.5, rotate: 0 }}
            animate={{
              y: '110vh',
              opacity: [0, 1, 1, 0],
              scale: [0.5, 1, 1, 0.3],
              rotate: [0, 360],
              x: [0, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40],
            }}
            transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
          >
            {p.type === 'coin' ? (
              <div
                className="rounded-full bg-gradient-to-b from-amber-400 via-[#FABF18] to-amber-600 border border-amber-200/30 flex items-center justify-center font-mono font-black text-amber-900 shadow-lg"
                style={{ width: p.size, height: p.size, fontSize: p.size * 0.4 }}
              >
                $
              </div>
            ) : (
              <span className="text-[#FABF18] drop-shadow-[0_0_6px_rgba(250,191,24,0.6)]" style={{ fontSize: p.size }}>
                ✦
              </span>
            )}
          </motion.div>
        ))}
      </div>

      {/* Burst particles */}
      <div className="absolute inset-0 pointer-events-none z-20">
        <AnimatePresence>
          {bursts.map((b) => (
            <motion.div
              key={b.id}
              initial={{ x: b.x, y: b.y, scale: 0, opacity: 1 }}
              animate={{
                x: b.x + (Math.random() - 0.5) * 80,
                y: b.y - 40 - Math.random() * 60,
                scale: [0, 1.5, 0],
                opacity: [1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 + b.delay, delay: b.delay, ease: 'easeOut' }}
              className="absolute text-3xl"
              style={{ left: 0, top: 0 }}
            >
              {b.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Screen flash on stage reveal */}
      <AnimatePresence>
        {stage === 'reveal' && (
          <motion.div
            key="flash"
            className="absolute inset-0 z-5 pointer-events-none"
            initial={{ background: 'rgba(250,191,24,0.4)' }}
            animate={{ background: 'rgba(250,191,24,0)' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        )}
      </AnimatePresence>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 16, stiffness: 200, delay: 0.15 }}
        className="relative z-30 w-full max-w-sm mx-4 flex flex-col items-center text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow halos */}
        <div className="absolute -top-20 w-72 h-72 bg-[#FABF18] rounded-full blur-[80px] opacity-[0.08] pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-cyan-500 rounded-full blur-[60px] opacity-[0.06] pointer-events-none" />

        {/* Streak badge */}
        {streak.count > 1 && !isDraw && (
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 12, stiffness: 180, delay: 0.5 }}
            className="relative -mb-6 z-10 bg-gradient-to-r from-orange-600 via-[#FABF18] to-orange-500 text-stone-950 px-4 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 shadow-[0_0_25px_rgba(250,191,24,0.5)]"
          >
            <Flame className="w-3.5 h-3.5 fill-current" />
            STREAK {streak.count}x
            <Flame className="w-3.5 h-3.5 fill-current" />
          </motion.div>
        )}

        {/* Crown */}
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Crown className="w-12 h-12 text-[#FABF18] drop-shadow-[0_0_15px_rgba(250,191,24,0.6)] fill-[#FABF18]" />
        </motion.div>

        {/* Title */}
        <motion.h1
          animate={{ textShadow: ['0 0 20px rgba(250,191,24,0.3)', '0 0 50px rgba(250,191,24,0.6)', '0 0 20px rgba(250,191,24,0.3)'] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-5xl sm:text-6xl font-black tracking-tight leading-none uppercase bg-gradient-to-b from-[#FFE386] via-[#FABF18] to-[#AE730B] bg-clip-text text-transparent drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
        >
          {isDraw ? 'EMPATE' : isPlayerWinner ? 'VITÓRIA' : 'FIM DE JOGO'}
        </motion.h1>

        <p className="text-stone-400 text-xs font-bold tracking-wider mt-1 mb-4">
          {isDraw ? 'Ninguém perdeu moedas' : isPlayerWinner ? 'Você venceu a partida!' : `${winnerName} venceu a partida`}
        </p>

        {/* Prize card */}
        <motion.div
          animate={stage === 'done' ? { boxShadow: ['0 0 30px rgba(34,211,238,0.2)', '0 0 60px rgba(34,211,238,0.35)', '0 0 30px rgba(34,211,238,0.2)'] } : {}}
          transition={{ duration: 3, repeat: Infinity }}
          className="w-full bg-[#0a111f]/90 backdrop-blur-xl border border-cyan-400/40 rounded-3xl p-6 relative overflow-hidden"
        >
          {/* Glare sweep */}
          <motion.div
            className="absolute -top-12 w-full h-12 bg-gradient-to-r from-transparent via-[#FABF18]/20 to-transparent blur-2xl"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          <span className="text-[10px] text-stone-500 font-black tracking-[0.2em] uppercase block">PRÊMIO</span>

          <motion.div className="relative my-3">
            <motion.span
              key={displayAmount}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-5xl sm:text-6xl font-mono font-black tracking-tight text-[#FABF18] block"
              style={{ textShadow: '0 0 30px rgba(250,191,24,0.4)' }}
            >
              R$ {displayAmount.toFixed(2)}
            </motion.span>

            {/* Streak bonus */}
            {streakBonus > 0 && stage === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] text-emerald-400 font-bold mt-1 flex items-center justify-center gap-1"
              >
                <Zap className="w-3 h-3 fill-emerald-400" />
                Bônus Streak: +R$ {streakBonus.toFixed(2)}
              </motion.div>
            )}
          </motion.div>

          {/* Wallet animation */}
          <div className="relative flex items-center justify-center w-32 h-24 mx-auto my-2">
            <div className="absolute w-16 h-16 bg-[#FABF18]/20 rounded-full blur-2xl animate-pulse" />
            <motion.div
              animate={{ y: [3, -3, 3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-1 z-10 w-10 h-10 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 border-2 border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.6)] flex items-center justify-center font-mono font-black text-xs text-white"
            >
              R$
            </motion.div>
            <div className="w-24 h-16 bg-gradient-to-b from-[#14233c] to-[#080d16] border border-[#1e3d6b] rounded-xl relative flex flex-col justify-between p-2 z-20">
              <div className="absolute inset-1 rounded-xl border border-dashed border-cyan-400/30 pointer-events-none" />
              <div className="absolute bottom-1 right-1 inset-x-1 h-[1.5px] bg-cyan-400/60 shadow-[0_0_6px_#00FFFF]" />
              <div className="w-10 h-1.5 rounded bg-cyan-900/40 border border-cyan-500/20" />
              <div className="text-[6px] text-stone-500 font-mono">wallet</div>
            </div>
          </div>

          {/* Success check */}
          <div className="flex items-center justify-center gap-2 bg-[#022030]/60 py-2 px-3 rounded-full border border-cyan-500/20 mt-1">
            <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-black stroke-[4px]" />
            </div>
            <span className="text-[9px] text-cyan-300 font-extrabold tracking-wide uppercase">
              {isDraw ? 'Aposta reembolsada' : 'Creditado na carteira'}
            </span>
          </div>
        </motion.div>

        {/* Balance */}
        {stage === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full bg-[#111622]/90 border border-stone-800/60 py-3 px-4 rounded-2xl flex items-center justify-between mt-4"
          >
            <div className="flex items-center gap-2.5">
              <Wallet className="w-4 h-4 text-[#FABF18]" />
              <div className="text-left">
                <span className="text-[7px] text-[#FABF18] font-black tracking-widest uppercase block">SALDO ATUAL</span>
                <span className="text-sm font-black font-mono text-white">
                  {balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
            {streak.totalEarned > 0 && (
              <div className="text-right">
                <span className="text-[7px] text-stone-500 font-black uppercase block">TOTAL GANHO</span>
                <span className="text-xs font-mono font-black text-emerald-400">
                  R$ {streak.totalEarned.toFixed(2)}
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Click counter */}
        {clicks > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[10px] text-stone-500 font-mono mt-2"
          >
            {clicks} toques • {clicks * 6} faíscas ✨
          </motion.div>
        )}

        {/* Buttons */}
        {stage === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="w-full flex flex-col gap-2.5 mt-5"
          >
            <button
              onClick={onClose}
              className="w-full bg-gradient-to-b from-[#FCD34D] via-[#FABF18] to-[#C2410C] hover:from-[#FDE047] hover:to-[#EA580C] text-[#142c23] font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-[0_8px_30px_rgba(245,158,11,0.3)] cursor-pointer hover:scale-[1.02] active:scale-[0.97] transition-all duration-150 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-50" />
              <span className="relative flex items-center justify-center gap-2">
                <Repeat className="w-4 h-4" />
                JOGAR NOVAMENTE
              </span>
            </button>

            {isPlayerWinner && !isDraw && (
              <button
                onClick={handleShare}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:scale-105 py-2"
              >
                <Share2 className="w-3 h-3" />
                {copied ? 'COPIADO!' : 'COMPARTILHAR VITÓRIA'}
              </button>
            )}
          </motion.div>
        )}

        {/* Hint text before reveal */}
        {stage === 'count' && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-stone-500 mt-4 animate-pulse"
          >
            Calculando premiação...
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
