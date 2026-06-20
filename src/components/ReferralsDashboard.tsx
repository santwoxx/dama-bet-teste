import { useState } from 'react';
import { motion } from 'motion/react';
import { Share2, Copy, Check, Users, Wallet, HelpCircle, ArrowRight, ArrowLeft, ArrowDown, QrCode, Gift, AlertCircle, Sparkles, TrendingUp, DollarSign } from 'lucide-react';

export interface ReferralTier {
  people: number;
  reward: number;
  key: string;
}

export const REFERRAL_TIERS: ReferralTier[] = [
  { people: 1, reward: 15.00, key: 'tier_1' },
  { people: 2, reward: 15.00, key: 'tier_2' },
  { people: 3, reward: 15.00, key: 'tier_3' },
  { people: 4, reward: 20.00, key: 'tier_4' },
  { people: 5, reward: 20.00, key: 'tier_5' },
  { people: 6, reward: 20.00, key: 'tier_6' },
  { people: 7, reward: 20.00, key: 'tier_7' },
  { people: 8, reward: 20.00, key: 'tier_8' },
  { people: 9, reward: 20.00, key: 'tier_9' },
  { people: 10, reward: 20.00, key: 'tier_10' },
  { people: 15, reward: 100.00, key: 'tier_15' },
  { people: 20, reward: 100.00, key: 'tier_20' },
  { people: 25, reward: 100.00, key: 'tier_25' },
  { people: 30, reward: 100.00, key: 'tier_30' },
  { people: 35, reward: 100.00, key: 'tier_35' },
  { people: 40, reward: 100.00, key: 'tier_40' },
  { people: 45, reward: 100.00, key: 'tier_45' },
  { people: 50, reward: 100.00, key: 'tier_50' },
  { people: 60, reward: 200.00, key: 'tier_60' },
  { people: 70, reward: 200.00, key: 'tier_70' },
  { people: 80, reward: 200.00, key: 'tier_80' },
  { people: 90, reward: 200.00, key: 'tier_90' },
  { people: 100, reward: 200.00, key: 'tier_100' },
  { people: 150, reward: 1000.00, key: 'tier_150' },
  { people: 200, reward: 1000.00, key: 'tier_200' },
  { people: 250, reward: 1000.00, key: 'tier_250' },
  { people: 300, reward: 1000.00, key: 'tier_300' },
  { people: 350, reward: 1000.00, key: 'tier_350' },
  { people: 400, reward: 1000.00, key: 'tier_400' },
  { people: 450, reward: 1000.00, key: 'tier_450' },
  { people: 500, reward: 1000.00, key: 'tier_500' },
  { people: 600, reward: 2000.00, key: 'tier_600' },
  { people: 700, reward: 2000.00, key: 'tier_700' },
  { people: 800, reward: 2000.00, key: 'tier_800' },
  { people: 900, reward: 2000.00, key: 'tier_900' },
  { people: 1000, reward: 2000.00, key: 'tier_1000' },
  { people: 1500, reward: 10000.00, key: 'tier_1500' },
  { people: 2000, reward: 10000.00, key: 'tier_2000' },
  { people: 2500, reward: 10000.00, key: 'tier_2500' },
  { people: 3000, reward: 10000.00, key: 'tier_3000' },
  { people: 4000, reward: 20000.00, key: 'tier_4000' },
  { people: 5000, reward: 20000.00, key: 'tier_5000' },
  { people: 6000, reward: 20000.00, key: 'tier_6000' },
  { people: 7000, reward: 20000.00, key: 'tier_7000' },
  { people: 8000, reward: 20000.00, key: 'tier_8000' },
  { people: 9000, reward: 20000.00, key: 'tier_9000' },
  { people: 10000, reward: 20000.00, key: 'tier_10000' }
];

interface ReferralsDashboardProps {
  userId: string;
  userName: string;
  balance: number;
  invitedCount: number;
  onClaimReward: (rewardAmount: number, tierKey: string) => Promise<void>;
  claimedRewards: string[];
}

