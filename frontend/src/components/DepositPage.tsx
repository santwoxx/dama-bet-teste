import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Copy, CheckCircle2, QrCode, Clock, PartyPopper, XCircle } from 'lucide-react';

interface DepositPageProps {
  onActionComplete: () => void;
  token: string;
}

interface PixData {
  depositId: string;
  qrCode: string;
  qrCodeUrl: string;
  amount: number;
}

type Step = 'input' | 'payment' | 'awaiting_review' | 'approved' | 'rejected';

const STATUS_POLL_INTERVAL_MS = 4000;

export default function DepositPage({ onActionComplete, token }: DepositPageProps) {
  const [amount, setAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleGeneratePix = async () => {
    if (!amount || amount < 5) {
      setError('O valor mínimo de depósito é R$ 5,00.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const resp = await fetch('/api/deposit/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Falha ao gerar o código PIX.');

      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.qrCode)}&margin=10`;
      setPixData({
        depositId: data.depositId,
        qrCode: data.qrCode,
        qrCodeUrl,
        amount: data.amount,
      });
      setStep('payment');
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar o código PIX.');
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

  const pollDepositStatus = (depositId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/deposit/status/${depositId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.status === 'approved') {
          stopPolling();
          setStep('approved');
          onActionComplete();
        } else if (data.status === 'rejected' || data.status === 'expired') {
          stopPolling();
          setStep('rejected');
        }
      } catch {
        // Transient network hiccup — the next tick will retry.
      }
    }, STATUS_POLL_INTERVAL_MS);
  };

  const handleConfirmPayment = async () => {
    if (!pixData) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/api/deposit/${pixData.depositId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Falha ao confirmar o pagamento.');

      setStep('awaiting_review');
      pollDepositStatus(pixData.depositId);
    } catch (err: any) {
      setError(err.message || 'Falha ao confirmar o pagamento.');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    stopPolling();
    setPixData(null);
    setAmount('');
    setError('');
    setStep('input');
  };

  return (
    <div className="w-full max-w-xl mx-auto grid grid-cols-1 gap-6 items-start relative z-10 font-sans px-2">
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
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

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-red-950/50 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-5 text-xs font-bold text-center shadow-inner overflow-hidden"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
              className="space-y-5 mt-4 relative z-10"
            >
              <p className="text-stone-400 text-xs font-medium leading-relaxed">
                Insira o valor que deseja depositar para gerar o QR Code. (Mínimo R$ 5,00)
              </p>

              <div className="grid grid-cols-3 gap-3 mb-5">
                {[20, 50, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className="bg-stone-900/50 hover:bg-[#FABF18]/10 border border-stone-800 hover:border-[#FABF18]/50 text-stone-300 hover:text-[#FABF18] font-black py-3 rounded-xl transition-all text-sm cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(250,191,24,0.15)] active:scale-95"
                  >
                    R$ {val}
                  </button>
                ))}
              </div>

              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#FABF18] font-black text-lg">R$</span>
                <input
                  type="number"
                  min="5"
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
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center space-y-6 mt-4 relative z-10"
            >
              <div className="w-full bg-[#142c23]/60 border border-emerald-900/50 text-stone-100 p-4 rounded-xl flex items-center justify-between shadow-inner">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Valor a pagar</span>
                <span className="text-2xl font-black text-[#FABF18] drop-shadow-md">R$ {pixData.amount.toFixed(2).replace('.', ',')}</span>
              </div>

              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="bg-white p-4 rounded-2xl shadow-2xl border-4 border-stone-800 relative group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-[#FABF18]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <img
                  src={pixData.qrCodeUrl}
                  alt="QR Code PIX"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain mix-blend-multiply"
                />
              </motion.div>

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

              <button
                onClick={handleConfirmPayment}
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-4 px-4 rounded-xl shadow-lg uppercase text-sm tracking-widest cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    JÁ PAGUEI
                  </>
                )}
              </button>

              <p className="text-[10.5px] text-stone-500 leading-relaxed">
                Após pagar, clique em "Já paguei" para avisar o administrador. O saldo é liberado assim que o pagamento for conferido manualmente.
              </p>

              <button
                onClick={resetFlow}
                className="text-stone-500 hover:text-[#FABF18] text-xs font-black uppercase tracking-widest cursor-pointer transition-colors"
              >
                ← Fazer novo depósito
              </button>
            </motion.div>
          )}

          {step === 'awaiting_review' && (
            <motion.div
              key="awaiting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center space-y-5 mt-4 py-6 relative z-10"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 rounded-full border-4 border-[#FABF18]/20 border-t-[#FABF18] flex items-center justify-center"
              >
                <Clock className="w-6 h-6 text-[#FABF18]" />
              </motion.div>
              <div>
                <p className="text-white font-black uppercase text-sm tracking-wider">Pagamento em análise</p>
                <p className="text-stone-400 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                  Recebemos sua confirmação. Assim que o administrador validar o PIX, o saldo cai automaticamente na sua conta.
                </p>
              </div>
            </motion.div>
          )}

          {step === 'approved' && pixData && (
            <motion.div
              key="approved"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: 'backOut' }}
              className="flex flex-col items-center space-y-5 mt-4 py-6 relative z-10"
            >
              <motion.div
                initial={{ rotate: -15 }}
                animate={{ rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 12 }}
              >
                <PartyPopper className="w-16 h-16 text-emerald-400" />
              </motion.div>
              <div>
                <p className="text-emerald-400 font-black uppercase text-sm tracking-wider">Depósito aprovado!</p>
                <p className="text-stone-400 text-xs mt-2">
                  R$ {pixData.amount.toFixed(2).replace('.', ',')} já está disponível no seu saldo.
                </p>
              </div>
              <button
                onClick={resetFlow}
                className="bg-gradient-to-r from-[#FABF18] via-amber-500 to-[#FABF18] text-stone-950 font-black py-3 px-6 rounded-xl shadow-lg uppercase text-xs tracking-widest cursor-pointer active:scale-95 transition-all"
              >
                Fazer novo depósito
              </button>
            </motion.div>
          )}

          {step === 'rejected' && (
            <motion.div
              key="rejected"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center space-y-5 mt-4 py-6 relative z-10"
            >
              <XCircle className="w-14 h-14 text-red-400" />
              <div>
                <p className="text-red-400 font-black uppercase text-sm tracking-wider">Depósito não confirmado</p>
                <p className="text-stone-400 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                  O administrador não localizou esse pagamento. Se você já pagou, entre em contato pelo suporte.
                </p>
              </div>
              <button
                onClick={resetFlow}
                className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-black py-3 px-6 rounded-xl shadow-lg uppercase text-xs tracking-widest cursor-pointer active:scale-95 transition-all"
              >
                Tentar novamente
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
