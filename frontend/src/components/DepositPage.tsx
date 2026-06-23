import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Copy, CheckCircle2, QrCode } from 'lucide-react';

interface DepositPageProps {
  onActionComplete: () => void;
  token: string;
}

export default function DepositPage({ onActionComplete, token }: DepositPageProps) {
  const [amount, setAmount] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ paymentId: string; qrCode: string; qrCodeBase64: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const API_URL = import.meta.env.VITE_API_URL || '';

  const handleGeneratePix = async () => {
    if (!amount || amount < 5) {
      setError('O valor mínimo de depósito é R$ 5,00.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/deposit/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao gerar PIX.');
      }

      setPixData({
        paymentId: data.paymentId,
        qrCode: data.qrCode,
        qrCodeBase64: data.qrCodeBase64
      });
      setStatus('pending');
    } catch (err: any) {
      setError(err.message || 'Falha na comunicação com o servidor.');
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

  useEffect(() => {
    if (!pixData || status !== 'pending') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/deposit/status/${pixData.paymentId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        
        if (data.status === 'approved') {
          setStatus('approved');
          clearInterval(interval);
          setTimeout(() => {
            onActionComplete();
          }, 3000);
        } else if (data.status === 'rejected' || data.status === 'cancelled') {
          setStatus('rejected');
          clearInterval(interval);
          setError('O pagamento foi rejeitado ou expirou.');
        }
      } catch (err) {
        console.error('Error polling deposit status', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pixData, status, token, onActionComplete]);

  return (
    <div className="w-full max-w-xl mx-auto grid grid-cols-1 gap-6 items-start relative z-10 font-sans px-2">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#FAF8EB] text-[#4A3B32] border-2 border-[#DCD6C2] rounded-2xl p-6 sm:p-8 shadow-2xl relative text-center"
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

        {!pixData ? (
          <div className="space-y-4">
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
          </div>
        ) : status === 'approved' ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-4 animate-fade-in">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2 shadow-[0_0_30px_rgba(52,211,153,0.5)]">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black text-emerald-600 uppercase tracking-widest">
              Pagamento Aprovado!
            </h3>
            <p className="text-sm font-bold text-stone-600">
              R$ {amount} creditados na sua conta.
            </p>
            <p className="text-[10px] text-stone-500 animate-pulse">Redirecionando...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-5 animate-fade-in">
            <div className="bg-white p-3 rounded-xl shadow-inner border border-stone-200">
              <img 
                src={pixData.qrCodeBase64.startsWith('data:') ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`} 
                alt="QR Code PIX"
                className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
              />
            </div>
            
            <div className="w-full">
              <p className="text-[10px] font-black uppercase text-[#999] mb-1.5 text-left">PIX Copia e Cola</p>
              <div className="flex bg-white border border-[#DCD6C2] rounded-lg overflow-hidden relative group">
                <input 
                  type="text" 
                  readOnly 
                  value={pixData.qrCode} 
                  className="w-full bg-transparent text-xs text-stone-600 p-3 outline-none"
                />
                <button 
                  onClick={copyToClipboard}
                  className="bg-[#EFEAD8] hover:bg-[#FABF18] border-l border-[#DCD6C2] px-4 flex items-center justify-center transition-colors text-[#5C4033] hover:text-[#142c23] cursor-pointer"
                  title="Copiar código PIX"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 text-[11px] font-bold text-amber-600 bg-amber-50 px-4 py-2 rounded-full border border-amber-200 shadow-sm animate-pulse">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Aguardando confirmação do pagamento...
            </div>
            
            <button
              onClick={() => {
                setPixData(null);
                setStatus('pending');
              }}
              className="text-stone-500 hover:text-stone-700 text-xs underline cursor-pointer mt-2"
            >
              Cancelar / Voltar
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