// ----------------------------------------------------
// Custom TreasureChestIcon component as requested!
// Displays real-time state: LOCKED, READY-TO-OPEN, EMPTY/CLAIMED
// Color-coded by prestige (Bronze, Silver, Gold, Diamond, Mythic)
// ----------------------------------------------------
function TreasureChestIcon({ 
  reward, 
  isUnlocked, 
  isClaimed, 
  canClaim, 
  className = "w-20 h-20" 
}: { 
  reward: number; 
  isUnlocked: boolean; 
  isClaimed: boolean; 
  canClaim: boolean; 
  className?: string;
}) {
  let primaryCol = "#CD7F32"; // bronze
  let secondaryCol = "#5c3317"; // dark wood
  let trimCol = "#A52A2A";
  let ratingLabel = "BRONZE";
  
  if (reward < 25) {
    primaryCol = "#CD7F32"; // Bronze
    trimCol = "#df7a30";
    ratingLabel = "BRONZE 📦";
  } else if (reward < 150) {
    primaryCol = "#CBD5E1"; // Silver (Platina)
    trimCol = "#94A3B8";
    ratingLabel = "PRATA 🪙";
  } else if (reward < 1000) {
    primaryCol = "#FABF18"; // Gold Custom
    trimCol = "#D97706";
    ratingLabel = "OURO 🌟";
  } else if (reward < 10000) {
    primaryCol = "#22D3EE"; // Diamond Cyan
    trimCol = "#0891B2";
    ratingLabel = "DIAMANTE 💎";
  } else {
    primaryCol = "#D946EF"; // Mythic Sovereign Pink
    trimCol = "#A21CAF";
    ratingLabel = "MITÍCO 👑";
  }

  // Visual filter for locked state
  const filterStyle = !isUnlocked ? "saturate-[25%] contrast-75 opacity-55 scale-[96%]" : "";
  const animateStyle = canClaim ? "animate-bounce duration-300 filter drop-shadow-[0_0_12px_rgba(250,191,24,0.6)]" : "";

  return (
    <div className={`relative flex flex-col items-center justify-center transition-all duration-300 ${filterStyle} ${animateStyle}`}>
      {/* Dynamic Halo Glow for claimable chests */}
      {canClaim && (
        <div className="absolute inset-0 bg-[#FABF18]/25 blur-xl rounded-full animate-ping pointer-events-none" />
      )}
      {isUnlocked && !isClaimed && (
        <div className="absolute -inset-1 bg-gradient-to-t from-emerald-500/10 to-transparent blur-md rounded-full pointer-events-none" />
      )}
      
      <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
        {isClaimed ? (
          // ---------------------------------------------
          // OPENED / RECLAIMED CHEST
          // ---------------------------------------------
          <g>
            {/* Open wood backdrop inside */}
            <path d="M15,55 L85,55 L80,85 L20,85 Z" fill="#241407" stroke="#1c0f05" strokeWidth="2.5" />
            
            {/* Soft inner treasure glow */}
            <circle cx="50" cy="72" r="12" fill="#FABF18" opacity="0.15" filter="blur(3px)" />
            
            {/* Back open lid (swapped background coordinates) */}
            <path d="M22,35 C22,18 78,18 78,35 L75,55 L25,55 Z" fill={secondaryCol} stroke="#180e06" strokeWidth="2" />
            <path d="M34,22 L34,55" stroke={primaryCol} strokeWidth="3.5" fill="none" />
            <path d="M66,22 L66,55" stroke={primaryCol} strokeWidth="3.5" fill="none" />

            {/* Front chest body */}
            <path d="M15,55 L85,55 L80,85 L20,85 Z" fill={secondaryCol} stroke="#1b0f06" strokeWidth="2.5" />
            
            {/* Corner metallic trims */}
            <path d="M15,55 L24,55 L24,85 L20,85 Z" fill={primaryCol} opacity="0.9" />
            <path d="M85,55 L76,55 L76,85 L80,85 Z" fill={primaryCol} opacity="0.9" />
            
            {/* Main Lock latch swung upwards (empty lock) */}
            <rect x="42" y="44" width="16" height="24" rx="2" fill={trimCol} stroke="#1a0f05" strokeWidth="1.5" />
            <circle cx="50" cy="54" r="3.5" fill="#1c0f05" />
            
            {/* Empty checkmark emblem floating */}
            <path d="M44,72 L48,76 L56,68" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        ) : (
          // ---------------------------------------------
          // SECURE CLOSED CHEST (Locked or Claimable)
          // ---------------------------------------------
          <g>
            {/* Chest Lid Dome */}
            <path d="M20,48 C20,25 80,25 80,48 Z" fill={secondaryCol} stroke="#1c0f05" strokeWidth="2.5" />
            
            {/* Decorative colored straps */}
            <path d="M34,30 C34,30 36,48 36,48" stroke={primaryCol} strokeWidth="4.5" strokeLinecap="round" fill="none" />
            <path d="M66,30 C66,30 64,48 64,48" stroke={primaryCol} strokeWidth="4.5" strokeLinecap="round" fill="none" />
            
            {/* Prominent shiny central Gem */}
            <g className={canClaim ? "animate-pulse" : ""}>
              <polygon points="50,22 56,28 50,34 44,28" fill={primaryCol} stroke="#111" strokeWidth="1" />
            </g>

            {/* Solid Storage Base */}
            <path d="M20,48 L80,48 L75,84 L25,84 Z" fill={secondaryCol} stroke="#1c0f05" strokeWidth="2.5" />
            
            {/* Bottom Metallic corner plates */}
            <path d="M20,48 L27,48 L27,84 L25,84 Z" fill={primaryCol} />
            <path d="M80,48 L73,48 L73,84 L75,84 Z" fill={primaryCol} />
            
            {/* Horizontal reinforcement strap */}
            <rect x="25" y="76" width="50" height="5" fill="#120a03" opacity="0.5" />

            {/* Giant Lock Mechanism Card */}
            <rect x="42" y="44" width="16" height="22" rx="3" fill={trimCol} stroke="#1c0f05" strokeWidth="2" />
            <circle cx="50" cy="52" r="3.5" fill="#1c0f05" />
            <path d="M50,54 L50,62" stroke="#1c0f05" strokeWidth="2.5" strokeLinecap="round" />

            {/* Absolute Secure Padlock Overlay if locked */}
            {!isUnlocked && (
              <g className="transition-all duration-300">
                {/* Padlock background base */}
                <rect x="36" y="58" width="28" height="22" rx="4" fill="#374151" stroke="#1f2937" strokeWidth="2" />
                {/* Padlock loop/shackle */}
                <path d="M42,58 L42,50 C42,44 58,44 58,50 L58,58" stroke="#4b5563" strokeWidth="3" fill="none" />
                {/* Mini keyhole */}
                <circle cx="50" cy="67" r="2.5" fill="#111" />
                <path d="M50,69 L50,75" stroke="#111" strokeWidth="1.5" />
              </g>
            )}

            {/* Sparkle starbursts if claimable and premium */}
            {canClaim && (
              <g className="animate-pulse">
                <path d="M10,18 L12,12 L18,10 L12,8 L10,2 L8,8 L2,10 L8,12 Z" fill="#fff" transform="scale(0.55) translate(20, 20)" />
                <path d="M10,18 L12,12 L18,10 L12,8 L10,2 L8,8 L2,10 L8,12 Z" fill="#FABF18" transform="scale(0.4) translate(195, 60)" />
                <path d="M10,18 L12,12 L18,10 L12,8 L10,2 L8,8 L2,10 L8,12 Z" fill="#10B981" transform="scale(0.48) translate(80, 150)" />
              </g>
            )}
          </g>
        )}
      </svg>
      <span className="text-[8px] font-black tracking-widest mt-1 uppercase text-stone-400 font-mono select-none px-1.5 py-0.5 rounded bg-stone-900/40">
        {ratingLabel}
      </span>
    </div>
  );
}

