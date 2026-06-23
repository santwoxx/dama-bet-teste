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
    if (!amount || amount < 5) {
      setError('O valor mínimo de depósito é R$ 5,00.');
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
        className="bg-[#FAF8EB] text-[#4A3B32] border-2 border-[#DCD6C2] rounded-2xl p-6 sm:p-8 shadow-2xl relative text-center overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18] rounded-t-xl" />
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#FABF18]/30 rounded-tl" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#FABF18]/30 rounded-tr" />
        <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-[#FABF18]/30 rounded-bl" />
        <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-[#FABF18]/30 rounded-br" />

        <h2 className="text-xl font-black uppercase text-[#4A3B32] tracking-wider mb-2 flex items-center justify-center gap-2">
          <span>⚡ Depositar via PIX</span>
          <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
        </h2>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded mb-4 text-xs font-bold text-center">
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
              className="space-y-4 mt-4"
            >
              <p className="text-stone-600 text-xs font-medium leading-relaxed">
                Insira o valor que deseja depositar para gerar o QR Code. (Mínimo R$ 5,00)
              </p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[20, 50, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className="bg-[#EFEAD8] hover:bg-[#FABF18]/20 border border-[#DCD6C2] hover:border-[#FABF18] text-[#5C4033] font-black py-2 rounded transition-all text-sm cursor-pointer"
                  >
                    R$ {val}
                  </button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-bold">R$</span>
                <input
                  type="number"
                  min="5"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0,00"
                  className="w-full bg-white border border-[#DCD6C2] rounded-lg py-3 pl-10 pr-4 text-[#4A3B32] font-bold outline-none focus:border-[#FABF18] focus:ring-2 focus:ring-[#FABF18]/20 transition-all"
                />
              </div>

              <button
                onClick={handleGeneratePix}
                disabled={loading}
                className="w-full mt-4 bg-gradient-to-r from-[#FABF18] via-[#d97706] to-[#FABF18] text-[#142c23] font-black py-4 px-4 rounded-xl shadow-lg uppercase text-xs tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(250,191,24,0.4)] disabled:opacity-70"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-[#142c23] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
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
              className="flex flex-col items-center space-y-5 mt-4"
            >
              <div className="w-full bg-[#142c23] text-stone-100 p-3 rounded-lg flex items-center justify-between shadow-md">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-300">Valor a pagar</span>
                <span className="text-lg font-black text-[#FABF18]">R$ {Number(amount).toFixed(2).replace('.', ',')}</span>
              </div>

              <div className="bg-white p-3 rounded-xl shadow-inner border border-stone-200 relative group">
                <div className="absolute inset-0 border-4 border-[#FABF18] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <img 
                  src={pixData.qrCodeUrl} 
                  alt="QR Code PIX"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              </div>
              
              <div className="w-full">
                <p className="text-[10px] font-black uppercase text-[#999] mb-1.5 text-left flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  PIX Copia e Cola
                </p>
                <div className="flex bg-white border border-[#DCD6C2] rounded-lg overflow-hidden relative group shadow-sm">
                  <input 
                    type="text" 
                    readOnly 
                    value={pixData.qrCode} 
                    className="w-full bg-transparent text-[10px] sm:text-xs text-stone-600 p-3 outline-none"
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="bg-[#EFEAD8] hover:bg-[#FABF18] border-l border-[#DCD6C2] px-4 flex items-center justify-center transition-colors text-[#5C4033] hover:text-[#142c23] cursor-pointer shrink-0"
                    title="Copiar código PIX"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="w-full border-t border-[#DCD6C2] pt-5 mt-2 space-y-3">


                <button
                  onClick={() => {
                    setPixData(null);
                    setStep('input');
                  }}
                  className="text-stone-500 hover:text-stone-700 text-[10px] font-bold uppercase tracking-widest underline cursor-pointer mt-4"
                >
                  Fazer novo depósito / Voltar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
