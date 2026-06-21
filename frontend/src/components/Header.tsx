import { useState } from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Plus, ArrowDownToLine, Settings, User, LogOut } from 'lucide-react';
import { Player, Transaction } from '../types';

interface HeaderProps {
  player: Player;
  transactions: Transaction[];
  onActionComplete: () => void;
  onRefreshGame?: () => void;
  onOpenReferrals?: () => void;
  onLogout?: () => void;
  onOpenDeposit?: () => void;
}

export default function Header({ player, transactions, onActionComplete, onRefreshGame, onOpenReferrals, onLogout, onOpenDeposit }: HeaderProps) {
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [modalType, setModalType] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('50');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pixKey] = useState(`pix-${player.id}@damabet.com`);
  const [withdrawalPixKey, setWithdrawalPixKey] = useState('');

  const handleWalletAction = async () => {
    setError('');
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Insira um valor maior que zero.');
      return;
    }

    if (modalType === 'withdraw' && player.balance < parsedAmount) {
      setError('Saldo de carteira virtual insuficiente.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = modalType === 'deposit' ? '/api/users/deposit' : '/api/users/withdraw';
      const token = localStorage.getItem('damabet_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const bodyData: any = {
        amount: parsedAmount,
      };

      if (modalType === 'withdraw') {
        bodyData.pixKey = withdrawalPixKey.trim() || player.email || pixKey;
      } else {
        bodyData.id = player.id;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro na transação');
      }

      setShowWalletModal(false);
      setWithdrawalPixKey('');
      onActionComplete();
    } catch (err: any) {
      setError(err.message || 'Houve um erro.');
    } finally {
      setLoading(false);
    }
  };

  const formattedBalance = player.balance.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const formattedBonus = (player.bonusBalance || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const formattedTotal = (player.balance + (player.bonusBalance || 0)).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return (
    <div className="w-full select-none" id="paciencia-header">
      {/* Real Top Header Bar - Tigrinho Enhanced */}
      <header className="bg-gradient-to-r from-[#143d22] via-[#102d19] to-[#07190e] text-stone-100 py-2 px-2 sm:py-2.5 sm:px-4 shadow-lg relative"
        style={{
          borderBottom: '2px solid',
          borderImage: 'linear-gradient(90deg, #FABF18, #d97706, #FABF18, #f59e0b, #FABF18) 1',
        }}
      >
        {/* Header glow line */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#FABF18] to-transparent opacity-50" />
        <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-[#FABF18]/30 to-transparent" />
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          
          {/* Left panel: Logo brand & Yellow action buttons */}
          <div className="flex items-center gap-3">
            {/* Logo Brand matching visual */}
            <div className="flex items-center gap-1.5 cursor-pointer">
              <span className="font-sans font-black text-xl sm:text-2xl tracking-tight uppercase italic flex items-center gap-0.5 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                <span className="text-white">Dama</span>
                <span className="text-[#FABF18] font-black italic">Bet</span>
              </span>
            </div>

            {/* Yellow button actions - Tigrinho Enhanced */}
            <div className="flex items-center gap-1.5 ml-2">
              <button
                id="btn-paciencia-help"
                onClick={() => setShowHelpModal(true)}
                className="bg-gradient-to-r from-[#FABF18] to-[#d97706] hover:from-[#f59e0b] hover:to-[#b45309] text-[#142c23] font-bold text-xs px-2.5 py-1.5 sm:px-3 sm:py-2 rounded flex items-center gap-1 uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm font-sans relative overflow-hidden btn-shimmer"
              >
                <span className="font-extrabold text-[#142c23]">?</span> AJUDA
              </button>
              
              <button
                id="btn-paciencia-new"
                onClick={() => {
                  if (onRefreshGame) {
                    onRefreshGame();
                  } else {
                    window.location.reload();
                  }
                }}
                className="bg-gradient-to-r from-[#FABF18] to-[#d97706] hover:from-[#f59e0b] hover:to-[#b45309] text-[#142c23] font-extrabold text-xs px-2.5 py-1.5 sm:px-3 sm:py-2 rounded flex items-center gap-1 uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm font-sans relative overflow-hidden btn-shimmer"
              >
                + NOVO
              </button>

              <button
                id="btn-paciencia-settings"
                onClick={() => setShowHelpModal(true)}
                className="bg-[#143d22] hover:bg-emerald-800 text-[#FABF18] p-2 rounded transition-all duration-200 cursor-pointer border border-[#FABF18]/50 pulse-ring"
                title="Configurações do Jogo"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right panel: Game selectors & Custom safe PIX balance */}
          <div className="flex items-center gap-4 text-xs">
            {/* Nav links matching image */}
            <div className="flex items-center gap-3 text-stone-200 font-semibold font-sans">
              <span onClick={() => { if(onRefreshGame) onRefreshGame(); }} className="hidden sm:inline hover:text-[#FABF18] cursor-pointer transition-colors">Multiplayer</span>
              <button
                onClick={() => { if(onOpenReferrals) onOpenReferrals(); }}
                className="bg-gradient-to-r from-[#FABF18] to-[#d97706] hover:from-[#f59e0b] hover:to-[#b45309] text-[#142c23] px-1.5 sm:px-2.5 py-1 rounded font-black text-[8px] sm:text-xs uppercase flex items-center gap-1 shadow-lg animate-bounce relative overflow-hidden btn-shimmer"
              >
                👑 <span className="hidden sm:inline">INDIQUE E GANHE</span><span className="sm:hidden">GANHE</span>
              </button>
            </div>

            {/* Live Wallet Balance - Tigrinho Glow */}
            <div className="flex items-center gap-1 sm:gap-2 bg-[#1b4335]/70 px-2 sm:px-3 py-1 sm:py-1.5 rounded border border-[#FABF18]/45 text-stone-100 shadow-lg pulse-ring">
              <div className="flex flex-col items-start leading-none">
                {player.bonusBalance && player.bonusBalance > 0 ? (
                  <>
                    <span className="text-[7px] sm:text-[7.5px] uppercase font-bold tracking-wider text-emerald-400">Total Jogável</span>
                    <span className="text-[11px] sm:text-sm font-mono font-black text-[#FABF18] mt-0.5">{formattedTotal}</span>
                    <span className="text-[6px] sm:text-[7px] text-stone-400 font-medium">Real {formattedBalance} + Bônus {formattedBonus}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[7px] sm:text-[8px] uppercase font-bold tracking-wider text-emerald-400">Simulador Bet</span>
                    <span className="text-[11px] sm:text-sm font-mono font-black text-amber-300 mt-0.5">{formattedBalance}</span>
                  </>
                )}
              </div>
              <div className="flex gap-1 ml-1.5">
                <button
                  id="header-deposit"
                  onClick={() => {
                    if (onOpenDeposit) {
                      onOpenDeposit();
                    } else {
                      setModalType('deposit');
                      setShowWalletModal(true);
                    }
                  }}
                  title="Depositar fundos via PIX"
                  className="bg-gradient-to-br from-[#FABF18] to-[#d97706] hover:from-[#f59e0b] hover:to-[#b45309] text-stone-900 p-1 rounded font-black transition-all shadow-[0_0_8px_rgba(250,191,24,0.3)] hover:shadow-[0_0_12px_rgba(250,191,24,0.5)]"
                >
                  <Plus className="w-3 h-3 text-[#142c23] stroke-[3px]" />
                </button>
                <button
                  id="header-withdraw"
                  onClick={() => {
                    setModalType('withdraw');
                    setShowWalletModal(true);
                  }}
                  title="Sacar fundos virtuais"
                  className="bg-[#142c23] hover:bg-emerald-950 text-stone-300 p-1 rounded border border-[#2b5d4a] transition-all hover:border-[#FABF18]/50 hover:shadow-[0_0_8px_rgba(250,191,24,0.2)]"
                >
                  <ArrowDownToLine className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Profile area styled cleanly */}
            <div className="flex items-center gap-1.5 text-stone-300">
              <div className="w-6 h-6 bg-emerald-950/80 rounded-full border border-emerald-700 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="font-medium hidden sm:inline max-w-[80px] truncate" title={player.name}>{player.name}</span>
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Sair da Conta (Desconectar celular ou PC)"
                  className="bg-red-950/40 hover:bg-red-900/60 transition-colors text-rose-400 p-1.5 rounded cursor-pointer border border-rose-900/30 ml-1.5 flex items-center justify-center hover:border-rose-500/50 hover:shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

        </div>
      </header>

      {/* Virtual Wallet PIX Simulation Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in text-stone-100">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-[#18181b] border border-stone-750 rounded-lg w-full max-w-md p-6 shadow-2xl overflow-hidden relative card-glow"
          >
            <motion.div
              className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18]"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {/* Corner accents */}
            <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#FABF18]/20 rounded-tl" />
            <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#FABF18]/20 rounded-tr" />
            <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-[#FABF18]/20 rounded-bl" />
            <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-[#FABF18]/20 rounded-br" />

            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-bold text-amber-400">
                  {modalType === 'deposit' ? 'Adicionar Saldo PIX' : 'Solicitar Retirada PIX'}
                </h3>
                <p className="text-[10px] uppercase tracking-wider text-stone-400">Processamento financeiro seguro</p>
              </div>
              <button
                className="text-stone-400 hover:text-stone-200 transition-colors bg-stone-800 w-6 h-6 rounded flex items-center justify-center text-xs"
                onClick={() => setShowWalletModal(false)}
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900/60 text-red-400 p-2 text-xs rounded mb-4">
                ⚠️ {error}
              </div>
            )}

            <div className="space-y-4">
              {modalType === 'deposit' && (
                <div className="bg-gradient-to-br from-emerald-950/60 to-stone-900 border border-emerald-500/25 p-3.5 rounded-lg text-xs space-y-1 bg-black/30">
                  <div className="flex items-center gap-1.5 font-bold text-[#FABF18] text-sm animate-pulse uppercase tracking-tight">
                    ⚽ TEMPORADA DA COPA DO MUNDO 2026
                  </div>
                  <p className="text-[10.5px] text-stone-300 leading-normal">
                    Deposite hoje mesmo e ganhe bônus de campo espetaculares:
                  </p>
                  <ul className="text-[10px] space-y-1 text-stone-300 mt-1 pl-1 list-none font-medium">
                    <li className="flex justify-between border-b border-stone-800 pb-1">
                      <span>• Deposite <b className="text-stone-100">R$ 20</b>:</span>
                      <span className="text-[#3ee268] font-bold">GANHE R$ 50 DE BÔNUS</span>
                    </li>
                    <li className="flex justify-between border-b border-stone-800 pb-1">
                      <span>• Deposite <b className="text-stone-100">R$ 50</b>:</span>
                      <span className="text-[#3ee268] font-bold">GANHE R$ 120 DE BÔNUS</span>
                    </li>
                    <li className="flex justify-between pb-1">
                      <span>• Deposite <b className="text-stone-100">R$ 100+</b>:</span>
                      <span className="text-[#3ee268] font-bold">GANHE R$ 250 DE BÔNUS</span>
                    </li>
                  </ul>
                  <div className="text-[8.5px] text-[#A9F3A6]/80 pt-1 border-t border-stone-850 mt-1.5 leading-none italic font-mono">
                    * Válido até 19 de julho de 2026. Rollover de 3x em apostas de jogos.
                  </div>
                </div>
              )}

              {player.rolloverRequired && player.rolloverRequired > 0 ? (
                <div className="bg-zinc-950 p-3.5 rounded-lg border border-amber-500/20 text-xs space-y-2">
                  <div className="flex items-center justify-between text-[10.5px] font-bold text-[#FABF18]">
                    <span>🎯 PROGRESSO DO ROLLOVER DA COPA:</span>
                    <span className="font-mono text-[10px]">
                      {((player.rolloverWagered || 0) / player.rolloverRequired * 100).toFixed(0)}%
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-stone-900 rounded-full h-2 overflow-hidden border border-stone-800">
                    <div 
                      className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, ((player.rolloverWagered || 0) / player.rolloverRequired * 100))}%` }}
                    />
                  </div>
                  
                  <div className="flex justify-between text-[9px] text-stone-400 font-mono">
                    <span>Apostado: R$ {(player.rolloverWagered || 0).toFixed(2)}</span>
                    <span>Requerido: R$ {player.rolloverRequired.toFixed(2)}</span>
                  </div>
                  
                  <p className="text-[10px] text-[#ffa3a3] leading-normal italic">
                    * Retirada PIX indisponível até cumprir totalmente o rollover estipulado.
                  </p>
                </div>
              ) : null}

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#999] mb-1.5">
                  {modalType === 'deposit' ? 'Sugestões de Depósito (R$)' : 'Sugestões de Saque (R$)'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['20', '50', '100', '200'].map((val) => (
                    <button
                      key={val}
                      onClick={() => setAmount(val)}
                      type="button"
                      className={`text-xs font-mono font-bold py-2 rounded border transition-all ${
                        amount === val
                          ? 'bg-[#FABF18]/15 border-[#FABF18] text-[#FABF18]'
                          : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      R$ {val}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <input
                  type="number"
                  placeholder="Ou insira valor personalizado..."
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-750 rounded px-3 py-2 text-sm text-[#FABF18] focus:outline-none focus:border-[#FABF18]"
                />
              </div>

              {modalType === 'withdraw' && (
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-amber-400 mb-1.5 font-bold">
                    Chave PIX de Destino
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CPF, Telefone, E-mail ou Chave Aleatória..."
                    value={withdrawalPixKey}
                    onChange={(e) => setWithdrawalPixKey(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-750 rounded px-3 py-2 text-sm text-[#FABF18] focus:outline-none focus:border-[#FABF18]"
                  />
                </div>
              )}

              <div className="bg-stone-950/80 p-3 rounded border border-stone-850 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Chave PIX {modalType === 'withdraw' ? 'de Destino' : '(E-mail)'}:</span>
                  <span className="font-mono text-stone-300 truncate max-w-[180px]" title={modalType === 'withdraw' ? (withdrawalPixKey || player.email || pixKey) : (player.email || pixKey)}>
                    {modalType === 'withdraw' ? (withdrawalPixKey || player.email || pixKey) : (player.email || pixKey)}
                  </span>
                </div>
                {modalType === 'deposit' ? (
                  <p className="text-[10.5px] text-stone-400">O depósito via PIX do Mercado Pago será creditado na sua conta automaticamente.</p>
                ) : (
                  <p className="text-[10.5px] text-[#FABF18] font-medium">A solicitação de saque será enviada. O administrador processará a transferência manual via PIX em breve.</p>
                )}
              </div>

              <button
                onClick={handleWalletAction}
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#FABF18] via-[#d97706] to-[#FABF18] hover:from-[#f59e0b] hover:to-[#b45309] text-stone-950 font-black text-xs py-3 rounded uppercase tracking-wider transition-all duration-150 cursor-pointer btn-shimmer overflow-hidden shadow-lg hover:shadow-[0_0_20px_rgba(250,191,24,0.4)]"
                style={{ backgroundSize: '200% 100%' }}
              >
                {loading ? 'Processando transação...' : modalType === 'deposit' ? '✦ EFETUAR DEPÓSITO PIX ✦' : '✦ SOLICITAR RETIRADA PIX ✦'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* DAMA.BET Help Modal - Tigrinho Enhanced */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in text-stone-100">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-[#18181b] border border-stone-800 rounded-lg w-full max-w-lg p-6 shadow-2xl overflow-hidden relative font-sans card-glow"
          >
            <motion.div
              className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18]"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
            {/* Corner accents */}
            <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#FABF18]/20 rounded-tl" />
            <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#FABF18]/20 rounded-tr" />
            <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-[#FABF18]/20 rounded-bl" />
            <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-[#FABF18]/20 rounded-br" />
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-base font-bold text-[#FABF18] gold-glow uppercase tracking-widest flex items-center gap-1.5">
                👑 Regras e Guia do Damas Online
              </h3>
              <button
                className="text-stone-400 hover:text-stone-200 transition-colors bg-stone-800 w-6 h-6 rounded flex items-center justify-center text-xs hover:bg-stone-700 hover:shadow-[0_0_10px_rgba(250,191,24,0.3)]"
                onClick={() => setShowHelpModal(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3 text-xs text-stone-300 overflow-y-auto max-h-[350px] leading-relaxed pr-1">
              <p className="font-semibold text-white">Como jogar Damas no DamaBet?</p>
              <p>O jogo de damas é um clássico de estratégia que remonta a séculos. Nesta versão moderna, você joga em um tabuleiro 8x8 onde seu objetivo é capturar todas as peças adversárias ou bloqueá-las de modo que não possam fazer movimentos.</p>
              
              <p className="font-semibold text-white">Regras Importantes (Brasileira / Internacional):</p>
              <ul className="list-disc list-inside space-y-1 text-stone-400">
                <li>As peças normais movem-se apenas diagonalmente e para a frente, 1 casa por vez.</li>
                <li><b>Captura Obrigatória:</b> Se houver um salto disponível, você deve obrigatoriamente realizar a captura diagonal das peças inimigas!</li>
                <li><b>Sequência de Saltos:</b> Se ao capturar você cair em uma posição que permita outra captura, deve continuar o salto com a mesma peça.</li>
                <li><b>Promoção (👑 Dama):</b> Ao atingir o lado oposto do tabuleiro, sua peça vira Dama. A dama move-se múltiplas casas na diagonal, tanto para frente quanto para trás.</li>
              </ul>

              <p className="font-semibold text-white">Sistema Bet e Validação de Duelos:</p>
              <p>Esta plataforma possui um inovador painel de desafios virtuais. Você pode configurar uma aposta com fundos simulados de sua carteira virtual e desafiar jogadores automáticos em tempo real ou amigos.</p>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="mt-6 w-full bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold py-2 rounded text-xs"
            >
              Fechar Guia de Jogo
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}