export default function ReferralsDashboard({
  userId,
  userName,
  balance,
  invitedCount,
  onClaimReward,
  claimedRewards
}: ReferralsDashboardProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [showInviteDetails, setShowInviteDetails] = useState(false);
  const [simulatedCount, setSimulatedCount] = useState<number>(5);

  const inviteUrl = `https://damabet.com/invite?code=U-${userId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };



  const onClaimPress = async (reward: number, key: string) => {
    setClaimLoading(key);
    try {
      await onClaimReward(reward, key);
    } catch {
      // handled
    } finally {
      setClaimLoading(null);
    }
  };

  // Convert chunked rows of 4 for snake route
  const chunkedRows: ReferralTier[][] = [];
  for (let i = 0; i < REFERRAL_TIERS.length; i += 4) {
    chunkedRows.push(REFERRAL_TIERS.slice(i, i + 4));
  }

  // Calculate cumulative potential reward based on simulated count
  const calculateSimulatedEarning = (count: number) => {
    return REFERRAL_TIERS
      .filter(tier => count >= tier.people)
      .reduce((sum, tier) => sum + tier.reward, 0);
  };

  const totalEarnedClaimed = REFERRAL_TIERS
    .filter(tier => claimedRewards.includes(tier.key))
    .reduce((sum, tier) => sum + tier.reward, 0);

  return (
    <div id="referrals-dashboard" className="w-full max-w-4xl mx-auto space-y-6 relative z-10 animate-fade-in font-sans">
      
      {/* 1. ULTRA PREMIUM AFFILIATE BANNER - Tigrinho Enhanced */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-r from-[#170e0a] via-[#241710] to-[#120905] text-[#FAF8EB] border-2 border-[#FABF18]/60 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        {/* Animated glowing orbs */}
        <motion.div
          className="absolute top-0 right-0 w-80 h-80 bg-[#FABF18]/8 rounded-full blur-3xl pointer-events-none"
          animate={{ scale: [1, 1.2, 1], opacity: [0.03, 0.08, 0.03] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-60 h-60 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none"
          animate={{ scale: [1, 1.15, 1], opacity: [0.03, 0.07, 0.03] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-[#FABF18]/5 rounded-full blur-3xl pointer-events-none"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
        
        {/* Top brand header with glow */}
        <motion.div
          className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 via-[#FABF18] to-emerald-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
        
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8 relative z-10">
          <div className="space-y-3.5 text-center lg:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
              <span className="bg-[#FABF18] text-[#142c23] text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow">
                PARCERIA OFICIAL DamaBet
              </span>
              <span className="bg-[#10B981]/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                Apostas Vitalícias
              </span>
              <span className="text-stone-400 font-bold font-mono text-[11px]">ID PROMOTOR: {userId}</span>
            </div>
            
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight uppercase font-sans">
              🤝 CONVIDE AMIGOS & <span className="text-[#FABF18] bg-clip-text">ABRA BAÚS DE TESOURO!</span>
            </h2>
            
            <p className="text-xs sm:text-sm text-stone-300 max-w-xl font-medium leading-relaxed">
              Monte sua rede de apostadores licenciados na maior plataforma de Duelos de Damas do país. Cada amigo qualificado destrava um <b className="text-[#FABF18]">Baú Lendário</b> contendo prêmios em dinheiro imediatamente resgatáveis para sua carteira!
            </p>
          </div>

          {/* Golden Affiliate Balance Widget */}
          <div className="bg-[#1c1917]/95 border-2 border-[#FABF18] p-5 rounded-2xl text-center shadow-2xl shrink-0 w-full sm:w-80 relative group hover:border-amber-450 transition-colors">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FABF18] text-stone-950 font-black text-[9px] px-3 py-0.5 rounded-full uppercase tracking-widest leading-none shadow">
              Carteira do Promotor
            </div>
            
            <span className="text-[10px] text-stone-400 font-black uppercase tracking-wider block mt-1.5">SALDO DISPONÍVEL</span>
            <span className="text-3xl font-mono font-black text-[#FABF18] block leading-none py-2 my-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
            
            <div className="mt-2 bg-emerald-950/80 border border-emerald-800/40 px-3 py-1.5 rounded-xl text-[10px] text-emerald-300 font-extrabold flex items-center justify-between">
              <span>🏆 Total Resgatado:</span>
              <span className="font-mono text-white">R$ {totalEarnedClaimed.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. REFERRAL LINKS & DETAILED SIMULATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Premium Share Card */}
        <div className="bg-[#1c1917]/90 backdrop-blur border border-[#333] text-stone-100 p-6 rounded-2xl shadow-xl space-y-5 lg:col-span-2">
          <div className="flex items-center gap-3 pb-3 border-b border-stone-800/60">
            <div className="p-2 bg-[#FABF18]/10 rounded-xl border border-[#FABF18]/30">
              <Share2 className="w-5 h-5 text-[#FABF18]" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-[#FABF18] tracking-wide">CONVITE VIP DO TIGRINHO</h3>
              <p className="text-[10px] text-stone-400">Compartilhe seu link e lucre com a rede</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5 bg-black/40 p-4 rounded-xl border border-stone-850">
            <div className="p-3 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-xl border border-stone-700/20 group hover:scale-105 transition-transform">
              <QrCode className="w-20 h-20 text-stone-900" />
            </div>

            <div className="space-y-3.5 w-full">
              <div className="space-y-1">
                <span className="text-[9px] text-[#FABF18] font-black uppercase tracking-widest font-mono">SEU EMBARQUE DE CONVITE</span>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className="w-full bg-stone-900 border border-stone-750 text-stone-200 rounded-lg py-2.5 pl-3 pr-28 text-xs font-bold font-mono focus:outline-none focus:border-[#FABF18] h-10 select-all"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="absolute right-1 top-1 bottom-1 bg-[#FABF18] hover:bg-amber-450 text-[#142c23] hover:text-[#0c1c16] px-4 text-xs font-black rounded-md flex items-center gap-1.5 cursor-pointer transition-all uppercase"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 stroke-[3px]" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>


            </div>
          </div>
        </div>

        {/* Right Side: Interactive Commission / Bonus Simulator - Tigrinho */}
        <div className="bg-gradient-to-b from-[#143d22] to-[#081e10] border-2 border-[#FABF18] text-white p-5 rounded-2xl shadow-xl flex flex-col justify-between card-glow relative overflow-hidden">
          <motion.div
            className="absolute -top-8 -right-8 w-24 h-24 bg-[#FABF18]/8 rounded-full blur-2xl"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-850">
              <span className="text-xs font-black font-mono tracking-wider text-emerald-300 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#FABF18]" />
                SIMULADOR DE LUCROS
              </span>
              <span className="bg-[#FABF18]/10 text-[#FABF18] text-[9px] px-2 py-0.5 rounded font-black uppercase">
                Estimativa Real
              </span>
            </div>

            <div className="space-y-4 pt-1.5">
              <div>
                <div className="flex justify-between text-xs font-bold text-stone-200 mb-1.5">
                  <span>Amigos que você indicará:</span>
                  <span className="text-[#FABF18] font-black text-sm">{simulatedCount} pessoas</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={simulatedCount}
                  onChange={(e) => setSimulatedCount(parseInt(e.target.value))}
                  className="w-full accent-[#FABF18] h-1.5 bg-emerald-950 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-emerald-400 font-mono mt-1">
                  <span>1 amigo</span>
                  <span>50 amigos</span>
                  <span>100+ amigos</span>
                </div>
              </div>

              <div className="bg-black/30 p-3 rounded-lg border border-emerald-800/40 text-center">
                <span className="text-[10px] text-stone-300 font-bold block uppercase">BÔNUS ESTIMADO EM DINHEIRO</span>
                <span className="text-2xl font-mono font-black text-[#FABF18] block mt-1">
                  {calculateSimulatedEarning(simulatedCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[9px] text-emerald-300 font-medium block mt-1">
                  *Com base na conclusão de depósitos qualificados.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3.5 border-t border-emerald-850 mt-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#FABF18]" />
              <span className="text-xs font-extrabold text-stone-200">Minha Rede:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black text-white bg-black/45 px-2.5 py-0.5 rounded border border-emerald-850">
                {invitedCount}
              </span>
              <button
                onClick={() => setShowInviteDetails(!showInviteDetails)}
                className="bg-[#FABF18] hover:bg-amber-450 text-stone-950 font-black text-[9px] px-2 py-1 rounded uppercase tracking-wider transition-all cursor-pointer"
              >
                {showInviteDetails ? 'Esconder' : 'Ver Rede'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 2.5 USER LIST POPUP/DETAILS ACCORDION */}
      {showInviteDetails && (
        <div className="bg-[#1c1917]/95 border border-stone-800 p-4 rounded-xl shadow-inner font-mono text-xs text-[#FAF8EB] space-y-2 animate-fade-in">
          <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2">
            <span className="font-black text-[10px] text-[#FABF18] uppercase tracking-widest">📋 SUBORDINADOS CADASTRADOS & STATUS DE QUALIFICAÇÃO</span>
            <span className="text-[9px] text-stone-500 font-bold">Total: {invitedCount}</span>
          </div>
          {invitedCount === 0 ? (
            <p className="text-stone-500 italic text-center py-4">Nenhum subordinado ativo no momento. Divulgue seu link para começar!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {Array.from({ length: invitedCount }).map((_, i) => (
                <div key={i} className="flex justify-between items-center bg-black/40 p-2 rounded border border-stone-850 text-[10px]">
                  <span className="font-bold flex items-center gap-1.5"><span className="text-emerald-400">👤</span> Subordinado_N{1001 + i}</span>
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-900/60 font-black text-[8px] px-1.5 py-0.5 rounded font-sans uppercase">Qualificado ✔️</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. QUALIFICATION RULE CRITERIA CARDS */}
      <div className="bg-gradient-to-br from-[#0c2a16] to-[#041108] border border-emerald-800/40 rounded-2xl p-5 text-stone-200 shadow-xl relative">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1">
            <h4 className="text-sm font-black text-[#FABF18] uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FABF18]" />
              COMO QUALIFICAR SEU AMIGO CADASTRADO?
            </h4>
            <p className="text-xs text-emerald-250 font-medium">
              Cada amigo deve atender a esses requisitos simples para desbloquear as recompensas de baús:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full md:w-auto">
            <div className="bg-black/40 p-3 rounded-xl border border-emerald-800/30 flex items-center gap-3">
              <span className="text-2xl select-none text-[#FABF18]">📥</span>
              <div>
                <span className="text-[9px] text-[#FABF18] font-black uppercase block font-sans">RECARGA TOTAL</span>
                <span className="text-xs font-black font-mono text-white">Soma &gt;= R$ 20,00</span>
              </div>
            </div>
            
            <div className="bg-black/40 p-3 rounded-xl border border-emerald-800/30 flex items-center gap-3">
              <span className="text-2xl select-none text-[#FABF18]">🏁</span>
              <div>
                <span className="text-[9px] text-[#FABF18] font-black uppercase block font-sans">APOSTAS EM JOGOS</span>
                <span className="text-xs font-black font-mono text-white">Prêmio jogado &gt;= R$ 20,00</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. THE ROAD OF CHESTS (SNAKE PATH REDESIGNED WITH DYNAMIC INTERACTIVE CUSTOM TREASURE CHESTS) */}
      <div className="relative bg-[#0d0a08]/95 border border-stone-850 p-6 rounded-2xl shadow-2xl">
        
        {/* Background circuit board line or road design */}
        <div className="absolute inset-0 bg-[radial-gradient(#1c1917_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-stone-900 pb-4 mb-6 z-10">
          <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#FABF18]/10 rounded-lg border border-[#FABF18]/25">
              <Gift className="w-5 h-5 text-[#FABF18]" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase text-[#FABF18] tracking-widest font-sans">ESTRADA DO SUCESSO DE TESOUROS</h3>
              <p className="text-[9px] text-stone-500 uppercase tracking-widest">Siga a rota e destranque baús cada vez mais valiosos!</p>
            </div>
          </div>

          <div className="bg-black/55 py-1 px-3 rounded-full border border-stone-850 font-semibold text-[10px] text-stone-300 font-mono self-start sm:self-center">
            Progresso Atual: <b className="text-[#FABF18] font-black font-mono">{invitedCount}</b> / 10.000 amigos ativos
          </div>
        </div>

        {/* CHEST LEGEND BAR */}
        <div className="bg-black/40 p-3 rounded-xl border border-stone-850/60 grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-[10px] text-stone-400 font-semibold mb-6 relative z-10">
          <div className="flex items-center gap-1.5 bg-[#312316]/30 px-2 py-1.5 rounded-lg border border-amber-900/40">
            <span className="text-xs">📦</span> <span><b>Cesto Bronze:</b> R$ 15</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900/30 px-2 py-1.5 rounded-lg border border-slate-800/40">
            <span className="text-xs">🪙</span> <span><b>Baú Prata:</b> R$ 20</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-950/30 px-2 py-1.5 rounded-lg border border-amber-800/40">
            <span className="text-xs">🌟</span> <span><b>Baú Ouro:</b> R$ 100</span>
          </div>
          <div className="flex items-center gap-1.5 bg-cyan-950/30 px-2 py-1.5 rounded-lg border border-cyan-800/40">
            <span className="text-xs">💎</span> <span><b>Baú Diamante:</b> R$ 1.000</span>
          </div>
          <div className="flex items-center gap-1.5 bg-purple-950/30 px-2 py-1.5 rounded-lg border border-purple-800/40 col-span-2 sm:col-span-1">
            <span className="text-xs">👑</span> <span><b>Super Mítico:</b> R$ 10.000+</span>
          </div>
        </div>

        {/* Snake Flow Rows rendering */}
        <div className="space-y-8 relative z-10">
          {chunkedRows.map((row, rowIndex) => {
            const isLeftToRight = rowIndex % 2 === 0;
            const displayRow = isLeftToRight ? row : [...row].reverse();

            return (
              <div key={rowIndex} className="relative">
                {/* Visual horizontal road linker pipeline behind elements */}
                <div className="hidden md:block absolute inset-y-1/2 left-[8%] right-[8%] h-1 bg-gradient-to-r from-stone-900/20 via-stone-800 to-stone-900/20 -z-10 rounded" />

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
                  {displayRow.map((tier, itemIndex) => {
                    const isUnlocked = invitedCount >= tier.people;
                    const isClaimed = claimedRewards.includes(tier.key);
                    const canClaim = isUnlocked && !isClaimed;

                    const showArrow = itemIndex < displayRow.length - 1;
                    const lastInRow = itemIndex === displayRow.length - 1;

                    return (
                      <div key={tier.key} className="flex flex-col justify-between h-full relative">
                        {/* THE INDIVIDUAL PRESTIGIOUS CHEST CARD */}
                        <div
                          className={`flex-1 p-4 rounded-2xl border-2 text-center flex flex-col justify-between gap-3.5 transition-transform duration-300 relative group/card ${
                            isClaimed
                              ? 'bg-stone-900/40 border-stone-900/80 text-stone-500 ring-1 ring-stone-950/20'
                              : canClaim
                              ? 'bg-[#1b2f1e]/85 border-[#FABF18] text-white ring-2 ring-emerald-500/40 hover:-translate-y-1 shadow-[0_8px_20px_rgba(250,191,24,0.15)]'
                              : isUnlocked
                              ? 'bg-gradient-to-b from-stone-900 to-emerald-950/30 border-emerald-600/50 text-emerald-200'
                              : 'bg-stone-950/80 border-stone-900 text-stone-600 hover:border-stone-850 hover:-translate-y-0.5'
                          }`}
                        >
                          {/* Inner corner badge and claim indicators */}
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[9px] font-black bg-stone-900/80 px-2 py-0.5 rounded-full border border-stone-800 text-stone-200 select-none">
                              LV_{REFERRAL_TIERS.indexOf(tier) + 1}
                            </span>
                            {isClaimed ? (
                              <span className="text-[8px] bg-stone-850 text-stone-500 font-black uppercase tracking-widest px-1.5 py-0.5 rounded select-none">
                                Resgatado
                              </span>
                            ) : canClaim ? (
                              <span className="text-[8px] bg-[#FABF18] text-[#142c23] font-black uppercase tracking-widest px-1.5 py-0.5 rounded animate-bounce">
                                Disponível!
                              </span>
                            ) : (
                              <span className="text-[8px] text-stone-400 font-black uppercase tracking-wider bg-black/40 px-1.5 py-0.5 rounded">
                                {tier.people} {tier.people === 1 ? 'amigo' : 'amigos'}
                              </span>
                            )}
                          </div>

                          {/* Beautiful Interactive Chest Illustration */}
                          <TreasureChestIcon 
                            reward={tier.reward} 
                            isUnlocked={isUnlocked} 
                            isClaimed={isClaimed} 
                            canClaim={canClaim} 
                          />

                          {/* Prize info */}
                          <div className="text-center">
                            <div className="text-xs font-black uppercase text-white truncate group-hover/card:text-[#FABF18] transition-colors">
                              {tier.people} {tier.people === 1 ? 'Indicado' : 'Indicados'}
                            </div>
                            <div className="text-lg font-mono font-black text-[#FABF18] mt-0.5 drop-shadow">
                              R$ {tier.reward.toFixed(2)}
                            </div>
                          </div>

                          {/* Action Button */}
                          <div>
                            {isClaimed ? (
                              <div className="w-full bg-[#111]/80 py-1.5 text-[9px] text-stone-500 font-extrabold rounded-lg border border-stone-805/30 uppercase tracking-widest">
                                🔒 Concluido
                              </div>
                            ) : canClaim ? (
                              <button
                                onClick={() => onClaimPress(tier.reward, tier.key)}
                                disabled={claimLoading === tier.key}
                                className="w-full bg-gradient-to-r from-amber-500 to-[#FABF18] hover:from-amber-600 hover:to-yellow-500 text-stone-950 font-black py-1.5 rounded-lg text-[10px] uppercase transition-all tracking-wider cursor-pointer shadow-lg active:scale-95 hover:shadow-yellow-500/25"
                              >
                                {claimLoading === tier.key ? 'PROCESSANDO...' : '🎁 ABRIR BAÚ'}
                              </button>
                            ) : (
                              <div className="w-full bg-stone-900/50 py-1.5 text-[9px] rounded-lg font-black border border-stone-800/10 text-stone-500 text-center uppercase tracking-wider">
                                {invitedCount} / {tier.people} Amigos
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Connection Visual Arrow pointers */}
                        <div className="hidden md:block">
                          {showArrow && (
                            <div className={`absolute top-1/2 -translate-y-1/2 z-20 ${isLeftToRight ? '-right-4' : '-left-4'}`}>
                              {isLeftToRight ? (
                                <ArrowRight className="w-4 h-4 text-[#FABF18] opacity-50" />
                              ) : (
                                <ArrowLeft className="w-4 h-4 text-[#FABF18] opacity-50" />
                              )}
                            </div>
                          )}

                          {lastInRow && rowIndex < chunkedRows.length - 1 && (
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20">
                              <ArrowDown className="w-4 h-4 text-[#FABF18]/70 opacity-80 animate-bounce" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. TACTICS DESCRIPTION NOTEBOOK */}
      <div className="bg-[#FAF8EB] text-[#4A3B32] border-2 border-[#DCD6C2] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Soft watermark pattern */}
        <div className="absolute -bottom-16 -right-16 text-[150px] opacity-[2%] select-none font-black text-amber-900 font-serif">
          D
        </div>
        
        {/* Flag label badge */}
        <div className="inline-block bg-[#FABF18] text-[#142c23] font-black uppercase text-xs px-5 py-2.5 rounded-r-xl rounded-tl-sm relative -left-8 sm:-left-10 top-0 mb-5 shadow-lg tracking-wider">
          🧾 REGRAS E DIRETRIZES DO PROGRAMA
        </div>

        <div className="space-y-4 text-xs font-semibold leading-relaxed text-[#5C4033] font-sans">
          <p className="text-[#4A3B32] font-semibold text-xs sm:text-sm">
            O programa de afiliados da DamaBet visa expandir nossa rede certificada de maneira legítima e sustentável. Ao divulgar seu código, você concorda com as diretrizes de integridade abaixo:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-[#E3DEC3]/70">
            <div className="space-y-2.5">
              <span className="font-extrabold text-[#823a10] uppercase text-xs block">I. Ativação & Coleta de Envelopes:</span>
              <ul className="list-disc pl-4 space-y-1.5 text-stone-700">
                <li>Abra e acumule envelopes adicionais vitalícios à medida que sua rede do mesmo nível cresce e aposta na mesa.</li>
                <li>Qualquer bônus resgatado do programa possui <b>rollover simples de 1x</b> em qualquer modalidade de jogo antes de ser integrado ao canal principal de saque instantâneo.</li>
              </ul>
            </div>
            
            <div className="space-y-2.5">
              <span className="font-extrabold text-[#823a10] uppercase text-xs block">II. Normas Antifraude e Multicontas:</span>
              <ul className="list-disc pl-4 space-y-1.5 text-stone-700">
                <li>Contas registradas sob o mesmo IP de rede, cookies do navegador idênticos, aparelhos de hardware compartilhados ou dados de saque iguais são consideradas fraude pelo validador.</li>
                <li>Tentativas de abuso de bônus por arbitragem de checkout resultarão em congelamento seguro das contas e expiração dos saldos sob custódia.</li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-[#EFEAD8] rounded-xl border border-[#D0C9B3] text-[11px] leading-relaxed text-stone-800 shadow-inner">
            <span className="font-black text-[#823a10] block mb-1 uppercase tracking-wide">💡 NOTIFICAÇÃO DE CONTROLE DE CUSTÓDIA:</span>
            A DamaBet opera sob os mais rigorosos padrões SSL contra tentativas de fraude com monitoramento em tempo real de logs de sessão. Promova com integridade e desfrute de saques vitalícios sem limites!
          </div>
        </div>
      </div>

    </div>
  );
}
