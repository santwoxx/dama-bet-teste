import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CircleDollarSign, Copy, Check, RotateCw, Clock, QrCode, Sparkles, AlertCircle, Calendar } from 'lucide-react';
import { playWinSound } from '../utils/audio';

interface DepositPageProps {
  onActionComplete: () => void;
  token: string;
}

interface DepositHistoryItem {
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  approvedAt: string | null;
}

export default function DepositPage({ onActionComplete, token }: DepositPageProps) {
  const [amount, setAmount] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrCodeBase64, setQrCodeBase64] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'approved' | 'rejected' | 'expired' | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [history, setHistory] = useState<DepositHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch deposit history
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const resp = await fetch('/api/deposits', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Error fetching deposit history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleGeneratePix = async () => {
    setError('');
    setQrCode('');
    setQrCodeBase64('');
    setPaymentId('');
    setPaymentStatus(null);
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 5) {
      setError('O valor mínimo de depósito é R$ 5,00.');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch('/api/deposit/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: parsedAmount })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erro ao criar o PIX.');
      }

      setQrCode(data.qrCode);
      setQrCodeBase64(data.qrCodeBase64);
      setPaymentId(data.paymentId);
      setPaymentStatus('pending');
      
      // Start status polling
      startPolling(data.paymentId);
    } catch (err: any) {
      setError(err.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (id: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    
    const startTime = Date.now();
    let currentInterval = 3000; // 3 seconds initially

    const checkStatus = async () => {
      try {
        const resp = await fetch(`/api/deposit/status/${id}`);
        if (!resp.ok) return;
        const data = await resp.json();
        
        if (data.status === 'approved') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPaymentStatus('approved');
          try { playWinSound(); } catch {}
          onActionComplete();
          fetchHistory();
        } else if (data.status === 'expired' || data.status === 'rejected') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPaymentStatus(data.status);
          fetchHistory();
        }
      } catch (err) {
        console.error('Error polling deposit status:', err);
      }
    };

    // Immediate first check
    checkStatus();

    // Periodic check
    const runPoll = () => {
      pollTimerRef.current = setInterval(() => {
        checkStatus();
        
        // After 60 seconds, switch to 10 seconds interval
        const elapsed = Date.now() - startTime;
        if (elapsed > 60000 && currentInterval === 3000) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          currentInterval = 10000;
          runPoll();
        }
      }, currentInterval);
    };

    runPoll();
  };

  const handleCopyCode = () => {
    if (!qrCode) return;
    navigator.clipboard.writeText(qrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 items-start relative z-10 font-sans px-2">
      
      {/* LEFT COLUMN: PIX FORM & CODE VIEWER */}
      <div className="md:col-span-7 bg-[#FAF8EB] text-[#4A3B32] border-2 border-[#DCD6C2] rounded-2xl p-6 sm:p-8 shadow-2xl relative">
        {/* Shimmer header accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18] rounded-t-xl" />
        <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#FABF18]/30 rounded-tl" />
        <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#FABF18]/30 rounded-tr" />
        
        <h2 className="text-xl font-black uppercase text-[#4A3B32] tracking-wider mb-2 flex items-center gap-2">
          <span>⚡ Depositar via PIX</span>
          <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
        </h2>
        <p className="text-stone-600 text-xs mb-5 font-medium leading-relaxed">
          Gere um PIX dinâmico do Mercado Pago. O saldo e seus bônus da Copa do Mundo serão creditados instantaneamente assim que a transferência for confirmada.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs mb-4 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* PIX Form when no payment is generated */}
        {!paymentStatus && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-[10px] font-black uppercase text-stone-500 tracking-wider mb-1.5">
                Valor do depósito
              </label>
              
              {/* Shortcut Value Chips */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {['20', '50', '100', '200'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val)}
                    className={`py-2.5 rounded-xl text-xs font-mono font-bold transition-all duration-150 cursor-pointer ${
                      amount === val
                        ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-stone-950 shadow-md ring-2 ring-[#FABF18] scale-105'
                        : 'bg-[#EFEAD8] border border-[#DDD6BF] hover:border-amber-400 hover:bg-[#FAF8EB]'
                    }`}
                  >
                    R$ {val}
                  </button>
                ))}
              </div>

              {/* Custom Value input */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center font-bold text-stone-500 text-sm">
                  R$
                </span>
                <input
                  type="number"
                  placeholder="Outro valor (Mínimo R$ 5,00)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-[#EFEAD8] border border-[#DDD6BF] rounded-xl text-sm font-bold placeholder-stone-500 text-[#4A3B32] focus:outline-none focus:ring-2 focus:ring-[#FABF18] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Copa do Mundo Promotional Reminder */}
            <div className="bg-[#1b4335]/10 border border-[#FABF18]/40 p-3.5 rounded-xl text-xs flex gap-2">
              <span className="text-base shrink-0">🎁</span>
              <div>
                <span className="font-bold text-emerald-850 block mb-0.5">Bônus da Copa do Mundo 2026</span>
                <span className="text-stone-600 block text-[10.5px]">
                  • R$20+ ganha +R$50 • R$50+ ganha +R$120 • R$100+ ganha +R$250. Rollover 3x.
                </span>
              </div>
            </div>

            <button
              onClick={handleGeneratePix}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#FABF18] via-[#d97706] to-[#FABF18] text-[#142c23] font-black py-4 px-4 rounded-xl shadow-lg uppercase text-xs tracking-wider cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(250,191,24,0.4)] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  Gerando Código PIX...
                </>
              ) : (
                <>
                  <CircleDollarSign className="w-4 h-4" />
                  GERAR PIX DE DEPÓSITO
                </>
              )}
            </button>
          </div>
        )}

        {/* PIX Generated View */}
        {paymentStatus && (
          <div className="space-y-5 text-center animate-fade-in">
            {paymentStatus === 'pending' && (
              <div className="bg-amber-100/60 border border-amber-300/40 p-3.5 rounded-xl text-xs inline-flex items-center gap-2 text-amber-800 font-bold uppercase tracking-wider animate-pulse">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Aguardando transferência... (Validade 30 min)</span>
              </div>
            )}

            {paymentStatus === 'approved' && (
              <div className="bg-emerald-100 border border-emerald-350 p-4 rounded-xl text-xs flex flex-col items-center gap-2 text-emerald-800 font-bold">
                <span className="text-2xl">🎉</span>
                <span className="uppercase text-sm">Depósito confirmado!</span>
                <span className="font-medium text-stone-600 text-center mt-1">
                  Seu saldo foi atualizado com sucesso. Você já pode voltar ao lobby e se divertir nas mesas!
                </span>
                <button
                  onClick={() => {
                    setPaymentStatus(null);
                    setQrCode('');
                  }}
                  className="mt-3 bg-emerald-800 hover:bg-emerald-750 text-white font-bold px-4 py-2 rounded-lg text-xs"
                >
                  Fazer outro depósito
                </button>
              </div>
            )}

            {paymentStatus === 'expired' && (
              <div className="bg-stone-100 border border-stone-300 p-4 rounded-xl text-xs flex flex-col items-center gap-1.5 text-stone-700 font-bold">
                <span className="text-xl">⚠️</span>
                <span className="uppercase">PIX Expirado</span>
                <span className="font-medium text-stone-500 text-center">
                  O tempo de 30 minutos esgotou e este PIX expirou. Por favor, gere um novo código.
                </span>
                <button
                  onClick={() => setPaymentStatus(null)}
                  className="mt-2.5 bg-stone-850 hover:bg-stone-800 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {paymentStatus === 'rejected' && (
              <div className="bg-red-100 border border-red-300 p-4 rounded-xl text-xs flex flex-col items-center gap-1.5 text-red-700 font-bold">
                <span className="text-xl">❌</span>
                <span className="uppercase">PIX Cancelado/Recusado</span>
                <span className="font-medium text-stone-500 text-center">
                  O pagamento foi cancelado ou ocorreu uma divergência. Tente gerar um novo.
                </span>
                <button
                  onClick={() => setPaymentStatus(null)}
                  className="mt-2.5 bg-red-800 hover:bg-red-750 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {paymentStatus === 'pending' && qrCodeBase64 && (
              <div className="flex flex-col items-center gap-4 bg-white p-5 rounded-2xl border border-stone-250 inline-block shadow-inner">
                <img
                  src={`data:image/png;base64,${qrCodeBase64}`}
                  alt="Mercado Pago PIX QR Code"
                  className="w-48 h-48 rounded"
                />
                <div className="text-[10px] text-stone-400 font-bold flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5 text-amber-500" />
                  <span>Escaneie com o app do seu banco para pagar</span>
                </div>
              </div>
            )}

            {paymentStatus === 'pending' && qrCode && (
              <div className="space-y-2 text-left">
                <label className="block text-[10px] font-black uppercase text-stone-500 tracking-wider mb-1">
                  Copia e Cola PIX (Pix Copia e Cola)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={qrCode}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="block w-full bg-[#EFEAD8] border border-[#DDD6BF] rounded-xl px-3 py-2.5 text-[11px] font-mono text-stone-600 select-all focus:outline-none"
                  />
                  <button
                    onClick={handleCopyCode}
                    className="bg-[#143d22] hover:bg-emerald-900 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all text-xs cursor-pointer shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {paymentStatus === 'pending' && (
              <button
                onClick={() => setPaymentStatus(null)}
                className="text-[11px] text-stone-500 hover:text-stone-750 underline block mx-auto font-medium"
              >
                Voltar e alterar valor
              </button>
            )}
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: RECENT DEPOSITS HISTORY */}
      <div className="md:col-span-5 bg-[#111111]/90 border border-amber-800/30 rounded-2xl p-6 shadow-2xl backdrop-blur-sm text-stone-100">
        <h3 className="font-black text-xs uppercase tracking-wider text-[#FABF18] border-b border-amber-800/20 pb-3 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Histórico de Depósitos</span>
        </h3>

        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
          {loadingHistory ? (
            <div className="text-center py-8 text-xs text-stone-500 flex flex-col items-center gap-2">
              <RotateCw className="w-5 h-5 animate-spin text-amber-500" />
              <span>Carregando histórico...</span>
            </div>
          ) : history.length > 0 ? (
            history.map((item, idx) => (
              <div
                key={idx}
                className="bg-black/25 border border-stone-850 p-3 rounded-xl flex items-center justify-between text-xs font-sans"
              >
                <div className="space-y-1">
                  <div className="font-mono font-black text-stone-100">
                    R$ {item.amount.toFixed(2).replace('.', ',')}
                  </div>
                  <div className="text-[10px] text-stone-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-stone-600" />
                    <span>{new Date(item.createdAt).toLocaleDateString('pt-BR')} {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    item.status === 'approved' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/40' :
                    item.status === 'pending' ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40 animate-pulse' :
                    item.status === 'expired' ? 'bg-zinc-900 text-stone-500 border border-stone-800' :
                    'bg-red-950/60 text-rose-400 border border-rose-900/40'
                  }`}>
                    {item.status === 'approved' ? 'Confirmado' :
                     item.status === 'pending' ? 'Aguardando' :
                     item.status === 'expired' ? 'Expirado' : 'Recusado'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-stone-500 text-xs flex flex-col items-center gap-2">
              <span>Nenhum depósito recente encontrado.</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
