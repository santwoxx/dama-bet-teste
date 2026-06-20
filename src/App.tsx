import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Coins, PlusCircle, Play, ArrowRight, UserCheck, Users, Copy, Send, HelpCircle, Mail, User, Lock, Eye, EyeOff, LogOut, Key, Sparkles, CircleDollarSign, Gem, Crown } from 'lucide-react';
import { Game, Player, Transaction, MoveCoordinates, PlayerColor } from './types';
import Header from './components/Header';
import CheckersBoard from './components/CheckersBoard';
import ReferralsDashboard from './components/ReferralsDashboard';
import VictoryAnimation from './components/VictoryAnimation';
import { playReactionSound, playWinSound, playMoveSound, playCaptureSound } from './utils/audio';
import { motion, AnimatePresence } from 'motion/react';

// ─── Sparkle Background Overlay (Tigrinho Style) ─────────────────────
function SparkleBg({ density = 15, className = '' }: { density?: number; className?: string }) {
  const sparkles = React.useMemo(() =>
    Array.from({ length: density }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      size: 3 + Math.random() * 5,
      duration: 3 + Math.random() * 4,
    })), [density]);

  return (
    <div className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${className}`}>
      {sparkles.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full bg-[#FABF18]"
          style={{
            left: `${s.left}%`,
            bottom: '-10px',
            width: s.size,
            height: s.size,
            boxShadow: `0 0 ${s.size * 2}px rgba(250,191,24,0.6), 0 0 ${s.size * 4}px rgba(250,191,24,0.2)`,
          }}
          animate={{
            y: [0, -window.innerHeight * (0.5 + Math.random() * 0.5)],
            opacity: [0, 1, 0.8, 0],
            scale: [0, 1, 0.8, 0],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ─── Floating Fortune Particles ───────────────────────────────────────
function FortuneParticles() {
  const items = React.useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      delay: Math.random() * 8,
      emoji: ['💰', '✨', '🎰', '💎', '🪙', '👑', '🌟', '🔥'][i],
      size: 16 + Math.random() * 16,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {items.map((item) => (
        <motion.div
          key={item.id}
          className="absolute"
          style={{ left: `${item.left}%`, top: '-5%', fontSize: item.size }}
          animate={{
            y: [0, window.innerHeight * (0.6 + Math.random() * 0.4)],
            x: [0, (Math.random() - 0.5) * 100],
            rotate: [0, 360],
            opacity: [0, 0.6, 0.4, 0],
          }}
          transition={{
            duration: 12 + Math.random() * 8,
            delay: item.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {item.emoji}
        </motion.div>
      ))}
    </div>
  );
}

export default function App() {
  // Account Identity (Stored in localStorage for session persistence)
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Authentication states (No-Firebase system)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAutoAuthenticating, setIsAutoAuthenticating] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // App views: 'lobby' | 'game'
  const [currentView, setCurrentView] = useState<'lobby' | 'game'>('lobby');
  
  // Game states
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [lobbyGames, setLobbyGames] = useState<Game[]>([]);
  const [betAmount, setBetAmount] = useState<number>(10);
  
  // Secondary simulated player (for local sandbox play)
  const [secondaryUserId, setSecondaryUserId] = useState<string>('');
  const [secondaryPlayer, setSecondaryPlayer] = useState<Player | null>(null);
  const [sandboxModeActive, setSandboxModeActive] = useState<boolean>(false);

  // Paciencia.co Customization parameters

  const [selectedDifficulty, setSelectedDifficulty] = useState<'FÁCIL' | 'MÉDIO' | 'DIFÍCIL' | 'ULTRA'>('MÉDIO');
  const [boardConfig, setBoardConfig] = useState<'8X8-8' | '8X8-12' | '10X10-20'>('8X8-12');
  
  // Tab views and affiliate simulation states
  const [lobbyTab, setLobbyTab] = useState<'play' | 'referral'>('play');
  const [invitedCount, setInvitedCount] = useState<number>(() => {
    const saved = localStorage.getItem('damabet_invited_count');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [claimedRewards, setClaimedRewards] = useState<string[]>(() => {
    const saved = localStorage.getItem('damabet_claimed_rewards');
    return saved ? JSON.parse(saved) : [];
  });

  // Inputs & loaders
  const [chatText, setChatText] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [lobbyError, setLobbyError] = useState('');
  const [gameError, setGameError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Floating reactions & Victory overlay states
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; delay: number; styleLeft: number }[]>([]);
  const [showVictoryOverlay, setShowVictoryOverlay] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Social proof stats
  const [onlinePlayers, setOnlinePlayers] = useState(842);
  const [activeMatches, setActiveMatches] = useState(237);
  const [weeklyRanking, setWeeklyRanking] = useState<{ id: string; name: string; total: number }[]>([]);
  const [lastWinners, setLastWinners] = useState<{ playerName: string; amount: number; timestamp: string }[]>([]);

  useEffect(() => {
    if (!activeGame || activeGame.status !== 'active' || !activeGame.startedAt) {
      setRemainingSeconds(null);
      return;
    }

    const updateTimer = () => {
      const startedMs = new Date(activeGame.startedAt!).getTime();
      const elapsedMs = Date.now() - startedMs;
      const remainingMs = Math.max(0, 600000 - elapsedMs); // 10 minutes limit (600,000 ms)
      setRemainingSeconds(Math.ceil(remainingMs / 1000));
    };

    updateTimer();
    const timerId = setInterval(updateTimer, 1000);

    return () => clearInterval(timerId);
  }, [activeGame?.id, activeGame?.status, activeGame?.startedAt]);

  // Social proof polling
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setOnlinePlayers(data.onlinePlayers);
        setActiveMatches(data.activeMatches);
      } catch {}
    };
    const fetchRanking = async () => {
      try {
        const res = await fetch('/api/ranking/weekly');
        const data = await res.json();
        setWeeklyRanking(data.ranking || []);
      } catch {}
    };
    const fetchWinners = async () => {
      try {
        const res = await fetch('/api/ranking/last-winners');
        const data = await res.json();
        setLastWinners(data.winners || []);
      } catch {}
    };

    fetchStats(); fetchRanking(); fetchWinners();
    const statsInt = setInterval(fetchStats, 5000);
    const rankInt = setInterval(fetchRanking, 30000);
    const winInt = setInterval(fetchWinners, 15000);
    return () => { clearInterval(statsInt); clearInterval(rankInt); clearInterval(winInt); };
  }, []);

  const triggerEmojiReaction = (emoji: string) => {
    const newReaction = {
      id: `reaction-${Math.random().toString(36).substring(2, 9)}`,
      emoji,
      delay: Math.random() * 0.15,
      styleLeft: 8 + Math.random() * 84, // random x percentage inside parent bounds
    };
    setFloatingReactions((prev) => [...prev, newReaction]);
    // Play a delightful micro-audio reaction sound effect
    playReactionSound();
  };

  // References for SSE connections
  const lobbySseRef = useRef<EventSource | null>(null);
  const gameSseRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const gameStageRef = useRef<HTMLDivElement | null>(null);
  const lastChatLengthRef = useRef<number>(0);
  const activeGameRef = useRef<Game | null>(null);
  activeGameRef.current = activeGame;
  const prevPiecesLenRef = useRef(0);

  // 1. Boot up: Verify stored token or prompt login
  useEffect(() => {
    const savedToken = localStorage.getItem('damabet_token');

    // Create secondary local player in case sandbox is activated
    let secId = localStorage.getItem('damabet_secUserId');
    if (!secId) {
      secId = 'sec_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('damabet_secUserId', secId);
    }
    setSecondaryUserId(secId);
    fetchSecondaryProfile(secId);

    if (savedToken) {
      const autoLogin = async () => {
        try {
          const resp = await fetch('/api/auth/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: savedToken }),
          });
          const data = await resp.json();
          if (resp.ok && data.success) {
            setUserId(data.user.id);
            setUserName(data.user.name);
            setPlayer(data.user);
            setIsAuthenticated(true);
            
            // Initial loads
            fetchProfile(data.user.id);
          } else {
            // Clear invalid token
            localStorage.removeItem('damabet_token');
            setIsAuthenticated(false);
          }
        } catch {
          setIsAuthenticated(false);
        } finally {
          setIsAutoAuthenticating(false);
        }
      };
      autoLogin();
    } else {
      setIsAuthenticated(false);
      setIsAutoAuthenticating(false);
    }
  }, []);

  // 2. Load profiles
  const fetchProfile = async (idOfUser: string) => {
    try {
      const resp = await fetch(`/api/users/profile?id=${idOfUser}`);
      if (resp.ok) {
        const data = await resp.json();
        setPlayer(data.user || data.player);
        setTransactions(data.transactions);
      }
    } catch {
      // safe fallback
    }
  };

  const fetchSecondaryProfile = async (idOfUser: string) => {
    try {
      const resp = await fetch(`/api/users/profile?id=${idOfUser}`);
      if (resp.ok) {
        const data = await resp.json();
        setSecondaryPlayer(data.user || data.player);
      }
    } catch {
      // safe fallback
    }
  };

  const handleLogin = async (usernameInput: string, passwordInput: string) => {
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setAuthError('Por favor, preencha todos os campos.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erro ao realizar login.');
      }
      
      // Save session token (seguro, não salva senha)
      localStorage.setItem('damabet_token', data.token);
      localStorage.setItem('damabet_userId', data.user.id);
      localStorage.setItem('damabet_userName', data.user.name);
      
      setUserId(data.user.id);
      setUserName(data.user.name);
      setPlayer(data.user);
      setIsAuthenticated(true);

      fetchProfile(data.user.id);
    } catch (err: any) {
      setAuthError(err.message || 'Erro de conexão.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (usernameInput: string, emailInput: string, passwordInput: string, confirmPasswordInput: string) => {
    if (!usernameInput.trim() || !emailInput.trim() || !passwordInput.trim() || !confirmPasswordInput.trim()) {
      setAuthError('Por favor, preencha todos os campos.');
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      setAuthError('As senhas não coincidem. Repita a mesma senha.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput,
          email: emailInput,
          password: passwordInput
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erro ao criar conta.');
      }
      
      // Save session token (seguro, não salva senha)
      localStorage.setItem('damabet_token', data.token);
      localStorage.setItem('damabet_userId', data.user.id);
      localStorage.setItem('damabet_userName', data.user.name);
      
      setUserId(data.user.id);
      setUserName(data.user.name);
      setPlayer(data.user);
      setIsAuthenticated(true);

      fetchProfile(data.user.id);
    } catch (err: any) {
      setAuthError(err.message || 'Erro de conexão.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    const token = localStorage.getItem('damabet_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    localStorage.removeItem('damabet_token');
    localStorage.removeItem('damabet_userId');
    localStorage.removeItem('damabet_userName');
    setUserId('');
    setUserName('');
    setPlayer(null);
    setIsAuthenticated(false);
  };

  const handleClaimReferralReward = async (amount: number, tierKey: string) => {
    if (claimedRewards.includes(tierKey)) return;
    try {
      const response = await fetch('/api/users/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: userId,
          amount: amount,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao depositar recompensa');
      }

      const nextClaimed = [...claimedRewards, tierKey];
      setClaimedRewards(nextClaimed);
      localStorage.setItem('damabet_claimed_rewards', JSON.stringify(nextClaimed));
      
      await fetchProfile(userId);
    } catch (err) {
      console.error(err);
    }
  };

  // 3. Setup Lobby SSE stream
  useEffect(() => {
    if (currentView === 'lobby') {
      if (lobbySseRef.current) lobbySseRef.current.close();
      
      const sse = new EventSource('/api/lobby/stream');
      lobbySseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) {
            setLobbyGames(data);
          } else if (data.games) {
            setLobbyGames(data.games);
          }
        } catch {
          // ignore
        }
      };

      sse.onerror = () => {
        sse.close();
      };

      return () => {
        sse.close();
      };
    }
  }, [currentView]);

  // 4. Setup Active Game SSE stream
  useEffect(() => {
    if (currentView === 'game' && activeGameId) {
      if (gameSseRef.current) gameSseRef.current.close();

      const sse = new EventSource(`/api/games/stream?gameId=${activeGameId}`);
      gameSseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const incoming = data && data.id ? data : (data && data.game ? data.game : null);
          if (!incoming) return;

          if (incoming.status === 'active' && incoming.pieces) {
            const prevLen = prevPiecesLenRef.current;
            const curLen = incoming.pieces.length;
            if (prevLen > 0 && curLen > 0 && curLen !== prevLen) {
              if (curLen < prevLen) playCaptureSound();
              else playMoveSound();
            } else if (prevLen > 0 && curLen === prevLen) {
              playMoveSound();
            }
            prevPiecesLenRef.current = curLen;
          }

          setActiveGame(incoming);
          if (incoming.status === 'finished') {
            fetchProfile(userId);
          }
        } catch {
          // ignore
        }
      };

      sse.onerror = () => {
        sse.close();
      };

      return () => {
        sse.close();
      };
    }
  }, [currentView, activeGameId]);

  // Auto scroll layouts inside their respective container divs without scrolling the whole page
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activeGame?.log]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [activeGame?.chat]);

  // Trigger reaction emoji on screen whenever a new message with emoji is posted
  useEffect(() => {
    if (!activeGame || !activeGame.chat) {
      lastChatLengthRef.current = 0;
      return;
    }
    const currentLength = activeGame.chat.length;
    if (currentLength > lastChatLengthRef.current) {
      const newMessages = activeGame.chat.slice(lastChatLengthRef.current);
      const emojisList = ['😂', '🤫', '😎', '🔥', '💸', '👑', '😱', '💥', '🧠', '❓', '💪', '🍀', '😢', '😜', '👏', '💣', '😡', '💩'];
      newMessages.forEach((m) => {
        const textClean = m.text.trim();
        if (emojisList.includes(textClean)) {
          triggerEmojiReaction(textClean);
        }
      });
      lastChatLengthRef.current = currentLength;
    } else if (currentLength < lastChatLengthRef.current) {
      lastChatLengthRef.current = currentLength;
    }
  }, [activeGame?.chat]);

  // Turn on victory layout automatically when the match is completed
  useEffect(() => {
    if (activeGame && activeGame.status === 'finished') {
      setShowVictoryOverlay(true);
      if (activeGame.winnerId === userId) {
        playWinSound();
      }
    } else {
      setShowVictoryOverlay(false);
    }
  }, [activeGame?.status, activeGame?.winnerId, userId]);

  useEffect(() => {
    if (currentView === 'game' && activeGame) {
      const scrollTimer = setTimeout(() => {
        gameStageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(scrollTimer);
    }
  }, [currentView, activeGameId]);

  // URL Query joining logic helper
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomToJoin = params.get('joinRoom');
    if (roomToJoin && lobbyGames.length > 0 && player) {
      // strip queries to keep url elegant
      window.history.replaceState({}, document.title, window.location.pathname);
      handleJoinGame(roomToJoin);
    }
  }, [lobbyGames, player]);

  // Profile Updating
  const updateProfileName = async () => {
    if (!userName.trim()) return;
    try {
      const response = await fetch('/api/users/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, name: userName.trim() }),
      });
      if (response.ok) {
        setIsEditingName(false);
        localStorage.setItem('damabet_userName', userName.trim());
        fetchProfile(userId);
      }
    } catch {
      // error fallback
    }
  };

  // Actions trigger: CREATE PVP GAME
  const handleCreateGame = async () => {
    setLobbyError('');
    if (!player) return;

    if (player.balance < betAmount) {
      setLobbyError(`Saldo virtual insuficiente (R$ ${player.balance.toFixed(2)}) para cobrir aposta de R$ ${betAmount.toFixed(2)}.`);
      return;
    }

    setCreateLoading(true);
    try {
      const response = await fetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: userId, betAmount }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao inicializar');
      }

      setActiveGameId(data.game.id);
      setActiveGame(data.game);
      setCurrentView('game');
      fetchProfile(userId);
    } catch (err: any) {
      setLobbyError(err.message || 'Houve um erro.');
    } finally {
      setCreateLoading(false);
    }
  };



  // Actions: JOIN MATCH
  const handleJoinGame = async (gameId: string) => {
    setLobbyError('');
    if (!player) return;

    const gameToJoin = lobbyGames.find((g) => g.id === gameId);
    if (gameToJoin && player.balance < gameToJoin.betAmount) {
      setLobbyError(`Saldo insuficiente de R$ ${player.balance.toFixed(2)} para cobrir aposta de R$ ${gameToJoin.betAmount.toFixed(2)}.`);
      return;
    }

    setJoinLoading(true);
    try {
      const response = await fetch('/api/games/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId: userId, gameId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível entrar.');
      }

      setActiveGameId(data.game.id);
      setActiveGame(data.game);
      setCurrentView('game');
      fetchProfile(userId);
    } catch (err: any) {
      setLobbyError(err.message || 'Houve um erro.');
    } finally {
      setJoinLoading(false);
    }
  };

  // Actions: CONFIRM BET LOCK
  const handleConfirmBet = useCallback(async (actorId: string) => {
    if (!activeGameId) return;
    try {
      const response = await fetch('/api/games/confirm-bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: actorId, gameId: activeGameId }),
      });
      if (!response.ok) {
        const d = await response.json();
        setGameError(d.error || 'Erro ao certificar aposta.');
      } else {
        setGameError('');
      }
    } catch {
      // fail silently
    }
  }, [activeGameId]);

  // Actions: SUBMIT MOVE
  const handleMoveSubmitted = useCallback(async (move: MoveCoordinates) => {
    if (!activeGameId) return;
    try {
      // Determine sender
      let actingPlayerId = userId;
      if (sandboxModeActive) {
        const g = activeGameRef.current!;
        actingPlayerId = g.turn === 'red' ? g.host.id : g.guest!.id;
      }

      const response = await fetch('/api/games/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: actingPlayerId,
          gameId: activeGameId,
          move,
        }),
      });

      if (!response.ok) {
        const d = await response.json();
        setGameError(d.error || 'Jogada inválida rejeitada.');
      } else {
        setGameError('');
      }
    } catch {
      // ignore
    }
  }, [activeGameId, userId, sandboxModeActive]);

  // Actions: RESIGN MATCH
  const handleResign = useCallback(async (actorId: string) => {
    if (!activeGameId) return;
    try {
      await fetch('/api/games/resign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: actorId, gameId: activeGameId }),
      });
    } catch {
      // fail
    }
  }, [activeGameId]);

  // Actions: ASK DRAW
  const handleDrawVote = useCallback(async (actorId: string) => {
    if (!activeGameId) return;
    try {
      const response = await fetch('/api/games/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: actorId, gameId: activeGameId }),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload.statusMsg) {
          alert(`Sistema: ${payload.statusMsg}`);
        }
      }
    } catch {
      // fail
    }
  }, [activeGameId]);

  // Actions: CANCEL WAITING GAME
  const handleCancelGame = async () => {
    if (!activeGameId) return;
    if (!window.confirm('Confirmar cancelamento da mesa em andamento? O valor reterá de volta para sua conta.')) return;

    try {
      const response = await fetch('/api/games/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: userId, gameId: activeGameId }),
      });
      if (response.ok) {
        handleExitToLobby();
      }
    } catch {
      // fail
    }
  };

  // Actions: SEND CHAT
  const handleSendChat = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() || !activeGameId || !player) return;

    // determine sender in sandbox vs normal
    let sId = userId;
    let sName = player.name;
    if (sandboxModeActive) {
      const g = activeGameRef.current!;
      sId = g.turn === 'red' ? g.host.id : g.guest!.id;
      sName = g.turn === 'red' ? g.host.name : g.guest!.name;
    }

    try {
      setChatText('');
      await fetch('/api/games/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: sId,
          senderName: sName,
          text: chatText.trim(),
          gameId: activeGameId,
        }),
      });
    } catch {
      // fail
    }
  }, [chatText, activeGameId, player, userId, sandboxModeActive]);

  // Actions: LEAVE GAME ARENA
  const handleExitToLobby = useCallback(() => {
    if (gameSseRef.current) gameSseRef.current.close();
    setActiveGameId(null);
    setActiveGame(null);
    setSandboxModeActive(false);
    setGameError('');
    setCurrentView('lobby');
    if (player) fetchProfile(player.id);
  }, [player]);

  const copyRoomInviteLink = () => {
    if (!activeGameId) return;
    const path = `${window.location.origin}/?joinRoom=${activeGameId}`;
    navigator.clipboard.writeText(path);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Determine user visual role on checkers layout board
  let layoutUserColorRole: PlayerColor | 'both' = 'both';
  if (activeGame) {
    if (sandboxModeActive) {
      layoutUserColorRole = 'both';
    } else if (activeGame.host.id === userId) {
      layoutUserColorRole = 'red';
    } else if (activeGame.guest?.id === userId) {
      layoutUserColorRole = 'black';
    }
  }

  if (isAutoAuthenticating) {
    return (
      <div className="min-h-screen bg-[#07190e] text-white flex flex-col items-center justify-center font-sans relative overflow-hidden"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(38, 5, 7, 0.45) 0%, rgba(10, 1, 2, 0.92) 100%), url("https://i.ibb.co/Qjxgcs76/Whats-App-Image-2026-06-16-at-00-39-02.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <SparkleBg density={20} />
        <FortuneParticles />
        <div className="z-10 flex flex-col items-center gap-6 text-center px-4">
          {/* Animated golden ring spinner */}
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-[#FABF18]/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-t-4 border-b-4 border-[#FABF18] animate-spin" />
            <div className="absolute inset-4 rounded-full bg-[#FABF18]/10 blur-sm animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">🎰</span>
            </div>
          </div>
          <h1 className="font-sans font-black text-3xl tracking-tight uppercase italic gold-glow">
            <span className="text-white">Dama</span>
            <span className="text-[#FABF18] font-black italic">Bet</span>
          </h1>
          <p className="text-[#FABF18] font-mono text-[10px] font-bold tracking-widest uppercase animate-pulse">
            ✦ Carregando sua sessão segura... ✦
          </p>
          <div className="flex gap-1.5">
            {[0,1,2,3,4].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-[#FABF18]"
                animate={{ scale: [1, 0.3, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !player) {
    return (
      <div className="min-h-screen bg-[#07190e] text-white flex flex-col items-center justify-center font-sans relative px-4 py-8 overflow-hidden"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(11, 45, 25, 0.6) 0%, rgba(5, 17, 9, 0.94) 100%), url("https://i.ibb.co/Qjxgcs76/Whats-App-Image-2026-06-16-at-00-39-02.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}>
        <div className="absolute inset-0 bg-[#051109]/75 backdrop-blur-[2px]" />
        <SparkleBg density={12} />
        <FortuneParticles />
        
        <div className="z-10 w-full max-w-md bg-[#132e1b]/95 border border-[#FABF18]/30 rounded-2xl shadow-2xl p-6 sm:p-8 relative card-glow tiger-entrance">
          {/* Top gold bar with glow */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18] rounded-t-2xl shadow-[0_0_12px_rgba(250,191,24,0.6)]" />
          
          {/* Corner decorations */}
          <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-[#FABF18]/40 rounded-tl" />
          <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-[#FABF18]/40 rounded-tr" />
          <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-[#FABF18]/40 rounded-bl" />
          <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-[#FABF18]/40 rounded-br" />
          
          <div className="text-center mb-8 relative">
            {/* Glowing orb behind logo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-[#FABF18]/10 rounded-full blur-2xl" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="absolute -top-6 left-1/2 -translate-x-1/2 text-[#FABF18]/20 text-4xl"
            >
              ✦
            </motion.div>
            <h1 className="font-sans font-black text-3xl sm:text-4xl tracking-tight uppercase italic drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] relative">
              <span className="text-white">Dama</span>
              <span className="text-[#FABF18] font-black italic gold-glow">Bet</span>
            </h1>
            <p className="text-stone-300 text-xs mt-1.5 font-sans">
              ✦ Autenticação Segura com Criptografia ✦
            </p>
          </div>

          <div className="flex bg-[#08180c] p-1 rounded-lg border border-emerald-900/35 mb-6 relative">
            {/* Glow indicator on active tab */}
            <motion.div
              className="absolute top-1 bottom-1 rounded-md bg-[#FABF18] shadow-[0_0_12px_rgba(250,191,24,0.4)] z-0"
              animate={{ left: authMode === 'login' ? '0.25rem' : '50%', right: authMode === 'login' ? '50%' : '0.25rem' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ width: 'calc(50% - 0.25rem)' }}
            />
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              type="button"
              className={`flex-1 py-2 text-xs font-bold rounded-md uppercase tracking-wider transition-all cursor-pointer relative z-10 ${
                authMode === 'login'
                  ? 'text-[#142c23]'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              type="button"
              className={`flex-1 py-2 text-xs font-bold rounded-md uppercase tracking-wider transition-all cursor-pointer relative z-10 ${
                authMode === 'register'
                  ? 'text-[#142c23]'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              Criar Conta
            </button>
          </div>

          {authError && (
            <div className="bg-red-950/60 border border-red-500/40 text-stone-200 px-4 py-2.5 rounded-lg text-xs font-medium mb-5 font-sans leading-relaxed flex items-center gap-2">
              <span className="text-red-400 text-base shrink-0">⚠️</span>
              <div>{authError}</div>
            </div>
          )}

          <form onSubmit={(e) => {
            e.preventDefault();
            if (authMode === 'login') {
              handleLogin(authUsername, authPassword);
            } else {
              handleRegister(authUsername, authEmail, authPassword, authConfirmPassword);
            }
          }} className="space-y-4">
            
            {/* If login: GMAIL OU NICK DE JOGADOR */}
            {authMode === 'login' ? (
              <div>
                <label className="block text-[10px] font-black uppercase text-amber-400/90 tracking-wider mb-1.5">
                  GMAIL OU NICK DE JOGADOR
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-emerald-400" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Seu Gmail ou nick cadastrado..."
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 bg-[#08180c] border border-emerald-850 rounded-lg text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-[#FABF18] focus:border-[#FABF18] transition-all font-semibold font-sans"
                  />
                </div>
              </div>
            ) : (
              /* If register: GMAIL DO USUÁRIO + NICK DE JOGADOR */
              <>
                <div>
                  <label className="block text-[10px] font-black uppercase text-amber-400/90 tracking-wider mb-1.5 font-sans">
                    E-MAIL DO GMAIL <span className="text-rose-550 font-bold">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-emerald-400" />
                    </div>
                    <input
                      type="email"
                      required
                      placeholder="seu_nome@gmail.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 bg-[#08180c] border border-emerald-850 rounded-lg text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-[#FABF18] focus:border-[#FABF18] transition-all font-semibold font-sans"
                    />
                  </div>
                  <span className="text-[10px] text-stone-400/80 font-medium block mt-1">
                    Insira um e-mail do Gmail válido para a sua segurança de saques.
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-amber-400/90 tracking-wider mb-1.5 font-sans">
                    NICK DE JOGADOR (APELIDO) <span className="text-rose-550 font-bold">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-emerald-400" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Como você quer ser chamado no jogo..."
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 bg-[#08180c] border border-emerald-850 rounded-lg text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-[#FABF18] focus:border-[#FABF18] transition-all font-semibold font-sans"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Password Input */}
            <div>
              <label className="block text-[10px] font-black uppercase text-amber-400/90 tracking-wider mb-1.5">
                {authMode === 'login' ? 'SENHA DE ACESSO' : 'CRIE UMA SENHA DE ACESSO'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-emerald-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Sua senha..."
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 bg-[#08180c] border border-emerald-850 rounded-lg text-sm text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#FABF18] focus:border-[#FABF18] transition-all font-semibold font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-400 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Repeat Password (Register only) */}
            {authMode === 'register' && (
              <div>
                <label className="block text-[10px] font-black uppercase text-amber-400/90 tracking-wider mb-1.5 font-sans">
                  REPETIR SENHA <span className="text-rose-550 font-bold">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-emerald-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Repita a senha escrita acima..."
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 bg-[#08180c] border border-emerald-850 rounded-lg text-sm text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-[#FABF18] focus:border-[#FABF18] transition-all font-semibold font-sans"
                  />
                </div>
              </div>
            )}

            <div className="text-[11px] text-stone-400 flex items-start gap-1.5 mt-2 bg-[#051109]/40 p-2.5 rounded border border-emerald-900/10">
              <span className="text-amber-400 text-xs shrink-0">🔒</span>
              <span>
                Senha protegida com criptografia SHA-512 (100.000 iterações). Sessão segura por token — seus dados ficam protegidos neste dispositivo.
              </span>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-6 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18] hover:from-[#f5b80c] hover:to-[#dfa503] text-[#142c23] font-black uppercase tracking-wider py-3 rounded-lg text-sm transition-all duration-200 cursor-pointer shadow-lg hover:shadow-[0_4px_20px_rgba(250,191,24,0.5)] disabled:opacity-50 flex items-center justify-center gap-2 btn-shimmer relative overflow-hidden gradient-fortune"
              style={{ backgroundSize: '200% 100%' }}
            >
              {authLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-[#142c23]" />
                  Aguarde...
                </>
              ) : authMode === 'login' ? (
                <>
                  <UserCheck className="w-4 h-4 text-[#142c23]" />
                  ENTRAR NA MINHA CONTA
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 text-[#142c23]" />
                  CADASTRAR E COMEÇAR
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-stone-100 flex flex-col font-sans select-none antialiased selection:bg-amber-500/30 selection:text-white relative">
      <SparkleBg density={currentView === 'game' ? 2 : 8} />
      {currentView !== 'game' && <FortuneParticles />}
      {player && (
        <Header 
          player={player} 
          transactions={transactions} 
          onActionComplete={() => fetchProfile(userId)} 
          onRefreshGame={() => {
            handleExitToLobby();
            setLobbyTab('play');
          }}
          onOpenReferrals={() => {
            setCurrentView('lobby');
            setLobbyTab('referral');
          }}
          onLogout={handleLogout}
        />
      )}

      {/* SECTION 1: THE SPOTLIGHT PREMIUM DAMA.BET TABLE */}
      <section 
        className="relative py-6 sm:py-10 px-3 sm:px-6 lg:px-8 shadow-inner flex-1 flex flex-col justify-center items-center min-h-[400px] sm:min-h-[500px]"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgba(38, 5, 7, 0.45) 0%, rgba(10, 1, 2, 0.92) 100%), url("https://i.ibb.co/Qjxgcs76/Whats-App-Image-2026-06-16-at-00-39-02.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* Animated radial glare */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: [
              'radial-gradient(circle at 50% 50%, rgba(251,191,24,0.08) 0%, transparent 60%)',
              'radial-gradient(circle at 30% 70%, rgba(251,191,24,0.12) 0%, transparent 60%)',
              'radial-gradient(circle at 70% 30%, rgba(251,191,24,0.08) 0%, transparent 60%)',
              'radial-gradient(circle at 50% 50%, rgba(251,191,24,0.08) 0%, transparent 60%)',
            ],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="max-w-7xl w-full mx-auto flex flex-col items-center">
          
          {/* VIEW A: LOBBY WITH THE FAMOUS CUSTOMIZATION CARD */}
          {currentView === 'lobby' && (
            <div className="w-full flex flex-col items-center">

              {/* Live Stats Bar */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-4xl flex items-center justify-center gap-2 sm:gap-8 mb-4 z-10"
              >
                <div className="flex items-center gap-1 sm:gap-2 bg-[#132e1b]/80 border border-emerald-800/40 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-lg">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <motion.div
                    key={onlinePlayers}
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 0.35 }}
                    className="font-mono font-black text-xs sm:text-base tabular-nums text-stone-100"
                  >
                    {onlinePlayers.toLocaleString()}
                  </motion.div>
                  <span className="text-[8px] sm:text-xs font-bold text-emerald-300 uppercase tracking-wider font-sans">
                    <span className="hidden sm:inline">Jogadores Online</span><span className="sm:hidden">Online</span>
                  </span>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 bg-[#2a1a0a]/80 border border-amber-800/40 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-lg">
                  <span className="text-sm sm:text-xl">⚔️</span>
                  <motion.div
                    key={activeMatches}
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 0.35 }}
                    className="font-mono font-black text-xs sm:text-base tabular-nums text-amber-300"
                  >
                    {activeMatches.toLocaleString()}
                  </motion.div>
                  <span className="text-[8px] sm:text-xs font-bold text-amber-300 uppercase tracking-wider font-sans">
                    <span className="hidden sm:inline">Partidas em Andamento</span><span className="sm:hidden">Partidas</span>
                  </span>
                </div>
              </motion.div>

              {/* Tab Selector Section */}
              <div className="flex gap-2 sm:gap-4 mb-6 z-10 relative">
                <button
                  onClick={() => setLobbyTab('play')}
                  className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                    lobbyTab === 'play'
                      ? 'bg-[#FABF18] text-[#142c23] shadow-lg ring-1 ring-[#FABF18]'
                      : 'bg-[#1c1917]/90 text-stone-300 border border-stone-850 hover:bg-stone-800'
                  }`}
                >
                  🎮 <span className="hidden sm:inline">Mesa de Jogo</span><span className="sm:hidden">Jogo</span>
                </button>
                <button
                  onClick={() => setLobbyTab('referral')}
                  className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                    lobbyTab === 'referral'
                      ? 'bg-[#FABF18] text-[#142c23] shadow-lg ring-1 ring-[#FABF18]'
                      : 'bg-[#1c1917]/90 text-stone-300 border border-stone-850 hover:bg-stone-800'
                  }`}
                >
                  🤝 <span className="hidden sm:inline">Indique & Ganhe (Bônus)</span><span className="sm:hidden">Bônus</span>
                </button>
              </div>

              {lobbyTab === 'play' ? (
                <>
                  {/* Copa do Mundo 2026 Promo Banner - Tigrinho Enhanced */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-4xl bg-gradient-to-r from-emerald-950/90 via-stone-900/95 to-[#0e2a17]/95 border-2 border-[#FABF18]/85 rounded-xl p-4 sm:p-5 mb-5 shadow-2xl relative z-10 text-stone-100 flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden"
                  >
                    {/* Animated glow orbs */}
                    <motion.div
                      className="absolute -right-12 -bottom-12 w-44 h-44 bg-[#FABF18]/10 rounded-full blur-3xl pointer-events-none"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.15, 0.05] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="absolute -left-12 -top-12 w-32 h-32 bg-amber-500/8 rounded-full blur-3xl pointer-events-none"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.03, 0.1, 0.03] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                    />
                    
                    <div className="flex items-center gap-4 relative z-10">
                      {/* Pulsing Trophy Icon with glow */}
                      <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-[#FABF18]/30 rounded-xl blur-lg animate-pulse" />
                        <div className="w-14 h-14 bg-gradient-to-tr from-amber-500 to-[#FABF18] text-stone-950 rounded-xl flex items-center justify-center font-black text-2xl shadow-lg ring-4 ring-[#FABF18]/25 relative">
                          🏆
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2 text-sm font-black tracking-tight text-white uppercase italic">
                          <span className="gold-glow">Copa do Mundo 2026: Temporada de Depósito! ⚽</span>
                          <motion.span
                            className="bg-[#FABF18] text-stone-950 px-2 py-0.5 rounded text-[9px] font-mono not-italic font-black"
                            animate={{ boxShadow: ['0 0 8px rgba(250,191,24,0.3)', '0 0 20px rgba(250,191,24,0.6)', '0 0 8px rgba(250,191,24,0.3)'] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            ATIVA
                          </motion.span>
                        </div>
                        <p className="text-stone-300 text-xs leading-relaxed max-w-xl font-sans font-medium">
                          Deposite hoje e ganhe bônus de campo espetaculares: depósito de <b className="text-[#FABF18] gold-glow">R$20 ganha R$50</b> de bônus, <b className="text-[#FABF18] gold-glow">R$50 ganha R$120</b> de bônus, e <b className="text-[#FABF18] gold-glow">R$100 ganha R$250</b>. Compita e multiplique!
                        </p>
                        <p className="text-[10px] text-emerald-400 font-bold font-mono">
                           ★ Validez prorrogada até: 19 de julho de 2026 • Rollover simples de apenas 3x ★
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 w-full md:w-auto relative z-10">
                      <button
                        onClick={() => {
                          const depBtn = document.getElementById('header-deposit');
                          if (depBtn) depBtn.click();
                        }}
                        className="w-full md:w-auto bg-gradient-to-r from-[#FABF18] to-[#d97706] hover:from-[#f59e0b] hover:to-[#b45309] text-stone-950 font-black text-xs px-5 py-3 rounded-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 duration-150 cursor-pointer btn-shimmer overflow-hidden"
                      >
                        ⚡ <span className="hidden sm:inline">RESGATAR MEU BÔNUS PIX</span><span className="sm:hidden">BÔNUS PIX</span>
                      </button>
                    </div>
                  </motion.div>

                  <div className="flex flex-col md:flex-row items-center justify-center gap-8 w-full max-w-4xl relative z-10">
                
                {/* Premium Tigrinho Customizer Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="bg-[#FAF8EB] text-[#4A3B32] border-2 border-[#DCD6C2] rounded-xl p-6 sm:p-8 shrink-0 w-full max-w-md shadow-2xl relative card-glow"
                >
                  {/* Animated gold header accent */}
                  <motion.div
                    className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#FABF18] via-[#f59e0b] to-[#FABF18] rounded-t-lg"
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Corner accents */}
                  <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-[#FABF18]/30 rounded-tl" />
                  <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-[#FABF18]/30 rounded-tr" />
                  <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-[#FABF18]/30 rounded-bl" />
                  <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-[#FABF18]/30 rounded-br" />

                  {lobbyError && (
                    <div className="bg-red-50 border border-red-250 text-red-700 p-3 rounded text-xs mb-4 font-medium leading-relaxed">
                      ⚠️ {lobbyError}
                    </div>
                  )}

                  <div className="space-y-4">
                    
                    {/* Game Mode Badge */}
                    <div>
                      <label className="block text-[11px] font-black uppercase text-[#6B5A4D] tracking-wider mb-1 flex items-center justify-between">
                        <span>MODO DE JOGO 👥</span>
                        <span className="text-[10px] text-[#FABF18] font-bold lowercase">escala competitiva</span>
                      </label>
                      <div className="w-full bg-[#EFEAD8] border border-[#D0C9B3] rounded py-2.5 px-3.5 text-xs text-[#5C4033] font-extrabold flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-2">👥 MODO MULTIPLAYER (ONLINE)</span>
                        <span className="bg-[#FABF18]/20 text-[#823a10] text-[9px] px-1.5 py-0.5 rounded font-mono">AUTOMÁTICO</span>
                      </div>
                    </div>

                    {/* Tigrinho-style Bet Chips with Icons */}
                    <div>
                      <label className="block text-[11px] font-black uppercase text-[#6B5A4D] tracking-wider mb-1.5">
                        VALOR DA APOSTA
                      </label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[
                          { value: 5, color: 'from-amber-400 to-amber-600' },
                          { value: 10, color: 'from-amber-400 to-amber-600' },
                          { value: 20, color: 'from-amber-400 to-amber-600' },
                          { value: 50, color: 'from-amber-400 to-amber-600' },
                          { value: 100, color: 'from-amber-400 to-amber-600' },
                        ].map(({ value, color }) => (
                          <button
                            key={value}
                            onClick={() => setBetAmount(value)}
                            className={`flex flex-col items-center gap-0.5 py-2 px-0.5 rounded-xl transition-all duration-200 cursor-pointer ${
                              betAmount === value
                                ? `bg-gradient-to-b ${color} text-stone-950 shadow-[0_0_14px_rgba(250,191,24,0.5)] scale-105 ring-2 ring-[#FABF18]`
                                : 'bg-[#EFEAD8] text-[#5C4033] border border-[#DDD6BF] hover:border-[#FABF18] hover:shadow-sm'
                            }`}
                          >
                            <span className="font-black text-sm leading-none">R$ {value}</span>
                            <span className="text-[8px] opacity-70 uppercase tracking-tight">{value >= 50 ? '👑' : '🪙'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tigrinho-style Main Action Button */}
                    <div className="pt-2">
                      <button
                        id="btn-paciencia-launch-bot"
                        onClick={handleCreateGame}
                        disabled={createLoading}
                        className="w-full bg-gradient-to-r from-[#FABF18] via-[#d97706] to-[#FABF18] text-stone-950 font-black py-4 px-4 rounded-lg shadow-lg uppercase text-sm tracking-wider cursor-pointer active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 relative overflow-hidden btn-shimmer hover:shadow-[0_0_30px_rgba(250,191,24,0.4)] group"
                        style={{ backgroundSize: '200% 100%' }}
                      >
                        {createLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-stone-950" />
                            Carregando Mesa...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 group-hover:animate-spin" />
                            INICIAR PARTIDA
                            <Sparkles className="w-4 h-4 group-hover:animate-spin" />
                          </>
                        )}
                      </button>
                    </div>

                  </div>

                    {/* Quick profile editor within Beige widget */}
                    {player && (
                      <div className="pt-3 border-t border-[#DDD6BF] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-stone-600">
                          <User className="w-3.5 h-3.5 text-[#823a10]" />
                          <span>Seu Perfil:</span>
                          {isEditingName ? (
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                maxLength={15}
                                className="bg-white border border-[#DDD6BF] rounded px-1 text-xs w-24 py-0.5"
                              />
                              <button onClick={updateProfileName} className="text-[#823a10] underline font-bold">Ok</button>
                            </div>
                          ) : (
                            <span className="font-bold text-[#4A3B32]">
                              {player.name}{' '}
                              <span onClick={() => setIsEditingName(true)} className="text-[#823a10] font-normal cursor-pointer hover:underline text-[10px] ml-1">(mutar)</span>
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] bg-[#EFEAD8] rounded px-1.5 text-stone-600">ID: {player.id}</span>
                      </div>
                    )}

                </motion.div>



              </div>
                </>
              ) : (
                <ReferralsDashboard
                  userId={userId}
                  userName={userName}
                  balance={player ? player.balance : 0}
                  invitedCount={invitedCount}
                  onClaimReward={handleClaimReferralReward}
                  claimedRewards={claimedRewards}
                />
              )}

              {/* Show matching active rooms */}
              {lobbyTab === 'play' && (
                <div className="w-full max-w-4xl mt-8 bg-[#FAF8EB] text-[#4A3B32] border border-[#DCD6C2] rounded-xl p-6 shadow-2xl animate-fade-in">
                  <div className="border-b border-[#DDD6BF] pb-3 mb-4 flex justify-between items-center flex-wrap gap-2">
                    <div>
                      <h3 className="font-extrabold text-base text-[#5C4033] flex items-center gap-1.5">
                        👥 Salas PVP em Tempo Real Disponíveis
                      </h3>
                      <span className="text-xs text-stone-500 font-medium font-sans">Escolha uma aposta em andamento ou aguarde adversários</span>
                    </div>
                    <span className="bg-emerald-700 text-stone-100 font-mono text-[9px] tracking-wider px-2 py-1 rounded">MURAL ONLINE</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                    {lobbyGames.length > 0 ? (
                      lobbyGames.map((game) => {
                        const guestDisplay = game.guest ? game.guest.name : 'Vaga Aberta';
                        return (
                          <div key={game.id} className="bg-white border border-[#DDD6BF] hover:border-amber-400 p-3.5 rounded flex items-center justify-between gap-4 transition-all shadow-sm">
                            <div className="flex-1 flex items-center gap-3">
                              <div className="bg-[#EFEAD8] px-2.5 py-1.5 rounded text-center min-w-[70px]">
                                <span className="text-[8px] block uppercase text-stone-550 font-bold leading-none">Aposta</span>
                                <span className="text-xs font-mono font-black text-[#823a10]">R$ {game.betAmount}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-black text-stone-800 truncate">{game.host.name} vs {guestDisplay}</div>
                                <div className="text-[10px] text-stone-500 mt-0.5 font-mono">Prêmio total: R$ {(game.betAmount * 1.8).toFixed(2)} (Taxa de 10%)</div>
                              </div>
                            </div>

                            {game.host.id === userId ? (
                              <span className="text-[9px] bg-stone-100 font-mono text-stone-500 px-2 py-1.5 rounded border border-stone-200 uppercase">Sua Mesa</span>
                            ) : (
                              <button
                                onClick={() => handleJoinGame(game.id)}
                                disabled={joinLoading}
                                className="bg-[#FABF18] hover:bg-[#e0ab12] text-[#142c23] hover:scale-105 transition-all duration-150 font-bold text-xs px-3.5 py-1.5 rounded cursor-pointer uppercase transition-colors"
                              >
                                Entrar
                              </button>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-1 md:col-span-2 text-center py-8 border border-dashed border-stone-300 rounded bg-white/40">
                        <p className="text-xs font-bold text-[#6B5A4D]">Sem mesas ativas criadas no momento.</p>
                        <p className="text-[11px] text-stone-500 mt-1">Configure uma aposta e clique no botão marrom 'CRIAR SALA' acima!</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Weekly Ranking + Last Winners Section */}
              {lobbyGames.length >= 0 && (
                <div className="w-full max-w-4xl mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 z-10">
                  
                  {/* TOP 10 Ranking Semanal */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="bg-[#111111]/90 border border-amber-800/30 rounded-xl p-4 shadow-xl backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-2 mb-3 border-b border-amber-800/20 pb-2">
                      <Crown className="w-4 h-4 text-[#FABF18]" />
                      <h3 className="font-black text-xs uppercase tracking-wider text-[#FABF18]">
                        Ranking Semanal TOP 10
                      </h3>
                      <span className="ml-auto text-[9px] text-stone-500 font-mono font-bold uppercase tracking-widest bg-stone-900 px-2 py-0.5 rounded">
                        Ativo
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                      {weeklyRanking.length > 0 ? (
                        weeklyRanking.map((entry, idx) => (
                          <div
                            key={entry.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-sans ${
                              idx < 3
                                ? 'bg-[#FABF18]/10 border border-[#FABF18]/20'
                                : 'bg-black/20 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`font-black font-mono w-5 text-center shrink-0 ${
                                idx === 0 ? 'text-[#FABF18] text-sm' :
                                idx === 1 ? 'text-stone-300 text-sm' :
                                idx === 2 ? 'text-amber-700 text-sm' :
                                'text-stone-500'
                              }`}>
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                              </span>
                              <span className="font-bold text-stone-200 truncate">{entry.name}</span>
                            </div>
                            <span className="font-mono font-black text-[#FABF18] shrink-0 ml-2">
                              R$ {entry.total.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-stone-500 text-xs">
                          Carregando ranking...
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Últimos Vencedores Feed */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="bg-[#111111]/90 border border-emerald-800/30 rounded-xl p-4 shadow-xl backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-2 mb-3 border-b border-emerald-800/20 pb-2">
                      <span className="text-lg">🏆</span>
                      <h3 className="font-black text-xs uppercase tracking-wider text-emerald-400">
                        Últimos Vencedores
                      </h3>
                      <span className="ml-auto text-[9px] text-stone-500 font-mono font-bold uppercase tracking-widest bg-stone-900 px-2 py-0.5 rounded flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Tempo Real
                      </span>
                    </div>
                    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                      {lastWinners.length > 0 ? (
                        lastWinners.map((entry, idx) => {
                          const timeAgo = Math.floor((Date.now() - new Date(entry.timestamp).getTime()) / 60000);
                          const timeLabel = timeAgo < 1 ? 'agora' : timeAgo < 60 ? `há ${timeAgo}min` : `há ${Math.floor(timeAgo / 60)}h`;
                          return (
                            <motion.div
                              key={`${entry.playerName}-${idx}`}
                              initial={idx === 0 ? { opacity: 0, x: -20 } : undefined}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.3 }}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-sans bg-emerald-950/10 border border-emerald-800/10"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-emerald-400 text-sm shrink-0">💰</span>
                                <span className="font-bold text-stone-200 truncate">{entry.playerName}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono font-black text-emerald-400">
                                  +R$ {entry.amount.toFixed(2).replace('.', ',')}
                                </span>
                                <span className="text-[9px] text-stone-600 font-mono">{timeLabel}</span>
                              </div>
                            </motion.div>
                          );
                        })
                      ) : (
                        <div className="text-center py-6 text-stone-500 text-xs">
                          Aguardando vencedores...
                        </div>
                      )}
                    </div>
                  </motion.div>

                </div>
              )}

            </div>
          )}

          {/* VIEW B: ACTIVE CHEQUER GAME STAGE AND COMBAT RULES */}
          {currentView === 'game' && activeGame && (
            <div ref={gameStageRef} className="w-full max-w-6xl xl:max-w-7xl flex flex-col items-center gap-6 animate-fade-in relative z-10 scroll-mt-6 px-3 sm:px-4">
              
              {/* Top Board back navigation bar */}
              <div className="w-full flex items-center justify-between bg-[#111]/70 border border-stone-800 px-4 py-2.5 rounded-lg backdrop-blur-sm shadow-md">
                <button
                  onClick={() => {
                    if (activeGame.status === 'active' && !activeGame.winnerId) {
                      if (!window.confirm('Desistir encerra a mesa e transfere os saldos protegidos ao oponente relevante. Confirmar saída?')) return;
                      handleResign(userId);
                    }
                    handleExitToLobby();
                  }}
                  className="bg-stone-800 hover:bg-stone-750 text-stone-150 border border-stone-700 px-3 py-1.5 rounded text-xs font-bold transition-all uppercase tracking-wider cursor-pointer"
                >
                  ← Abandonar Combate
                </button>

                <div className="bg-amber-450/15 border border-amber-400/20 px-3 py-1 rounded text-xs text-amber-400 font-mono">
                  Mesa #ID {activeGame.id} • R$ {activeGame.betAmount} Bet
                </div>
              </div>

              {/* Game Arena grid */}
              <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* Arena Left panel - Checkers widget board container */}
                <div className="lg:col-span-8 bg-[#151515]/85 border border-stone-800 rounded-lg p-2 sm:p-6 lg:p-8 shadow-2xl flex flex-col items-center justify-center min-h-[350px] sm:min-h-[480px] md:min-h-[580px] w-full overflow-x-hidden">
                  
                  {/* Pre-Match Stakes confirmations screens */}
                  {(activeGame.status === 'waiting_for_challenger' || activeGame.status === 'bet_confirmation') ? (
                    <div className="py-6 text-center space-y-6 max-w-md w-full">
                      <div className="bg-[#FAF8EB] text-[#4A3B32] border border-[#DDD6BF] p-6 rounded-lg shadow-xl space-y-1.5 text-center">
                        <span className="text-[10px] text-stone-500 font-mono uppercase tracking-widest block">Custódia Coletiva do Payout</span>
                        <div className="text-3xl font-mono font-black text-[#823a10]">R$ {activeGame.betAmount.toFixed(2)}</div>
                        <p className="text-xs text-stone-600 leading-relaxed pt-2">Ambos depositam valor idêntico seguro. O vencedor leva a totalidade do prêmio de R$ {activeGame.prizePool.toFixed(2)} com amortecimento de 10% da taxa sistêmica.</p>
                      </div>

                      {activeGame.status === 'waiting_for_challenger' ? (
                        <div className="space-y-4">
                          <p className="text-xs text-stone-300 font-mono">Mesa criada com sucesso! Envie o link abaixo para outro jogador:</p>
                          <input
                            type="text"
                            readOnly
                            value={`${window.location.origin}/?joinRoom=${activeGame.id}`}
                            className="bg-[#111] border border-stone-800 p-2.5 text-[11px] text-amber-400 font-mono w-full rounded text-center select-all focus:outline-none"
                          />
                          <button
                            onClick={copyRoomInviteLink}
                            className="bg-[#FABF18] text-[#142c23] hover:bg-[#e0ab12] transition-colors px-4 py-2.5 rounded text-xs font-black uppercase shadow tracking-wider cursor-pointer"
                          >
                            {copiedLink ? 'Link Copiado!' : 'Copiar Link de Convite'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <h4 className="text-sm font-black text-amber-400 animate-pulse uppercase tracking-wider">⚠️ RIVAL ENCONTRADO! CONFIRMANDO APOSTAS</h4>
                          
                          {/* Ready actions checking */}
                          <div className="grid grid-cols-2 gap-3 text-left">
                            <div className="bg-[#222] p-3 rounded border border-stone-800">
                              <span className="text-[9px] uppercase font-mono text-stone-500 block mb-0.5">Jogador A (Anfitrião)</span>
                              <div className="text-xs font-bold text-stone-200 truncate">{activeGame.host.name}</div>
                              <div className="mt-2.5">
                                {activeGame.hostReady ? (
                                  <span className="bg-emerald-950/80 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold border border-emerald-800/60 uppercase">Confirmado</span>
                                ) : (
                                  userId === activeGame.host.id || sandboxModeActive ? (
                                    <button onClick={() => handleConfirmBet(activeGame.host.id)} className="bg-[#FABF18] text-stone-950 font-extrabold text-[10px] px-2.5 py-1 rounded uppercase tracking-wider cursor-pointer">Confirmar</button>
                                  ) : <span className="text-[10px] text-stone-500 italic">Aguardando...</span>
                                )}
                              </div>
                            </div>

                            <div className="bg-[#222] p-3 rounded border border-stone-800">
                              <span className="text-[9px] uppercase font-mono text-stone-500 block mb-0.5">Jogador B (Desafiante)</span>
                              <div className="text-xs font-bold text-stone-200 truncate">{activeGame.guest?.name}</div>
                              <div className="mt-2.5">
                                {activeGame.guestReady ? (
                                  <span className="bg-emerald-950/80 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold border border-emerald-800/60 uppercase">Confirmado</span>
                                ) : (
                                  userId === activeGame.guest?.id || sandboxModeActive ? (
                                    <button onClick={() => handleConfirmBet(activeGame.guest!.id)} className="bg-[#FABF18] text-stone-950 font-extrabold text-[10px] px-2.5 py-1 rounded uppercase tracking-wider cursor-pointer">Confirmar</button>
                                  ) : <span className="text-[10px] text-stone-500 italic">Aguardando...</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Checkers interactive board screen */
                    /* Checkers interactive board screen */
                    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto space-y-4">
                      
                      {/* Player tag indicator B (Oponente - Topo) */}
                      <div className={`px-4 py-2.5 rounded-lg border text-left w-full flex items-center justify-between gap-3 ${
                        activeGame.turn === 'black' && activeGame.status === 'active'
                          ? 'bg-[#FABF18]/10 text-amber-300 border-[#FABF18]/40 shadow-md'
                          : 'bg-[#1a1a1b]/40 border-stone-850 opacity-80 text-[#ccc]'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                            activeGame.turn === 'black' && activeGame.status === 'active' ? 'bg-[#FABF18] animate-pulse shadow-[0_0_8px_rgba(250,191,24,0.6)]' : 'bg-stone-500'
                          }`} />
                          <span className="text-xs font-bold text-stone-100 truncate">{activeGame.guest?.name}</span>
                          <span className="text-[10px] font-black uppercase text-stone-400 font-mono tracking-wider ml-1">PRETO</span>
                          {activeGame.isBotGame && (
                            (() => {
                              const currentCount = player?.botGamesPlayed || 0;
                              if (currentCount === 0) {
                                return (
                                  <span className="text-[9px] bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 px-2 py-0.5 rounded font-black font-sans uppercase ml-2 select-none shrink-0">
                                    Fácil 🟢 [1/3]
                                  </span>
                                );
                              } else if (currentCount === 1) {
                                return (
                                  <span className="text-[9px] bg-amber-950/40 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded font-black font-sans uppercase ml-2 select-none shrink-0">
                                    Médio 🟡 [2/3]
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="text-[9px] bg-rose-950/40 text-rose-300 border border-rose-800/40 px-2 py-0.5 rounded font-black font-sans uppercase ml-2 select-none shrink-0 animate-pulse">
                                    Impossível 🔴 [3/3]
                                  </span>
                                );
                              }
                            })()
                          )}
                        </div>
                        {activeGame.winnerId === activeGame.guest?.id && <span className="text-[9px] bg-emerald-700 text-stone-100 px-1.5 py-0.5 rounded font-black font-sans uppercase animate-bounce">Ganhou!</span>}
                      </div>

                      {/* Main checks board */}
                      <div className="w-full flex flex-col items-center justify-center gap-4 select-none animate-fade-in">
                        
                        {/* Elegant Match Stats Bar: Timer & Piece Scoreboard */}
                        {activeGame.status === 'active' && (
                          <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#111111]/95 border border-stone-800 rounded-xl p-3 shadow-md w-full max-w-[580px]">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] sm:text-[11px] font-black uppercase text-stone-400 font-sans tracking-wider">
                                ⏱️ Tempo Limite:
                              </span>
                              <div className={`px-3 py-1 rounded bg-[#1a0f08]/90 border border-[#ea580c]/30 font-mono text-xs sm:text-sm font-black tracking-wide flex items-center gap-1.5 ${
                                remainingSeconds !== null && remainingSeconds <= 60 ? 'text-red-500 animate-pulse border-red-500/50' : 'text-[#FABF18]'
                              }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
                                {remainingSeconds !== null ? (
                                  (() => {
                                    const minutes = Math.floor(remainingSeconds / 60);
                                    const seconds = remainingSeconds % 60;
                                    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                                  })()
                                ) : (
                                  '10:00'
                                )}
                              </div>
                            </div>

                            <span className="text-[9px] text-center text-stone-500 uppercase font-bold tracking-widest hidden md:inline font-mono">
                              Quem tiver mais peças ganha!
                            </span>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] sm:text-[11px] font-black uppercase text-stone-400 font-sans tracking-wide">
                                Peças:
                              </span>
                              <div className="flex items-center gap-1 bg-[#161618] border border-stone-850 px-3 py-1 rounded-lg">
                                <div className="flex items-center gap-1 text-red-500 font-bold font-mono text-xs" title="Suas Peças (Vermelho)">
                                  <span className="w-2.5 h-2.5 rounded-full bg-red-650 inline-block border border-red-400" />
                                  {activeGame.pieces.filter(p => p.color === 'red').length}
                                </div>
                                <div className="w-px h-3.5 bg-stone-800 mx-1.5" />
                                <div className="flex items-center gap-1 text-[#FABF18] font-bold font-mono text-xs" title="Peças do Rival (Preto)">
                                  <span className="w-2.5 h-2.5 rounded-full bg-stone-950 inline-block border border-[#FABF18]" />
                                  {activeGame.pieces.filter(p => p.color === 'black').length}
                                </div>
                              </div>
                              <div className="hidden sm:flex items-center gap-1.5 text-[9px] text-stone-500 font-mono border-l border-stone-800 pl-2">
                                <span className="text-red-400">-{Math.max(0, 12 - activeGame.pieces.filter(p => p.color === 'red').length)}</span>
                                <span className="text-stone-600">/</span>
                                <span className="text-amber-400">-{Math.max(0, 12 - activeGame.pieces.filter(p => p.color === 'black').length)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Status bar dynamically rendering active state */}
                        {activeGame.status === 'active' && (
                          <div className="w-full flex items-center justify-center min-h-[36px]">
                            {activeGame.isBotGame && activeGame.turn === 'black' ? (
                              <div className="bg-amber-450/10 border border-amber-400/30 text-amber-300 font-mono text-[11px] font-bold px-4 py-1.5 rounded-full flex items-center gap-2 animate-pulse shadow-sm">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                                ⏳ Aguardando adversário ({activeGame.guest?.name || 'Adversário'} pensando...)
                              </div>
                            ) : !activeGame.isBotGame && layoutUserColorRole !== 'both' && activeGame.turn !== layoutUserColorRole ? (
                              <div className="bg-stone-800/80 border border-stone-700 text-stone-300 font-mono text-[11px] font-bold px-4 py-1.5 rounded-full flex items-center gap-2 animate-pulse shadow-sm">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-stone-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-stone-300"></span>
                                </span>
                                ⏳ Aguardando adversário...
                              </div>
                            ) : (
                              <div className="bg-[#142c23]/60 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] font-bold px-4 py-1.5 rounded-full flex items-center gap-2 shadow-sm animate-pulse">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                🟢 Sua vez de realizar o movimento!
                              </div>
                            )}
                          </div>
                        )}

                        <div className="relative w-full max-w-[580px] flex flex-col items-center justify-center">
                          <CheckersBoard
                            board={activeGame.board}
                            turn={activeGame.turn}
                            userColor={layoutUserColorRole}
                            mustJumpPieceId={activeGame.mustJumpPieceIdByTurn}
                            onMoveSubmitted={handleMoveSubmitted}
                            gameActive={activeGame.status === 'active'}
                          />
                          
                          {/* Floating Emojis Overlay Layer above board */}
                          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                            <AnimatePresence>
                              {floatingReactions.map((reaction) => (
                                <motion.div
                                  key={reaction.id}
                                  initial={{ y: '90%', x: `${reaction.styleLeft}%`, scale: 0.2, rotate: 0, opacity: 0 }}
                                  animate={{ 
                                    y: '-10%', 
                                    scale: [0.2, 1.4, 1.2, 0.8], 
                                    rotate: [-20, 20, -15, 15, 0],
                                    opacity: [0, 1, 1, 0] 
                                  }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 3.2, ease: 'easeOut' }}
                                  onAnimationComplete={() => {
                                    setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
                                  }}
                                  className="absolute text-5xl select-none filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
                                >
                                  {reaction.emoji}
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Interactive provocative reaction bar */}
                        {activeGame.status === 'active' && (
                          <div id="emoji-reaction-dock" className="w-full max-w-[580px] bg-gradient-to-r from-stone-900/90 to-[#1c1815]/95 border border-stone-800 rounded-2xl p-3 flex flex-col gap-2 shadow-xl backdrop-blur-md">
                            <div className="flex items-center justify-between w-full px-1">
                              <span className="text-[10px] uppercase font-black text-amber-400 font-sans tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse inline-block" />
                                Provocações Instantâneas
                              </span>
                              <span className="text-[9px] text-stone-500 font-mono font-medium">Toque para desestabilizar o rival</span>
                            </div>
                            <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 justify-items-center w-full">
                              {['😂', '🔥', '👑', '🧠', '❓', '💪', '🍀', '😢', '😜', '👏', '💣'].map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={async () => {
                                    triggerEmojiReaction(emoji);
                                    try {
                                      await fetch('/api/games/chat', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          gameId: activeGame.id,
                                          userId,
                                          text: emoji,
                                        }),
                                      });
                                    } catch (err) {
                                      console.error('Failed to broadcast reaction...', err);
                                    }
                                  }}
                                  className="w-10 h-10 text-2xl flex items-center justify-center bg-[#111111] hover:bg-[#FABF18]/10 hover:border-[#FABF18]/60 border border-stone-800 rounded-xl cursor-pointer transition-all duration-150 hover:-translate-y-1 hover:shadow-lg active:scale-95"
                                  title={`Enviar reação ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Player tag indicator A (Você - Base) */}
                      <div className={`px-4 py-2.5 rounded-lg border text-left w-full flex items-center justify-between gap-3 ${
                        activeGame.turn === 'red' && activeGame.status === 'active'
                          ? 'bg-[#FABF18]/10 text-amber-300 border-[#FABF18]/40 shadow-md'
                          : 'bg-[#1a1a1b]/40 border-stone-850 opacity-80 text-[#ccc]'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${
                            activeGame.turn === 'red' && activeGame.status === 'active' ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-stone-500'
                          }`} />
                          <span className="text-xs font-bold text-stone-100 truncate">{activeGame.host.name}</span>
                          <span className="text-[10px] font-black uppercase text-stone-400 font-mono tracking-wider ml-1">VERMELHO</span>
                        </div>
                        {activeGame.winnerId === activeGame.host.id && <span className="text-[9px] bg-emerald-700 text-stone-100 px-1.5 py-0.5 rounded font-black font-sans uppercase animate-bounce">Ganhou!</span>}
                      </div>

                    </div>
                  )}

                  {/* Active match results screen Overlay */}
                  {activeGame.status === 'finished' && (
                    <div className="mt-6 w-full p-4 bg-[#1e1a17] border-2 border-[#FABF18]/45 text-center rounded space-y-3">
                      <h4 className="text-sm font-black text-[#FABF18] uppercase tracking-wider">Combate Concluído</h4>
                      <p className="text-xs text-stone-300">
                        {activeGame.winnerId ? (
                          <span>Vencedor Payout: <b className="text-amber-400 font-extrabold">{activeGame.winnerId === activeGame.host.id ? activeGame.host.name : activeGame.guest!.name}</b> faturou o prêmio total de R$ {activeGame.prizePool.toFixed(2)}</span>
                        ) : (
                          <span className="text-stone-300">Empate consensual acordado. As moedas apostadas foram ressarcidas na íntegra.</span>
                        )}
                      </p>
                      <button
                        onClick={handleExitToLobby}
                        className="bg-[#FABF18] hover:bg-[#e0ab12] text-stone-950 px-5 py-2 rounded text-xs font-black uppercase cursor-pointer transition-transform duration-100 active:scale-95"
                      >
                        Retornar Ao Customizador
                      </button>
                    </div>
                  )}

                </div>

                {/* Arena Right panel - Logging logs & chatting communication */}
                <div className="lg:col-span-4 flex flex-col justify-between gap-5">
                  
                  {/* Decisions panel */}
                  {activeGame.status === 'active' && (
                    <div className="bg-[#151515]/80 border border-stone-800 rounded-lg p-4 space-y-3 shadow-md">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-[#999] border-b border-stone-800 pb-1.5">Mapeamento de Prontidão</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            let actor = userId;
                            if (sandboxModeActive) actor = activeGame.turn === 'red' ? activeGame.host.id : activeGame.guest!.id;
                            handleResign(actor);
                          }}
                          className="bg-red-950/20 text-red-400 hover:bg-red-955/35 border border-red-900/40 text-[10px] font-extrabold py-2 rounded cursor-pointer uppercase tracking-wide"
                        >
                          🏳️ RENDER-SE
                        </button>
                        <button
                          onClick={() => {
                            let actor = userId;
                            if (sandboxModeActive) actor = activeGame.turn === 'red' ? activeGame.host.id : activeGame.guest!.id;
                            handleDrawVote(actor);
                          }}
                          className="bg-stone-850 hover:bg-stone-800 text-stone-300 text-[10px] font-bold py-2 rounded border border-stone-750 cursor-pointer uppercase tracking-wide"
                        >
                          🤝 PROPOR EMPATE
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Logs widget */}
                  <div className="bg-[#151515]/80 border border-stone-800 rounded-lg p-4 flex-1 flex flex-col min-h-[140px] shadow-md">
                    <span className="text-[10px] uppercase font-black tracking-wider text-[#999] mb-1.5 block">Histórico da Partida</span>
                    <div ref={logContainerRef} className="bg-black/30 rounded border border-stone-850 p-3 h-28 overflow-y-auto space-y-1.5 flex-1 text-[10.5px] font-mono text-stone-400 leading-snug">
                      {activeGame.log.map((entry, idx) => (
                        <p key={idx} className="border-l border-amber-500/20 pl-1.5">{entry}</p>
                      ))}
                    </div>
                  </div>

                  {/* Chat widget */}
                  <div className="bg-[#151515]/80 border border-stone-800 rounded-lg p-4 h-60 flex flex-col shadow-md">
                    <span className="text-[10px] uppercase font-black tracking-wider text-[#999] mb-1.5 block">Bate-Papo</span>
                    <div ref={chatContainerRef} className="bg-black/30 rounded border border-stone-850 p-2.5 overflow-y-auto space-y-2 flex-1 text-xs scrollbar-thin">
                      {activeGame.chat.map((msg) => {
                        const isMe = msg.senderId === userId;
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <span className="text-[9px] text-stone-500 font-mono leading-none">{msg.senderName}</span>
                            <span className={`px-2 py-1.5 rounded text-[11px] mt-0.5 break-all max-w-[85%] font-sans leading-snug ${isMe ? 'bg-[#FABF18]/25 text-amber-300 rounded-tr-none' : 'bg-stone-800 text-stone-200 rounded-tl-none'}`}>{msg.text}</span>
                          </div>
                        );
                      })}
                      {activeGame.chat.length === 0 && <p className="text-[10px] text-stone-600 text-center py-6">Conversa silenciosa...</p>}
                    </div>

                    {/* Quick Reactions Emojis Panel */}
                    <div className="flex items-center justify-between gap-1 py-1 px-1 border-t border-stone-850 bg-stone-950/40 rounded-b mt-1">
                      <span className="text-[8px] text-stone-500 font-bold uppercase tracking-wider font-mono mr-1">Provocar:</span>
                      <div className="flex flex-1 items-center justify-around">
                        {['😂', '🤫', '😎', '🔥', '💸', '👑', '😱', '💥'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={async () => {
                              try {
                                await fetch('/api/games/chat', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ gameId: activeGame.id, userId: userId, text: emoji }),
                                });
                              } catch (err) {
                                console.error('Error sending chat emoji:', err);
                              }
                            }}
                            className="hover:scale-130 hover:bg-stone-800 p-1.5 rounded text-xs cursor-pointer transition-all duration-100 active:scale-90"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    <form onSubmit={handleSendChat} className="flex gap-1.5 pt-2 border-t border-stone-850/60 mt-1.5">
                      <input
                        type="text"
                        placeholder="Mensagem..."
                        maxLength={50}
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        className="flex-1 bg-stone-900 border border-stone-750 p-1.5 rounded text-xs text-stone-100 focus:outline-none focus:border-[#FABF18]"
                      />
                      <button type="submit" className="bg-[#FABF18] text-[#142c23] hover:bg-[#e0ab12] font-black text-xs px-2.5 py-1.5 rounded cursor-pointer">Enviar</button>
                    </form>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>
      </section>

      {/* Victory Celebration Dynamic Modal with confetti rain */}
      <AnimatePresence>
        {showVictoryOverlay && activeGame && activeGame.status === 'finished' && (
          <VictoryAnimation
            winnerName={activeGame.winnerId ? (activeGame.winnerId === activeGame.host.id ? activeGame.host.name : activeGame.guest?.name || 'Adversário') : ''}
            isDraw={!activeGame.winnerId}
            isPlayerWinner={activeGame.winnerId === userId}
            prize={activeGame.prizePool}
            balance={player ? player.balance : 0}
            onClose={() => {
              setShowVictoryOverlay(false);
              handleExitToLobby();
            }}
          />
        )}
      </AnimatePresence>

      {/* SECTION 2: CLEAN WHITE SEO RULES SECTION - EXACT SAME WORDS AND LOOK FROM THE PICTURE */}
      <section className="bg-white text-stone-800 px-6 sm:px-12 py-16 border-t border-stone-200" id="damas-seo-content">
        <div className="max-w-4xl mx-auto space-y-12 leading-relaxed font-sans">
          
          {/* Main Title Centered */}
          <div className="text-center space-y-2.5">
            <h1 className="text-3xl sm:text-5xl font-black text-stone-950 font-sans tracking-tight">
              Jogue Damas online grátis
            </h1>
            <div className="flex items-center justify-center gap-2 text-[#9E713E] font-bold text-sm sm:text-base border-t border-b border-stone-150 py-3 mt-4">
              <span>Tipo de Jogo: <span className="text-stone-900 font-semibold">Jogo de estratégia</span></span>
              <span className="text-stone-300 px-1">|</span>
              <span>Nº de Jogadores: <span className="text-stone-900 font-semibold">2</span></span>
            </div>
          </div>

          {/* Section: COMO JOGAR DAMAS */}
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-black text-stone-950 border-b-2 border-amber-450 pb-1.5 uppercase tracking-wide">
              COMO JOGAR DAMAS?
            </h2>
            <p className="text-sm sm:text-base text-stone-700 font-sans font-medium">
              O clássico jogo de Damas é um jogo de tabuleiro estratégico com uma rica história que remonta a séculos.
              Tradicionalmente, é jogado em um tabuleiro quadriculado com dois jogadores que se alternam movendo suas peças diagonalmente pelas casas.
              O objetivo é capturar todas as peças do oponente ou bloqueá-las para que não possam se mover.
            </p>
            <p className="text-sm sm:text-base text-stone-700 font-sans">
              Com o tempo, diferentes variantes de damas surgiram, cada uma com suas próprias regras únicas e nuances de jogabilidade.
              Na nossa versão do jogo, você tem a flexibilidade de escolher entre vários presets como Damas Internacionais, Damas Diretas, Damas Pool, e mais.
              Alternativamente, você pode personalizar seu próprio conjunto de regras para corresponder ao seu estilo de jogo preferido.
            </p>
          </div>

          {/* Section: AS REGRAS */}
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-black text-stone-950 border-b-2 border-amber-450 pb-1.5 uppercase tracking-wide">
              AS REGRAS
            </h2>
            <p className="text-sm sm:text-base text-stone-700 font-sans">
              Aqui estão algumas regras comuns que se aplicam na maioria das variantes:
            </p>
            <ul className="space-y-3 pl-3">
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">♣ Movimento Diagonal:</b> Os peões movem-se diagonalmente para frente.
              </li>
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">♣ Movimentos de Captura:</b> As peças podem capturar adversários pulando sobre eles diagonalmente.
              </li>
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">♣ Promoção a Rei (Dama):</b> Quando um peão chega ao extremo oposto do tabuleiro, ele se torna um rei (representado com coroa 👑 em nosso tabuleiro), permitindo que se mova e capture em várias direções diagonalmente.
              </li>
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">♣ Regra de Captura Obrigatória:</b> Em nosso motor de jogo certificado, se houver um salto disponível, a captura é obrigatória. O sistema destaca automaticamente as peças compatíveis!
              </li>
            </ul>
          </div>

          {/* Section: DICAS DE ESTRATÉGIA */}
          <div className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-black text-stone-950 border-b-2 border-amber-450 pb-1.5 uppercase tracking-wide">
              DICAS DE ESTRATÉGIA
            </h2>
            <ul className="space-y-3 pl-3">
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">1. Controle o Centro:</b> Dominar as casas no centro do tabuleiro oferece maior mobilidade e mais opções para ataque e defesa. Procure avançar suas peças para o centro enquanto impede que seu oponente faça o mesmo.
              </li>
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">2. Mantenha uma Formação Equilibrada:</b> Evite dispersar suas peças pelo tabuleiro. Mantenha-as em uma formação equilibrada para melhor proteção mútua.
              </li>
              <li className="text-sm sm:text-base text-stone-700 font-sans">
                <b className="text-stone-900">3. Planeje Vários Movimentos à Frente:</b> Tente prever as respostas de seu oponente para criar armadilhas vantajosas e capturas duplas surpresas.
              </li>
            </ul>
          </div>

          {/* Section: DESCUBRA MAIS JOGOS DIVERTIDOS */}
          <div className="space-y-4 border-t border-stone-150 pt-8">
            <h2 className="text-xl sm:text-2xl font-black text-stone-950 uppercase tracking-wide">
              DESCUBRA OUTRAS VARIANTES EM NOSSA PLATAFORMA
            </h2>
            <div className="flex flex-wrap gap-4 text-sm font-bold text-amber-900">
              <span className="hover:underline cursor-pointer">👑 Damas Clássica 8x8</span>
              <span>•</span>
              <span className="hover:underline cursor-pointer">👑 Damas Internacional 10x10</span>
              <span>•</span>
              <span className="hover:underline cursor-pointer">👑 Torneio de Elite Online</span>
              <span>•</span>
              <span className="hover:underline cursor-pointer">👑 Duelos PVP Customizados</span>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 3: DARK SOLID WOOD FOOTER WITH FLAGS & LABELS */}
      <footer className="bg-[#1C120D] text-stone-400 py-8 px-6 text-xs sm:text-sm border-t border-stone-900 font-sans">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex flex-col items-center sm:items-start gap-1">
            <span className="text-stone-100 font-black text-lg italic flex items-center gap-0.5 leading-none mb-1">
              Dama<span className="text-[#FABF18] font-black">Bet</span>
            </span>
            <p className="text-[11px] text-[#999]">
              © 2024-2026 DamaBet, Plataforma de Entretenimento Multi-jogo e Treino. Todos os Direitos Reservados.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#FABF18] font-bold">Idioma:</span>
            <select
              className="bg-[#2B1D16] border border-stone-800 text-stone-100 font-bold px-3 py-1.5 rounded cursor-pointer focus:outline-none text-xs"
              defaultValue="pt"
            >
              <option value="pt">Português 🇧🇷 ▾</option>
              <option value="en">English 🇺🇸</option>
              <option value="es">Español 🇪🇸</option>
            </select>
          </div>

        </div>
      </footer>
    </div>
  );
}
