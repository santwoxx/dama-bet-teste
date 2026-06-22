import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  Copy, 
  RotateCw, 
  Clock, 
  Sparkles, 
  AlertCircle, 
  Calendar, 
  Search, 
  Filter, 
  User, 
  Key, 
  DollarSign, 
  XCircle,
  TrendingUp
} from 'lucide-react';

interface AdminDashboardProps {
  token: string;
}

interface AdminWithdrawal {
  id: string;
  userId: string;
  userName?: string;
  amount: number;
  pixKey: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled' | 'failed';
  createdAt: string;
  approvedAt?: string;
}

export default function AdminDashboard({ token }: AdminDashboardProps) {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // PIX key copy feedback state
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copiedAmountId, setCopiedAmountId] = useState<string | null>(null);

  const fetchWithdrawals = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/admin/withdrawals', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || 'Erro ao carregar saques.');
      }
      const data = await resp.json();
      setWithdrawals(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
  }, [token]);

  const handleUpdateStatus = async (withdrawalId: string, nextStatus: 'approved' | 'rejected' | 'processing') => {
    setError('');
    setSuccessMsg('');
    setActionLoading(withdrawalId);
    try {
      const resp = await fetch('/api/admin/withdrawals/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ withdrawalId, status: nextStatus })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erro ao atualizar status.');
      }
      setSuccessMsg(data.message || 'Solicitação de saque atualizada.');
      // Refresh list
      await fetchWithdrawals();
    } catch (err: any) {
      setError(err.message || 'Erro de conexão.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleCopyAmount = (amount: number, id: string) => {
    navigator.clipboard.writeText(amount.toFixed(2));
    setCopiedAmountId(id);
    setTimeout(() => setCopiedAmountId(null), 2000);
  };

  // Filter and search logic
  const filteredWithdrawals = withdrawals.filter((w) => {
    const nameMatch = w.userName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      w.userId.toLowerCase().includes(searchQuery.toLowerCase());
    const keyMatch = w.pixKey.toLowerCase().includes(searchQuery.toLowerCase());
    const queryMatch = searchQuery ? (nameMatch || keyMatch) : true;
    
    const filterMatch = statusFilter === 'all' ? true : w.status === statusFilter;
    
    return queryMatch && filterMatch;
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'processing': return 'Processando';
      case 'approved': return 'Pago';
      case 'rejected': return 'Recusado';
      case 'cancelled': return 'Cancelado';
      case 'failed': return 'Falhou';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/40';
      case 'pending': return 'bg-amber-950/60 text-amber-400 border border-amber-900/40 animate-pulse';
      case 'processing': return 'bg-orange-950/60 text-orange-400 border border-orange-900/40';
      case 'rejected': return 'bg-red-950/60 text-rose-400 border border-rose-900/40';
      default: return 'bg-zinc-900 text-stone-500 border border-stone-800';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 relative z-10 font-sans px-2 text-stone-100">
      
      {/* HEADER SECTION */}
      <div className="bg-[#111111]/95 border-2 border-[#FABF18]/85 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#FABF18] via-amber-500 to-[#FABF18]" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black uppercase text-[#FABF18] tracking-wider mb-2 flex items-center gap-2">
              <span>👑 Painel Administrativo de Saques</span>
              <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
            </h2>
            <p className="text-stone-400 text-xs sm:text-sm font-medium">
              Gerencie e processe as solicitações de saques PIX dos jogadores. Faça a transferência manual e mude o status.
            </p>
          </div>
          <button
            onClick={fetchWithdrawals}
            disabled={loading}
            className="self-start md:self-auto bg-stone-900 hover:bg-stone-850 border border-amber-800/30 text-amber-400 hover:text-amber-300 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* STATS OVERVIEW */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-stone-850">
          <div className="bg-black/40 border border-stone-850 p-3 rounded-xl text-center">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">Pendentes</span>
            <span className="text-lg font-mono font-black text-amber-400">
              {withdrawals.filter(w => w.status === 'pending').length}
            </span>
          </div>
          <div className="bg-black/40 border border-stone-850 p-3 rounded-xl text-center">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">Processando</span>
            <span className="text-lg font-mono font-black text-orange-400">
              {withdrawals.filter(w => w.status === 'processing').length}
            </span>
          </div>
          <div className="bg-black/40 border border-stone-850 p-3 rounded-xl text-center">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">Aprovados (Pagos)</span>
            <span className="text-lg font-mono font-black text-emerald-400">
              {withdrawals.filter(w => w.status === 'approved').length}
            </span>
          </div>
          <div className="bg-black/40 border border-stone-850 p-3 rounded-xl text-center">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">Total Saques</span>
            <span className="text-lg font-mono font-black text-stone-300">
              {withdrawals.length}
            </span>
          </div>
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-950/80 border border-red-800/40 text-red-400 p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-950/80 border border-emerald-800/40 text-emerald-400 p-4 rounded-xl text-xs font-semibold flex items-center gap-2.5"
          >
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTROLS (SEARCH & FILTER) */}
      <div className="bg-[#111111]/90 border border-stone-850 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center">
        
        {/* Search */}
        <div className="relative w-full sm:flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Buscar por Chave PIX, Usuário ou ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-9 pr-3 py-2.5 bg-black/40 border border-stone-800 rounded-xl text-xs font-bold text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-[#FABF18] focus:border-[#FABF18] transition-all"
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <Filter className="w-3.5 h-3.5 text-stone-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-black/40 border border-stone-800 text-stone-300 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FABF18]"
          >
            <option value="all">Todos os Status</option>
            <option value="pending">Pendentes</option>
            <option value="processing">Processando</option>
            <option value="approved">Pagos (Aprovados)</option>
            <option value="rejected">Recusados</option>
            <option value="cancelled">Cancelados</option>
            <option value="failed">Falhas</option>
          </select>
        </div>
      </div>

      {/* WITHDRAWALS LIST */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-16 bg-[#111111]/90 border border-stone-850 rounded-2xl flex flex-col items-center gap-3">
            <RotateCw className="w-8 h-8 animate-spin text-[#FABF18]" />
            <span className="text-stone-400 text-xs font-semibold uppercase tracking-wider">Carregando solicitações de saque...</span>
          </div>
        ) : filteredWithdrawals.length > 0 ? (
          filteredWithdrawals.map((w) => (
            <div
              key={w.id}
              className="bg-[#111111]/90 border border-stone-850 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row gap-5 justify-between items-start md:items-center relative overflow-hidden transition-all duration-200 hover:border-amber-900/20"
            >
              
              {/* Left Column: User, PIX, Date, Amount */}
              <div className="space-y-3.5 flex-1 w-full">
                
                {/* Header: User Profile & Date */}
                <div className="flex items-center justify-between border-b border-stone-850/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-950 flex items-center justify-center text-[#FABF18]">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-stone-100 block">
                        {w.userName || 'Jogador'}
                      </span>
                      <span className="font-mono text-[9px] text-stone-500 block">
                        ID: {w.userId}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] text-stone-500 font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-stone-600" />
                    <span>{new Date(w.createdAt).toLocaleDateString('pt-BR')} {new Date(w.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </div>

                {/* Body Details: Amount & PIX Key */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* Amount Row */}
                  <div className="bg-black/35 rounded-xl p-3 border border-stone-900 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-stone-500 font-bold block uppercase tracking-wider">Valor Solicitado</span>
                      <span className="font-mono text-base font-black text-amber-400">
                        R$ {w.amount.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyAmount(w.amount, w.id)}
                      className="bg-stone-900 hover:bg-stone-850 p-1.5 rounded-lg text-stone-400 hover:text-stone-200 transition-all cursor-pointer shrink-0"
                      title="Copiar Valor"
                    >
                      {copiedAmountId === w.id ? (
                        <Check className="w-4 h-4 text-emerald-400 animate-scale" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* PIX Key Row */}
                  <div className="bg-black/35 rounded-xl p-3 border border-stone-900 flex items-center justify-between">
                    <div className="overflow-hidden">
                      <span className="text-[9px] text-stone-500 font-bold block uppercase tracking-wider">
                        Chave PIX ({w.pixKeyType.toUpperCase()})
                      </span>
                      <span className="font-mono text-xs font-bold text-stone-300 block truncate" title={w.pixKey}>
                        {w.pixKey}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyKey(w.pixKey, w.id)}
                      className="bg-stone-900 hover:bg-stone-850 p-1.5 rounded-lg text-stone-400 hover:text-stone-200 transition-all cursor-pointer shrink-0"
                      title="Copiar Chave PIX"
                    >
                      {copiedKeyId === w.id ? (
                        <Check className="w-4 h-4 text-emerald-400 animate-scale" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-stone-500 font-bold uppercase tracking-wider">Status Atual:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${getStatusColor(w.status)}`}>
                    {getStatusLabel(w.status)}
                  </span>
                </div>

              </div>

              {/* Right Column: Control Buttons */}
              <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-stone-850/60 shrink-0 md:justify-center md:items-stretch">
                {w.status === 'pending' && (
                  <button
                    onClick={() => handleUpdateStatus(w.id, 'processing')}
                    disabled={actionLoading !== null}
                    className="flex-1 bg-stone-900 border border-orange-850 hover:bg-orange-950/20 text-orange-400 font-black py-2.5 px-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {actionLoading === w.id ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5" />
                        <span>Processar</span>
                      </>
                    )}
                  </button>
                )}

                {(w.status === 'pending' || w.status === 'processing') && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(w.id, 'approved')}
                      disabled={actionLoading !== null}
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-800 text-white hover:from-emerald-500 hover:to-emerald-700 font-black py-2.5 px-4 rounded-xl text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer shadow-lg hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {actionLoading === w.id ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Marcar Pago</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleUpdateStatus(w.id, 'rejected')}
                      disabled={actionLoading !== null}
                      className="bg-stone-950 border border-red-950 hover:bg-red-950/20 text-red-400 font-black py-2.5 px-3 rounded-xl text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {actionLoading === w.id ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Recusar</span>
                        </>
                      )}
                    </button>
                  </>
                )}

                {(w.status === 'approved' || w.status === 'rejected' || w.status === 'cancelled' || w.status === 'failed') && (
                  <span className="text-[10px] font-bold text-stone-600 text-center py-2 italic select-none">
                    Finalizado em {w.approvedAt ? new Date(w.approvedAt).toLocaleDateString('pt-BR') : 'N/D'}
                  </span>
                )}
              </div>

            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-[#111111]/90 border border-stone-850 rounded-2xl text-stone-500 text-xs font-semibold flex flex-col items-center gap-2">
            <span>Nenhuma solicitação de saque encontrada para os filtros selecionados.</span>
          </div>
        )}
      </div>

    </div>
  );
}
