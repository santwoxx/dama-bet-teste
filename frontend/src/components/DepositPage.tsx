import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Copy, CheckCircle2, QrCode } from 'lucide-react';

interface DepositPageProps {
  onActionComplete: () => void;
  token: string;
}

// Helper to generate a valid BR Code (PIX Copy/Paste) string
function generatePixString(amount: number): string {
  const key = "jssthiagosantossantana@gmail.com";
  const name = "THIAGO SANTOS SANTANA"; 
  const city = "SAO PAULO";
  const amountStr = amount.toFixed(2);
  
  const f = (id: string, value: string) => {
      const len = value.length.toString().padStart(2, '0');
      return `${id}${len}${value}`;
  };

  const merchantAccountInfo = f('00', 'br.gov.bcb.pix') + f('01', key);
  
  let payload = f('00', '01') +
                f('01', '11') +
                f('26', merchantAccountInfo) +
                f('52', '0000') +
                f('53', '986') +
                f('54', amountStr) +
                f('58', 'BR') +
                f('59', name) +
                f('60', city) +
                f('62', f('05', '***'));
                
  payload += '6304';
  
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
          if ((crc & 0x8000) !== 0) {
              crc = (crc << 1) ^ 0x1021;
          } else {
              crc = crc << 1;
          }
      }
  }
  crc &= 0xFFFF;
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
  return payload + crcHex;
}

export default function DepositPage({ onActionComplete, token }: DepositPageProps) {
  const [amount, setAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'input' | 'payment'>('input');

  const handleGeneratePix = async () => {
    if (!amount || amount < 10) {
      setError('O valor mínimo de depósito é R$ 10,00.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Simulate network delay for a professional feel
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const pixString = generatePixString(amount);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixString)}&margin=10`;

      setPixData({
        qrCode: pixString,
        qrCodeUrl: qrCodeUrl
      });
      setStep('payment');
    } catch (err: any) {
      setError('Falha ao gerar o código PIX.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto grid grid-cols-1 gap-6 items-start relative z-10 font-sans px-2">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-b from-[#1c1917] to-[#0d0c0b] border border-[#FABF18]/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative text-center overflow-hidden"
      >
        {/* Glow effects */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-[#FABF18] to-emerald-500 opacity-70" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#FABF18]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <h2 className="text-2xl font-black uppercase text-white tracking-wider mb-3 flex items-center justify-center gap-2 relative z-10">
          <span>⚡ Depositar via PIX</span>
          <Sparkles className="w-6 h-6 text-[#FABF18] animate-pulse" />
        </h2>
        
        {error && (
          <div className="bg-red-950/50 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-5 text-xs font-bold text-center shadow-inner">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'input' && (
            <motion.div 
              key="input"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-5 mt-4 relative z-10"
            >
              <p className="text-stone-400 text-xs font-medium leading-relaxed">
                Insira o valor que deseja depositar para gerar o QR Code. (Mínimo R$ 10,00)
              </p>

              <div className="grid grid-cols-3 gap-3 mb-5">
                {[10, 50, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className="bg-stone-900/50 hover:bg-[#FABF18]/10 border border-stone-800 hover:border-[#FABF18]/50 text-stone-300 hover:text-[#FABF18] font-black py-3 rounded-xl transition-all text-sm cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(250,191,24,0.15)]"
                  >
                    R$ {val}
                  </button>
                ))}
              </div>

              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#FABF18] font-black text-lg">R$</span>
                <input
                  type="number"
                  min="10"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0,00"
                  className="w-full bg-black/40 border-2 border-stone-800 rounded-xl py-4 pl-12 pr-4 text-white font-black text-xl outline-none focus:border-[#FABF18] focus:ring-4 focus:ring-[#FABF18]/10 transition-all placeholder:text-stone-700 shadow-inner"
                />
              </div>

              <button
                onClick={handleGeneratePix}
                disabled={loading}
                className="w-full mt-6 bg-gradient-to-r from-[#FABF18] via-amber-500 to-[#FABF18] text-stone-950 font-black py-4 px-4 rounded-xl shadow-lg uppercase text-sm tracking-widest cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(250,191,24,0.3)] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <QrCode className="w-5 h-5" />
                    GERAR PIX
                  </>
                )}
              </button>
            </motion.div>
          )}

          {step === 'payment' && pixData && (
            <motion.div 
              key="payment"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col items-center space-y-6 mt-4 relative z-10"
            >
              <div className="w-full bg-[#142c23]/60 border border-emerald-900/50 text-stone-100 p-4 rounded-xl flex items-center justify-between shadow-inner">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Valor a pagar</span>
                <span className="text-2xl font-black text-[#FABF18] drop-shadow-md">R$ {Number(amount).toFixed(2).replace('.', ',')}</span>
              </div>

              <div className="bg-white p-4 rounded-2xl shadow-2xl border-4 border-stone-800 relative group overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#FABF18]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <img 
                  src={pixData.qrCodeUrl} 
                  alt="QR Code PIX"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain mix-blend-multiply"
                />
              </div>
              
              <div className="w-full space-y-2">
                <p className="text-[10px] font-black uppercase text-stone-400 text-left flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#FABF18] rounded-full animate-pulse shadow-[0_0_8px_rgba(250,191,24,0.8)]" />
                  PIX Copia e Cola
                </p>
                <div className="flex bg-black/50 border border-stone-700 rounded-xl overflow-hidden relative group shadow-inner focus-within:border-[#FABF18] transition-colors">
                  <input 
                    type="text" 
                    readOnly 
                    value={pixData.qrCode} 
                    className="w-full bg-transparent text-xs text-stone-300 p-4 outline-none font-mono"
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="bg-stone-800 hover:bg-[#FABF18] border-l border-stone-700 px-5 flex items-center justify-center transition-colors text-stone-300 hover:text-stone-950 cursor-pointer shrink-0"
                    title="Copiar código PIX"
                  >
                    {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500 group-hover:text-stone-950" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="w-full pt-4 mt-2 border-t border-stone-800/50">
                <button
                  onClick={() => {
                    setPixData(null);
                    setStep('input');
                  }}
                  className="text-stone-500 hover:text-[#FABF18] text-xs font-black uppercase tracking-widest cursor-pointer transition-colors"
                >
                  ← Fazer novo depósito
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
