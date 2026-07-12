import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import { initializeBoard, getValidMoves, executeMove, checkGameOver, selectSmartBotMove } from './utils/checkers.js';
import { Game, Player, Message, Transaction, GameStatus, PlayerColor, MoveCoordinates, Piece, Deposit, WebhookEvent, Withdrawal } from './types.js';
import { UserRepository, DepositRepository, TransactionRepository, WebhookEventRepository, WithdrawalRepository } from './db/repositories.js';
import { requireAuth, AuthenticatedRequest, signToken, verifyToken } from './utils/auth.js';
import { generatePixBRCode, PLATFORM_PIX_KEY, PLATFORM_PIX_KEY_TYPE, PLATFORM_PIX_HOLDER_NAME } from './utils/pix.js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

// --- Security Utilities for Password Hashing ---
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const HASH_ITERATIONS = 100000;
const DIGEST = 'sha512';

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
}

// --- Rate Limiting ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function sanitize(val: string): string {
  return val.replace(/[<>&"']/g, '').trim();
}

// --- Admin Authorization ---
// SECURITY: must be an exact ID match against a fixed allowlist, never a substring
// match on a user-editable field like `name` (that let any user rename themselves
// to gain admin access to withdrawal approval).
const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || 'user_admin')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
);

function isAdminUser(user: Pick<Player, 'id'> | null | undefined): boolean {
  return !!user && ADMIN_USER_IDS.has(user.id);
}

// SECURITY: strips password hash/salt before a Player object is ever sent over
// the wire. This matters beyond auth responses — `host`/`guest` on a Game are
// full Player records that get broadcast to the opponent and lobby watchers via
// SSE, so any spot that embeds a Player into client-visible JSON must go through
// this first.
function toSafeUser(user: Player): Player & { isAdmin: boolean } {
  const { passwordHash, passwordSalt, ...safe } = user;
  return { ...safe, isAdmin: isAdminUser(user) };
}

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup matching FRONTEND_URL
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
  credentials: true
}));

// Gzip all JSON responses to speed up the game/lobby polling and history endpoints.
// SSE streams must stay unbuffered, so they're excluded by path.
app.use(compression({
  filter: (req, res) => !req.path.includes('/stream') && compression.filter(req, res)
}));

app.use(express.json());

// In-memory games collection for quick check matchups
const games = new Map<string, Game>();

// Shared KV game persistence mock / helper (for multi-instance compatibility)
const KV_REST_URL = process.env.KV_REST_API_URL;
const KV_REST_TOKEN = process.env.KV_REST_API_TOKEN;
const kvAvailable = !!(KV_REST_URL && KV_REST_TOKEN);

async function kvGet(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${KV_REST_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_REST_TOKEN}` },
    });
    const data: any = await res.json();
    return data.result ?? null;
  } catch { return null; }
}

async function kvSet(key: string, value: string): Promise<void> {
  try {
    await fetch(`${KV_REST_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
    });
  } catch {}
}

async function gameKvSet(game: Game): Promise<void> {
  games.set(game.id, game);
  if (kvAvailable) {
    await kvSet(`game:${game.id}`, JSON.stringify(game));
  }
}

async function gameKvGet(gameId: string): Promise<Game | undefined> {
  const local = games.get(gameId);
  if (local) return local;
  if (!kvAvailable) return undefined;
  try {
    const raw = await kvGet(`game:${gameId}`);
    if (raw) {
      const game = JSON.parse(raw) as Game;
      games.set(gameId, game);
      return game;
    }
  } catch {}
  return undefined;
}

// --- Dynamic Social Winners List ---
interface LastWinnerEntry {
  playerName: string;
  amount: number;
  timestamp: string;
}
const lastWinners: LastWinnerEntry[] = [];
const fictitiousNames = [
  'Ruan2020', 'Lucas77', 'MatheusBR', 'PedroX10', 'Kaio99', 'Gabriel22',
  'Felipe777', 'ViniciusX', 'JoãoPro', 'Rafa2025', 'Gustavo01', 'Henrique7',
  'LeoMaster', 'Kauan09', 'DaviX1', 'ArthurPlay', 'Biel777', 'ThiagoBR'
];

function recordWin(playerName: string, amount: number) {
  lastWinners.unshift({
    playerName, amount,
    timestamp: new Date().toISOString()
  });
  if (lastWinners.length > 50) lastWinners.length = 50;
}

// --- SSE Realtime Connections ---
interface Connection {
  id: string;
  res: any;
}
const gameConnections = new Map<string, Connection[]>();
const lobbyConnections: Connection[] = [];

function broadcastGame(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;
  const conns = gameConnections.get(gameId) || [];
  const deadConns: string[] = [];
  for (const conn of conns) {
    try {
      conn.res.write(`data: ${JSON.stringify(game)}\n\n`);
    } catch {
      deadConns.push(conn.id);
    }
  }
  if (deadConns.length > 0) {
    gameConnections.set(gameId, conns.filter(c => !deadConns.includes(c.id)));
  }
}

function broadcastLobby() {
  const lobbyGames = Array.from(games.values()).filter(
    g => (g.status === 'waiting_for_challenger' || g.status === 'bet_confirmation') && !g.isPrivate
  );
  const deadConns: string[] = [];
  for (const conn of lobbyConnections) {
    try {
      conn.res.write(`data: ${JSON.stringify(lobbyGames)}\n\n`);
    } catch {
      deadConns.push(conn.id);
    }
  }
  if (deadConns.length > 0) {
    const nextList = lobbyConnections.filter(c => !deadConns.includes(c.id));
    lobbyConnections.length = 0;
    lobbyConnections.push(...nextList);
  }
}

// --- Bot Turn Logic ---
async function finalizeBotGameCount(game: Game) {
  if (game.isBotGame) {
    const hostUser = await UserRepository.findById(game.host.id);
    if (hostUser) {
      hostUser.botGamesPlayed = (hostUser.botGamesPlayed || 0) + 1;
      await UserRepository.save(hostUser);
    }
  }
}

// --- Bot Turn Logic ---
async function runBotTurnIfActive(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.status !== 'active') return;

  while (game && game.isBotGame && game.turn === 'black' && game.status === 'active') {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    game = games.get(gameId);
    if (!game || game.status !== 'active' || game.turn !== 'black') break;

    const validMoves = getValidMoves(game.board.grid, 'black', game.mustJumpPieceIdByTurn);
    if (validMoves.length === 0) break;

    const hostProfile = await UserRepository.findById(game.host.id);
    const botGamesPlayed = hostProfile?.botGamesPlayed || 0;
    const move = selectSmartBotMove(game.board.grid, 'black', validMoves, botGamesPlayed);
    const { grid: nextGrid, promotedToKing, nextSpecialMustJumpPieceId } = executeMove(game.board.grid, move);

    game.board.grid = nextGrid;
    const updatedPieces: Piece[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = nextGrid[r][c];
        if (p) updatedPieces.push(p);
      }
    }
    game.pieces = updatedPieces;

    const pieceName = move.isJump ? 'capturou peça' : 'moveu para';
    const playerLabel = game.guest?.name || 'Adversário';
    const promotionMsg = promotedToKing ? ' 👑 PROMOVIDO A DAMA!' : '';
    game.log.push(`${playerLabel} ${pieceName} [${move.to.row + 1},${move.to.col + 1}]${promotionMsg}`);

    if (nextSpecialMustJumpPieceId) {
      game.mustJumpPieceIdByTurn = nextSpecialMustJumpPieceId;
    } else {
      game.mustJumpPieceIdByTurn = null;
      game.turn = 'red';
    }

    const gameOverStatus = checkGameOver(game.board.grid, game.turn);
    if (gameOverStatus.isGameOver) {
      game.status = 'finished';
      await finalizeBotGameCount(game);
      if (gameOverStatus.winner) {
        const winnerId = gameOverStatus.winner === 'red' ? game.host.id : 'bot-dama';
        const winnerName = gameOverStatus.winner === 'red' ? game.host.name : (game.guest?.name || 'Adversário');
        game.winnerId = winnerId;
        game.log.push(`👑 FIM DE JOGO: ${winnerName} venceu por bloqueio/aniquilação!`);

        if (gameOverStatus.winner === 'red') {
          game.log.push(`🎉 Prêmio de R$ ${game.prizePool.toFixed(2)} transferido à carteira.`);
          const luckyWinner = await UserRepository.findById(game.host.id);
          if (luckyWinner) {
            luckyWinner.balance += game.prizePool;
            await UserRepository.save(luckyWinner);
            recordWin(winnerName, game.prizePool);

            const txPayout: Transaction = {
              id: `tx-win-${crypto.randomBytes(4).toString('hex')}`,
              userId: game.host.id,
              type: 'win_payout',
              amount: game.prizePool,
              description: `Prêmio recebido: Vitória contra ${game.guest?.name || 'Adversário'} (ID: ${game.id})`,
              createdAt: new Date().toISOString()
            };
            await TransactionRepository.create(txPayout);
          }
        }
      }
    } else {
      // Periodic bot message responses to add dynamic flavor
      const botSender = game.guest || { id: 'bot-dama', name: 'Smart Bot 🤖' };
      let reactionEmoji: string | null = null;
      if (promotedToKing) {
        reactionEmoji = '👑';
      } else if (move.isJump) {
        if (Math.random() < 0.6) {
          reactionEmoji = Math.random() < 0.5 ? '😂' : '🔥';
        }
      } else if (Math.random() < 0.15) {
        reactionEmoji = '🧠';
      }
      if (reactionEmoji) {
        game.chat.push({
          id: `msg-bot-${crypto.randomBytes(4).toString('hex')}`,
          senderId: botSender.id,
          senderName: botSender.name,
          text: reactionEmoji,
          timestamp: new Date().toISOString()
        });
      }
    }

    await gameKvSet(game);
    broadcastGame(gameId);
    broadcastLobby();
  }
}

// --- Bet Deduction Helper ---
async function deductBetWithBonus(user: Player, betAmount: number, gameId: string) {
  user.bonusBalance = user.bonusBalance || 0;
  user.rolloverRequired = user.rolloverRequired || 0;
  user.rolloverWagered = user.rolloverWagered || 0;

  let remaining = betAmount;
  let bonusUsed = 0;
  if (user.bonusBalance > 0) {
    if (user.bonusBalance >= remaining) {
      user.bonusBalance -= remaining;
      bonusUsed = remaining;
      remaining = 0;
    } else {
      bonusUsed = user.bonusBalance;
      remaining -= user.bonusBalance;
      user.bonusBalance = 0;
    }
  }
  user.balance -= remaining;

  if (user.rolloverRequired > 0) {
    user.rolloverWagered += betAmount;
    if (user.rolloverWagered >= user.rolloverRequired) {
      const remainingBonus = user.bonusBalance;
      user.balance += remainingBonus;
      user.bonusBalance = 0;
      
      const unlockedTx: Transaction = {
        id: `tx-roll-win-${crypto.randomBytes(4).toString('hex')}`,
        userId: user.id,
        type: 'win_payout',
        amount: remainingBonus,
        description: `🏆 BONUSAZO DA COPA DO MUNDO LIBERADO! Rollover de R$ ${user.rolloverRequired.toFixed(2)} cumprido com sucesso!`,
        createdAt: new Date().toISOString()
      };
      await TransactionRepository.create(unlockedTx);
      
      user.rolloverRequired = 0;
      user.rolloverWagered = 0;
    }
  }
  await UserRepository.save(user);
}

async function refundBetWithBonus(user: Player, betAmount: number) {
  user.balance += betAmount;
  if (user.rolloverRequired && user.rolloverRequired > 0) {
    user.rolloverWagered = Math.max(0, (user.rolloverWagered || 0) - betAmount);
  }
  await UserRepository.save(user);
}

// --- Deposit Approval Helper ---
// Shared by the manual admin-approval endpoint and the (currently unused,
// kept for future re-activation) Mercado Pago webhook, so the World Cup promo
// math only lives in one place.
async function creditApprovedDeposit(deposit: Deposit, user: Player, description: string): Promise<void> {
  await DepositRepository.updateStatus(deposit.id, 'approved', new Date().toISOString());

  const now = new Date();
  const deadline = new Date('2026-07-20T03:00:00Z');
  let bonusAdded = 0;
  const rolloverMultiplier = 3;

  if (now <= deadline) {
    if (deposit.amount >= 100) bonusAdded = 250;
    else if (deposit.amount >= 50) bonusAdded = 120;
    else if (deposit.amount >= 20) bonusAdded = 50;
  }

  user.balance += deposit.amount;
  if (bonusAdded > 0) {
    user.bonusBalance = (user.bonusBalance || 0) + bonusAdded;
    user.rolloverRequired = (user.rolloverRequired || 0) + (bonusAdded * rolloverMultiplier);
    user.rolloverWagered = user.rolloverWagered || 0;
  }

  await UserRepository.save(user);
  console.log(`[CREDIT_DONE] Account ${user.id} credited R$ ${deposit.amount} (+ R$ ${bonusAdded} bonus).`);

  const tx: Transaction = {
    id: `tx-dep-${crypto.randomBytes(4).toString('hex')}`,
    userId: user.id,
    type: 'deposit',
    amount: deposit.amount,
    description,
    createdAt: new Date().toISOString()
  };
  await TransactionRepository.create(tx);

  if (bonusAdded > 0) {
    const promoTx: Transaction = {
      id: `tx-promo-${crypto.randomBytes(4).toString('hex')}`,
      userId: user.id,
      type: 'deposit',
      amount: bonusAdded,
      description: `🏆 Bônus Copa do Mundo 2026: +R$ ${bonusAdded.toFixed(2)} creditado! (Rollover 3x)`,
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(promoTx);
  }
}

// --- User Profiling helper ---
async function getOrCreateUser(id: string, customName?: string): Promise<Player> {
  let user = await UserRepository.findById(id);
  if (!user) {
    const names = ['Guerreiro da Dama', 'Mestre das Pedras', 'DamaMestre', 'ReiDoTabu'];
    const defaultName = customName || `${names[Math.floor(Math.random() * names.length)]}#${Math.floor(1000 + Math.random() * 9000)}`;
    user = {
      id,
      name: defaultName,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`,
      balance: 0,
      botGamesPlayed: 0,
      bonusBalance: 0,
      rolloverRequired: 0,
      rolloverWagered: 0
    };
    await UserRepository.save(user);
  } else if (customName && customName !== user.name) {
    user.name = customName;
    await UserRepository.save(user);
  }
  return user;
}

// --- Mercado Pago Client initialization ---
// Accept both spellings seen across this project's docs/history so a misnamed
// env var in the hosting dashboard doesn't silently disable real PIX payments.
const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
if (!mpAccessToken) {
  console.warn('[STARTUP] No Mercado Pago access token configured (MERCADOPAGO_ACCESS_TOKEN). Deposits will use MOCK PIX codes — no real money will be received.');
}
const mpConfig = new MercadoPagoConfig({
  accessToken: mpAccessToken,
  options: { timeout: 10000 }
});
const paymentClient = new Payment(mpConfig);

// --- Backend API Routes ---

// Registration
app.post('/api/auth/register', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde.' });

  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Por favor, insira o Gmail, nick e a senha.' });
  }

  const normalizedUser = sanitize(username);
  const normalizedEmail = sanitize(email).toLowerCase();

  if (!normalizedEmail.includes('@') || !normalizedEmail.endsWith('gmail.com')) {
    return res.status(400).json({ error: 'Insira um e-mail do Gmail válido.' });
  }

  const existingUser = await UserRepository.findByEmailOrUsername(normalizedUser);
  const existingEmail = await UserRepository.findByEmailOrUsername(normalizedEmail);

  if (existingUser) return res.status(400).json({ error: 'Este nick de usuário já está em uso.' });
  if (existingEmail) return res.status(400).json({ error: 'Este Gmail já está cadastrado.' });

  const { hash, salt } = hashPassword(password);
  const id = 'user_' + crypto.randomBytes(8).toString('hex');
  const newUser: Player = {
    id,
    name: normalizedUser,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`,
    balance: 0,
    botGamesPlayed: 0,
    bonusBalance: 0,
    rolloverRequired: 0,
    rolloverWagered: 0
  };

  await UserRepository.save(newUser);

  const token = signToken({ userId: id });

  res.json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      avatar: newUser.avatar,
      balance: newUser.balance,
      bonusBalance: newUser.bonusBalance,
      rolloverRequired: newUser.rolloverRequired,
      rolloverWagered: newUser.rolloverWagered,
      isAdmin: isAdminUser(newUser)
    }
  });
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde.' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Insira o Gmail/Nick e a senha.' });

  const normalizedInput = sanitize(username).toLowerCase();
  const foundUser = await UserRepository.findByEmailOrUsername(normalizedInput);

  if (!foundUser || !foundUser.passwordHash || !foundUser.passwordSalt) {
    return res.status(400).json({ error: 'Credenciais inválidas.' });
  }

  const isValid = verifyPassword(password, foundUser.passwordHash, foundUser.passwordSalt);
  if (!isValid) return res.status(400).json({ error: 'Credenciais inválidas.' });

  const token = signToken({ userId: foundUser.id });

  res.json({
    success: true,
    token,
    user: {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      avatar: foundUser.avatar,
      balance: foundUser.balance,
      bonusBalance: foundUser.bonusBalance,
      rolloverRequired: foundUser.rolloverRequired,
      rolloverWagered: foundUser.rolloverWagered,
      isAdmin: isAdminUser(foundUser)
    }
  });
});

// Token Verify
app.post('/api/auth/verify-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token ausente.' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });

  const user = await UserRepository.findById(decoded.userId);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      balance: user.balance,
      bonusBalance: user.bonusBalance,
      rolloverRequired: user.rolloverRequired,
      rolloverWagered: user.rolloverWagered,
      isAdmin: isAdminUser(user)
    }
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// Profile fetching
app.get('/api/users/profile', async (req, res) => {
  const { id, name } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Falta o ID do usuário' });
  const user = await getOrCreateUser(id, typeof name === 'string' ? name : undefined);
  const txHistory = await TransactionRepository.findAllByUserId(id);
  res.json({ user: toSafeUser(user), transactions: txHistory });
});

// Name update
app.post('/api/users/update-name', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Dados insuficientes' });
  const user = await UserRepository.findById(req.userId!);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  user.name = sanitize(name);
  await UserRepository.save(user);
  res.json({ success: true, user: toSafeUser(user) });
});

// Dev/Admin Simulation Deposit — credits a balance without a real PIX transfer.
// SECURITY: this used to be callable by anyone (no auth) as long as an env flag
// was set, meaning a misconfigured flag would let any visitor mint free balance
// for themselves. It now always requires an authenticated admin, regardless of
// the env flag, which only controls whether it's available at all in production.
app.post('/api/users/deposit', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id, amount } = req.body;
  const numAmount = parseFloat(amount);
  if (!id || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Quantia de depósito inválida' });
  }

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_DEPOSITS !== 'true') {
    return res.status(403).json({ error: 'Depósitos simulados estão desativados em produção. Use o fluxo PIX manual.' });
  }

  const requester = await UserRepository.findById(req.userId!);
  if (!isAdminUser(requester)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  const user = await getOrCreateUser(id);
  user.balance += numAmount;

  const now = new Date();
  const deadline = new Date('2026-07-20T03:00:00Z');
  let bonusAdded = 0;
  const rolloverMultiplier = 3;

  if (now <= deadline) {
    if (numAmount >= 100) bonusAdded = 250;
    else if (numAmount >= 50) bonusAdded = 120;
    else if (numAmount >= 20) bonusAdded = 50;
  }

  if (bonusAdded > 0) {
    user.bonusBalance = (user.bonusBalance || 0) + bonusAdded;
    user.rolloverRequired = (user.rolloverRequired || 0) + (bonusAdded * rolloverMultiplier);
    user.rolloverWagered = user.rolloverWagered || 0;
  }

  await UserRepository.save(user);

  const tx: Transaction = {
    id: `tx-dep-${crypto.randomBytes(4).toString('hex')}`,
    userId: id,
    type: 'deposit',
    amount: numAmount,
    description: `Depósito simulado via PIX de R$ ${numAmount.toFixed(2)} (Modo Seguro)`,
    createdAt: new Date().toISOString()
  };
  await TransactionRepository.create(tx);

  if (bonusAdded > 0) {
    const promoTx: Transaction = {
      id: `tx-promo-${crypto.randomBytes(4).toString('hex')}`,
      userId: id,
      type: 'deposit',
      amount: bonusAdded,
      description: `🏆 Promoção Copa 2026: Bônus de +R$ ${bonusAdded.toFixed(2)} creditado! (Rollover 3x)`,
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(promoTx);
  }

  const txHistory = await TransactionRepository.findAllByUserId(id);
  res.json({ user: toSafeUser(user), transactions: txHistory });
});

// Withdrawal Request (to be paid manually by administrator)
app.post('/api/users/withdraw', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { amount, pixKey, pixKeyType } = req.body;
  
  // 1. Validate & round amount to two decimal places
  let numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Quantia de saque inválida.' });
  }
  numAmount = parseFloat(numAmount.toFixed(2));

  // 2. Validate PIX fields
  const validPixTypes = ['cpf', 'cnpj', 'email', 'phone', 'random'];
  if (!pixKey || !pixKeyType || !validPixTypes.includes(String(pixKeyType).toLowerCase())) {
    return res.status(400).json({ error: 'Chave PIX ou Tipo de Chave PIX inválido.' });
  }
  const cleanPixKey = sanitize(pixKey);
  const cleanPixKeyType = String(pixKeyType).toLowerCase() as any;

  const userId = req.userId!;
  const user = await UserRepository.findById(userId);
  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }

  // 3. Rate limiting check (minimum 1 minute between withdrawal requests)
  const lastWithdrawal = await WithdrawalRepository.findLastByUserId(userId);
  if (lastWithdrawal) {
    const elapsedMs = Date.now() - new Date(lastWithdrawal.createdAt).getTime();
    if (elapsedMs < 60000) {
      return res.status(429).json({ error: 'Aguarde 1 minuto entre solicitações de saque.' });
    }
  }

  // 4. Validate user has at least one approved deposit
  const deposits = await DepositRepository.findAllByUserId(userId);
  const approvedDeposits = deposits.filter(d => d.status === 'approved');
  if (approvedDeposits.length === 0) {
    return res.status(400).json({ error: 'Você precisa ter feito pelo menos um depósito via PIX aprovado antes de realizar saques.' });
  }

  // 5. Check rollover requirements
  const rolloverLeft = (user.rolloverRequired || 0) - (user.rolloverWagered || 0);
  if (rolloverLeft > 0) {
    return res.status(400).json({
      error: `Saque bloqueado! Você possui bônus ativo da Copa do Mundo 2026. Complete o rollover restante de R$ ${rolloverLeft.toFixed(2)} jogando damas para autorizar saques.`
    });
  }

  // 6. Enforce min/max boundaries
  if (numAmount < 65.00) {
    return res.status(400).json({ error: 'O valor mínimo para realizar um saque é R$ 65,00.' });
  }
  if (numAmount > 5000.00) {
    return res.status(400).json({ error: 'O valor máximo permitido por saque é R$ 5.000,00.' });
  }

  // 7. Prevent multiple pending/processing withdrawals
  const pendingWithdrawal = await WithdrawalRepository.findPendingByUserId(userId);
  if (pendingWithdrawal) {
    return res.status(400).json({ error: 'Você já possui uma solicitação de saque em processamento.' });
  }

  // 8. Validate sufficient balance
  if (user.balance < numAmount) {
    return res.status(400).json({ error: 'Saldo insuficiente para realizar este saque.' });
  }

  // 9. Execute transaction: deduct balance, increase lockedBalance, insert withdrawal, write transaction log
  const withdrawalId = `with-${crypto.randomBytes(8).toString('hex')}`;
  const nowStr = new Date().toISOString();

  const newWithdrawal: Withdrawal = {
    id: withdrawalId,
    userId,
    amount: numAmount,
    pixKey: cleanPixKey,
    pixKeyType: cleanPixKeyType,
    status: 'pending',
    createdAt: nowStr
  };

  const txLog: Transaction = {
    id: `tx-with-${crypto.randomBytes(4).toString('hex')}`,
    userId,
    type: 'withdrawal',
    amount: numAmount,
    description: `Solicitação de saque PIX (Ref: ${withdrawalId}, Chave: ${cleanPixKeyType}: ${cleanPixKey}) registrada. Valor de R$ ${numAmount.toFixed(2)} foi debitado do saldo e reservado em saldo bloqueado.`,
    createdAt: nowStr
  };

  try {
    await WithdrawalRepository.createWithdrawalTransaction(newWithdrawal, numAmount, numAmount, txLog);
    console.log(`[ADMIN_LOG] Saque solicitado: Usuário ${user.name} (${user.id}) solicitou R$ ${numAmount.toFixed(2)} via PIX (${cleanPixKeyType}: ${cleanPixKey}). Status: pending.`);
  } catch (err: any) {
    console.error('Error executing withdrawal transaction:', err);
    return res.status(500).json({ error: 'Falha ao processar a solicitação de saque no banco de dados.' });
  }

  // Retrieve updated user and transactions list
  const updatedUser = await UserRepository.findById(userId);
  const txHistory = await TransactionRepository.findAllByUserId(userId);
  res.json({ success: true, user: updatedUser ? toSafeUser(updatedUser) : null, transactions: txHistory });
});

// GET user withdrawals list
app.get('/api/withdrawals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const list = await WithdrawalRepository.findAllByUserId(req.userId!);
    res.json(list);
  } catch (err) {
    console.error('Error fetching user withdrawals:', err);
    res.status(500).json({ error: 'Erro ao listar solicitações de saque.' });
  }
});

// GET all withdrawals list (Admin only)
app.get('/api/admin/withdrawals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await UserRepository.findById(req.userId!);
    if (!isAdminUser(user)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    const list = await WithdrawalRepository.findAll();
    res.json(list);
  } catch (err) {
    console.error('Error fetching admin withdrawals:', err);
    res.status(500).json({ error: 'Erro ao listar solicitações de saque para administrador.' });
  }
});

// Admin change withdrawal status (e.g. approve/reject/failed/processing/cancelled)
app.post('/api/admin/withdrawals/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { withdrawalId, status } = req.body;
  const allowedStatuses = ['approved', 'rejected', 'failed', 'cancelled', 'processing'];
  
  if (!withdrawalId || !status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Parâmetros de atualização inválidos.' });
  }

  try {
    const user = await UserRepository.findById(req.userId!);
    if (!isAdminUser(user)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const w = await WithdrawalRepository.findById(withdrawalId);
    if (!w) {
      return res.status(404).json({ error: 'Solicitação de saque não encontrada.' });
    }

    if (w.status === 'approved' || w.status === 'rejected' || w.status === 'cancelled' || w.status === 'failed') {
      return res.status(400).json({ error: 'Esta solicitação de saque já foi finalizada.' });
    }

    const approvedAt = (status === 'approved' || status === 'rejected' || status === 'failed' || status === 'cancelled') ? new Date().toISOString() : undefined;
    await WithdrawalRepository.updateWithdrawalStatusTransaction(withdrawalId, status, approvedAt);
    
    console.log(`[ADMIN_LOG] Saque atualizado: Registro ${withdrawalId} alterado para status ${status} pelo administrador.`);
    res.json({ success: true, message: `Status da solicitação de saque atualizado para ${status} com sucesso.` });
  } catch (err) {
    console.error('Error updating withdrawal status:', err);
    res.status(500).json({ error: 'Erro ao processar alteração de status do saque.' });
  }
});

// --- MANUAL PIX DEPOSIT ENDPOINTS ---
// The platform doesn't rely on an automated payment gateway for deposits: the
// player pays a fixed, real PIX key belonging to the site owner, taps "Já
// paguei", and the owner manually confirms the transfer landed in their bank
// account before approving it from the admin panel. Mirrors the withdrawal
// flow, which is manual by the same design choice.

// 1. Create a pending deposit and hand back the static PIX "Copia e Cola" code
app.post('/api/deposit/create', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { amount } = req.body;
  const numAmount = parseFloat(amount);

  if (isNaN(numAmount) || numAmount < 5) {
    return res.status(400).json({ error: 'O valor mínimo para depósitos é R$ 5,00.' });
  }

  const user = await UserRepository.findById(req.userId!);
  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }

  const depositId = `dep-${crypto.randomBytes(8).toString('hex')}`;
  // Manual review needs realistic time to check a bank statement, not a tight
  // automated-gateway window.
  const expirationHours = 24;
  const expirationDate = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

  const newDeposit: Deposit = {
    id: depositId,
    userId: user.id,
    mpPaymentId: `manual-${crypto.randomBytes(6).toString('hex')}`,
    amount: numAmount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expirationAt: expirationDate.toISOString()
  };

  await DepositRepository.create(newDeposit);
  console.log(`[PIX_GENERATED] Deposit ${depositId} created for R$ ${numAmount} by user ${user.id} (${user.name}). Expires at ${newDeposit.expirationAt}`);

  res.json({
    depositId,
    qrCode: generatePixBRCode(numAmount),
    amount: numAmount,
    pixKey: PLATFORM_PIX_KEY,
    pixKeyType: PLATFORM_PIX_KEY_TYPE,
    holderName: PLATFORM_PIX_HOLDER_NAME
  });
});

// 2. Player confirms they've sent the transfer — moves the deposit into the
// admin's review queue. Does not credit balance by itself.
app.post('/api/deposit/:id/confirm', requireAuth, async (req: AuthenticatedRequest, res) => {
  const depositId = req.params.id;
  const deposit = await DepositRepository.findById(depositId);
  if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado.' });
  if (deposit.userId !== req.userId) return res.status(403).json({ error: 'Não autorizado.' });
  if (deposit.status !== 'pending') return res.status(400).json({ error: 'Este depósito já foi processado.' });

  await DepositRepository.markUserConfirmed(depositId, new Date().toISOString());
  console.log(`[DEPOSIT_USER_CONFIRMED] User ${req.userId} marked deposit ${depositId} (R$ ${deposit.amount}) as paid. Awaiting admin review.`);
  res.json({ success: true });
});

// 3. Admin queue: deposits the player has confirmed paying, awaiting approval
app.get('/api/admin/deposits', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await UserRepository.findById(req.userId!);
    if (!isAdminUser(admin)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    const list = await DepositRepository.findPendingConfirmed();
    res.json(list);
  } catch (err) {
    console.error('Error fetching admin deposits:', err);
    res.status(500).json({ error: 'Erro ao listar depósitos pendentes.' });
  }
});

// 4. Admin approves/rejects a manually-confirmed deposit
app.post('/api/admin/deposits/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { depositId, status } = req.body;
  const allowedStatuses = ['approved', 'rejected'];
  if (!depositId || !status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Parâmetros de atualização inválidos.' });
  }

  try {
    const admin = await UserRepository.findById(req.userId!);
    if (!isAdminUser(admin)) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const deposit = await DepositRepository.findById(depositId);
    if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado.' });
    if (deposit.status !== 'pending') {
      return res.status(400).json({ error: 'Este depósito já foi finalizado.' });
    }

    if (status === 'rejected') {
      await DepositRepository.updateStatus(depositId, 'rejected');
      console.log(`[ADMIN_LOG] Depósito ${depositId} rejeitado pelo administrador ${admin!.name}.`);
      return res.json({ success: true });
    }

    const depositUser = await UserRepository.findById(deposit.userId);
    if (!depositUser) return res.status(404).json({ error: 'Usuário do depósito não encontrado.' });

    await creditApprovedDeposit(deposit, depositUser, `Depósito via PIX aprovado manualmente (Ref: ${deposit.id})`);
    console.log(`[ADMIN_LOG] Depósito ${depositId} aprovado pelo administrador ${admin!.name}. R$ ${deposit.amount} creditado a ${depositUser.name}.`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating deposit status:', err);
    res.status(500).json({ error: 'Erro ao processar alteração de status do depósito.' });
  }
});

// 5. Mercado Pago Webhook (inert unless MERCADOPAGO_ACCESS_TOKEN is configured
// and the deposit-create flow above is switched back to using it — kept for
// future re-activation, not used by the manual flow above)
app.post('/api/webhooks/mercadopago', async (req, res) => {
  console.log('[WEBHOOK_RECEIVED] Webhook payload received:', JSON.stringify(req.body));

  const paymentId = req.body.data?.id || req.body.id || req.query['data.id'] || req.query['id'];
  const topic = req.body.type || req.body.topic || req.query['type'] || req.query['topic'] || 'payment';

  if (!paymentId || topic !== 'payment') {
    return res.json({ success: true, message: 'Event ignored' });
  }

  // 1. Signature Verification
  const xSignature = req.headers['x-signature'] as string || req.headers['x-mp-signature'] as string;
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (webhookSecret && xSignature) {
    try {
      const parts = xSignature.split(',');
      let ts = '';
      let v1 = '';
      parts.forEach(part => {
        const [key, val] = part.split('=');
        if (key && key.trim() === 'ts') ts = val.trim();
        if (key && key.trim() === 'v1') v1 = val.trim();
      });

      if (ts && v1) {
        const xRequestId = (req.headers['x-request-id'] || '') as string;
        const dataId = String(req.query['data.id'] || paymentId).trim().toLowerCase();
        
        // Reconstruct manifest string matching official Mercado Pago signature spec:
        // id:[data.id];request-id:[x-request-id];ts:[ts];
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        
        const calculatedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(manifest)
          .digest('hex');

        let isSignatureValid = false;
        try {
          isSignatureValid = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(calculatedSignature));
        } catch {
          isSignatureValid = (v1 === calculatedSignature);
        }

        if (!isSignatureValid) {
          console.warn('[WEBHOOK_SIGNATURE_MISMATCH] Signature verification failed for payment ID:', paymentId);
          return res.status(401).json({ error: 'Assinatura inválida do webhook' });
        }
      }
    } catch (sigErr) {
      console.error('Error validating signature:', sigErr);
      return res.status(500).json({ error: 'Erro ao validar assinatura' });
    }
  }

  // 2. Fetch payment directly from API to avoid trusting webhook payload
  let mpPayment;
  if (mpAccessToken) {
    try {
      mpPayment = await paymentClient.get({ id: paymentId });
    } catch (err: any) {
      console.error(`Error contacting Mercado Pago for payment ${paymentId}:`, err?.message || err);
      return res.status(500).json({ error: 'Erro ao consultar Mercado Pago.' });
    }
  } else {
    // Mock webhook triggers
    mpPayment = {
      id: paymentId,
      status: req.body.status || req.query.status || 'approved',
      transaction_amount: parseFloat(req.body.transaction_amount || req.query.transaction_amount || '10'),
      external_reference: req.body.external_reference || req.query.external_reference
    };
  }

  const mpPaymentIdStr = String(mpPayment.id);
  const mpStatus = mpPayment.status;
  const mpAmount = parseFloat(mpPayment.transaction_amount as any);

  // 3. Idempotency Check: Verify if webhook was already processed
  const existingEvent = await WebhookEventRepository.findByMpPaymentId(mpPaymentIdStr);
  if (existingEvent) {
    console.log(`[DUPLICATE_ATTEMPT_BLOCKED] Webhook for payment ${mpPaymentIdStr} already processed.`);
    return res.json({ success: true, message: 'Event already processed' });
  }

  // Fetch corresponding deposit from database
  const deposit = await DepositRepository.findByMpPaymentId(mpPaymentIdStr);
  if (!deposit) {
    console.warn(`[WEBHOOK_ERROR] Deposit record not found for MP Payment ${mpPaymentIdStr}`);
    return res.status(404).json({ error: 'Depósito correspondente não localizado.' });
  }

  if (deposit.status === 'approved') {
    console.log(`[DUPLICATE_ATTEMPT_BLOCKED] Deposit ${deposit.id} was already approved. Skipping.`);
    return res.json({ success: true, message: 'Deposit already processed' });
  }

  // Verify status is approved
  if (mpStatus !== 'approved') {
    console.log(`[PAYMENT_REJECTED] Payment ${mpPaymentIdStr} status is '${mpStatus}'. Updating status.`);
    if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      await DepositRepository.updateStatus(deposit.id, 'rejected');
    }
    return res.json({ success: true, message: `Payment is ${mpStatus}` });
  }

  // 4. Validate Amount matches database deposit amount
  if (mpAmount !== deposit.amount) {
    console.error(`[AUDIT_WARNING] Amount discrepancy! Expected R$ ${deposit.amount}, received R$ ${mpAmount} for payment ${mpPaymentIdStr}. CREDITING BLOCKED.`);
    await DepositRepository.updateStatus(deposit.id, 'rejected');
    return res.status(400).json({ error: 'Valor divergente. Não creditado.' });
  }

  const user = await UserRepository.findById(deposit.userId);
  if (!user) {
    console.error(`[WEBHOOK_ERROR] User ${deposit.userId} not found for deposit ${deposit.id}`);
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  await creditApprovedDeposit(deposit, user, `Depósito via Mercado Pago PIX (Ref: ${deposit.mpPaymentId})`);
  console.log(`[PAYMENT_APPROVED] Deposit ${deposit.id} status set to approved.`);

  // Record Webhook Event as processed (idempotency token)
  const webhookEvent: WebhookEvent = {
    id: `ev-${crypto.randomBytes(8).toString('hex')}`,
    mpPaymentId: mpPaymentIdStr,
    eventType: 'payment.approved',
    processedAt: new Date().toISOString()
  };
  await WebhookEventRepository.create(webhookEvent);

  res.json({ success: true, message: 'Deposit successfully approved and credited.' });
});

// 6. Status Polling Endpoint
app.get('/api/deposit/status/:id', async (req, res) => {
  const deposit = await DepositRepository.findById(req.params.id);
  if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado.' });
  res.json({
    status: deposit.status,
    amount: deposit.amount,
    userConfirmedAt: deposit.userConfirmedAt || null
  });
});

// 7. Authenticated Deposit History
app.get('/api/deposits', requireAuth, async (req: AuthenticatedRequest, res) => {
  const list = await DepositRepository.findAllByUserId(req.userId!);
  const formatted = list.map(d => ({
    amount: d.amount,
    status: d.status,
    createdAt: d.createdAt,
    approvedAt: d.approvedAt || null
  }));
  res.json(formatted);
});

// --- REST OF GAMES CHESS ARENA ENDPOINTS (Refactored to async Repository layer) ---

// Create Checkers Game Room
app.post('/api/games/create', async (req, res) => {
  const { hostId, betAmount, isBotGame, botGamesPlayed, isPrivate } = req.body;
  const parsedBet = parseFloat(betAmount);
  if (!hostId || isNaN(parsedBet) || parsedBet < 0) {
    return res.status(400).json({ error: 'Parâmetros de aposta inválidos' });
  }

  const hostPlayer = await getOrCreateUser(hostId);
  if (isBotGame && typeof botGamesPlayed === 'number') {
    hostPlayer.botGamesPlayed = botGamesPlayed;
  }
  const hostTotalPlayable = hostPlayer.balance + (hostPlayer.bonusBalance || 0);
  if (hostTotalPlayable < parsedBet) {
    return res.status(400).json({ error: 'Seu saldo é insuficiente para criar esta aposta!' });
  }

  const gameId = `dama-game-${crypto.randomBytes(4).toString('hex')}`;
  const { pieces, grid } = initializeBoard();

  const platformFee = parseFloat((parsedBet * 2 * 0.10).toFixed(2));
  const prizePool = parseFloat((parsedBet * 2 * 0.90).toFixed(2));

  const randomName = fictitiousNames[Math.floor(Math.random() * fictitiousNames.length)];
  const randomSeed = crypto.randomBytes(4).toString('hex');
  const botPlayer: Player | null = isBotGame ? {
    id: 'bot-dama',
    name: randomName,
    avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${randomSeed}`,
    balance: 1000.0,
  } : null;

  if (isBotGame) {
    await deductBetWithBonus(hostPlayer, parsedBet, gameId);
    
    const txH: Transaction = {
      id: `tx-lock-${crypto.randomBytes(4).toString('hex')}`,
      userId: hostId,
      type: 'bet_lock',
      amount: parsedBet,
      description: `Aposta de R$ ${parsedBet.toFixed(2)} debitada da carteira (Dama Bet ID: ${gameId})`,
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(txH);
  }

  const newGame: Game = {
    id: gameId,
    isBotGame: !!isBotGame,
    isPrivate: !!isPrivate,
    betAmount: parsedBet,
    platformFee,
    prizePool,
    status: isBotGame ? 'active' : 'waiting_for_challenger',
    host: toSafeUser(hostPlayer),
    guest: botPlayer,
    hostReady: !!isBotGame,
    guestReady: !!isBotGame,
    board: { grid },
    pieces,
    turn: 'red',
    winnerId: null,
    drawVotedBy: [],
    createdAt: new Date().toISOString(),
    startedAt: isBotGame ? new Date().toISOString() : undefined,
    log: isBotGame 
      ? (() => {
          const currentCount = hostPlayer.botGamesPlayed || 0;
          let diffName = "Fácil 🟢 (Treino 1/3)";
          if (currentCount === 1) diffName = "Moderado 🟡 (Desafio 2/3)";
          else if (currentCount >= 2) diffName = "Impossível 🔴 (Final 3/3)";
          return [`Mesa de Duelo configurada! Oponente: ${botPlayer?.name} (${diffName}). Aposta de R$ ${parsedBet.toFixed(2)} travada sob custódia segura.`];
        })()
      : ['Mesa de damas criada. Aguardando desafiante...'],
    chat: [],
    mustJumpPieceIdByTurn: null
  };

  await gameKvSet(newGame);
  broadcastLobby();

  res.json({ success: true, game: newGame });
});

// Join checking Game
app.post('/api/games/join', async (req, res) => {
  const { gameId, guestId } = req.body;
  if (!gameId || !guestId) return res.status(400).json({ error: 'Dados em falta para ingressar' });

  const game = await gameKvGet(gameId);
  if (!game) return res.status(404).json({ error: 'Partida não encontrada' });

  if (game.host.id === guestId) return res.status(400).json({ error: 'Você não pode desafiar a si mesmo!' });
  if (game.status !== 'waiting_for_challenger') return res.status(400).json({ error: 'Esta mesa já está ocupada ou finalizada' });

  const guestPlayer = await getOrCreateUser(guestId);
  const guestTotalPlayable = guestPlayer.balance + (guestPlayer.bonusBalance || 0);
  if (guestTotalPlayable < game.betAmount) {
    return res.status(400).json({ error: 'Saldo insuficiente para cobrir o valor da aposta!' });
  }

  game.guest = toSafeUser(guestPlayer);
  game.status = 'bet_confirmation';
  game.log.push(`${guestPlayer.name} entrou na mesa! Requer confirmação de fundos.`);

  await gameKvSet(game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Confirm Bet / Lock Deposits
app.post(['/api/games/:gameId/bet-confirm', '/api/games/confirm-bet'], async (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId } = req.body;

  if (!gameId || !userId) return res.status(400).json({ error: 'Dados insuficientes' });

  const game = await gameKvGet(gameId);
  if (!game) return res.status(404).json({ error: 'Jogo não encontrado' });

  const isHost = game.host.id === userId;
  const isGuest = game.guest?.id === userId;

  if (!isHost && !isGuest) return res.status(403).json({ error: 'Jogador não autorizado' });

  const user = await getOrCreateUser(userId);
  const totalPlayable = user.balance + (user.bonusBalance || 0);
  if (totalPlayable < game.betAmount) {
    return res.status(400).json({ error: 'Saldo de carteira insuficiente para apostar' });
  }

  if (isHost) {
    game.hostReady = true;
    game.log.push(`Anfitrião ${game.host.name} está pronto para o duelo!`);
    if (game.isBotGame) {
      game.guestReady = true;
      game.log.push(`O desafiante ${game.guest!.name} confirmou os termos!`);
    }
  } else {
    game.guestReady = true;
    game.log.push(`Desafiante ${game.guest!.name} está pronto para o duelo!`);
  }

  if (game.hostReady && game.guestReady) {
    const hUser = await getOrCreateUser(game.host.id);
    await deductBetWithBonus(hUser, game.betAmount, game.id);

    const txH: Transaction = {
      id: `tx-lock-${crypto.randomBytes(4).toString('hex')}`,
      userId: game.host.id,
      type: 'bet_lock',
      amount: game.betAmount,
      description: `Aposta de R$ ${game.betAmount.toFixed(2)} debitada da carteira (Dama Bet ID: ${game.id})`,
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(txH);

    if (game.guest!.id !== 'bot-dama') {
      const gUser = await getOrCreateUser(game.guest!.id);
      await deductBetWithBonus(gUser, game.betAmount, game.id);

      const txG: Transaction = {
        id: `tx-lock-${crypto.randomBytes(4).toString('hex')}`,
        userId: game.guest!.id,
        type: 'bet_lock',
        amount: game.betAmount,
        description: `Aposta de R$ ${game.betAmount.toFixed(2)} debitada da carteira (Dama Bet ID: ${game.id})`,
        createdAt: new Date().toISOString()
      };
      await TransactionRepository.create(txG);
    }

    game.status = 'active';
    game.startedAt = new Date().toISOString();
    game.log.push(`💸 Aposta total de R$ ${(game.betAmount * 2).toFixed(2)} fechada! Que comece o jogo!`);
  }

  await gameKvSet(game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Resign
app.post(['/api/games/:gameId/resign', '/api/games/resign'], async (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId } = req.body;

  if (!gameId || !userId) return res.status(400).json({ error: 'Dados insuficientes' });

  const game = await gameKvGet(gameId);
  if (!game || game.status !== 'active') return res.status(404).json({ error: 'Partida em andamento não ativa' });

  const isHost = game.host.id === userId;
  const isGuest = game.guest?.id === userId;

  if (!isHost && !isGuest) return res.status(403).json({ error: 'Usuário não faz parte do jogo' });

  const resignerName = isHost ? game.host.name : game.guest!.name;
  game.log.push(`${resignerName} desistiu da disputa!`);

  const winnerUserId = isHost ? game.guest!.id : game.host.id;
  const winnerEntity = isHost ? game.guest! : game.host;

  game.winnerId = winnerUserId;
  game.status = 'finished';

  game.log.push(`Vitória por desistência! ${winnerEntity.name} levou o prêmio de R$ ${game.prizePool.toFixed(2)}.`);

  if (winnerUserId !== 'bot-dama') {
    const luckyWinner = await getOrCreateUser(winnerUserId);
    luckyWinner.balance += game.prizePool;
    await UserRepository.save(luckyWinner);
    recordWin(winnerEntity.name, game.prizePool);

    const txPayout: Transaction = {
      id: `tx-payout-${crypto.randomBytes(4).toString('hex')}`,
      userId: winnerUserId,
      type: 'win_payout',
      amount: game.prizePool,
      description: `Pagamento recebido: Vitória no jogo de Damas (ID: ${game.id})`,
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(txPayout);
  }

  await gameKvSet(game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Consensual Draw Vote
app.post(['/api/games/:gameId/draw-vote', '/api/games/draw'], async (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId } = req.body;

  if (!gameId || !userId) return res.status(400).json({ error: 'Dados insuficientes' });

  const game = await gameKvGet(gameId);
  if (!game || game.status !== 'active') return res.status(404).json({ error: 'Jogo inválido ou não ativo' });

  if (game.host.id !== userId && game.guest?.id !== userId) return res.status(403).json({ error: 'Não autorizado' });

  if (!game.drawVotedBy.includes(userId)) {
    game.drawVotedBy.push(userId);
    const votingUserName = game.host.id === userId ? game.host.name : game.guest!.name;
    game.log.push(`${votingUserName} propôs um empate consensual.`);
  }

  if (game.drawVotedBy.length === 2) {
    game.status = 'finished';
    game.winnerId = null;
    game.log.push(`🤝 Duelo encerrado em EMPATE consensual! Apostas de R$ ${game.betAmount.toFixed(2)} estornadas.`);

    const hUser = await getOrCreateUser(game.host.id);
    await refundBetWithBonus(hUser, game.betAmount);

    const txRefundH: Transaction = {
      id: `tx-ref-${crypto.randomBytes(4).toString('hex')}`,
      userId: game.host.id,
      type: 'draw_refund',
      amount: game.betAmount,
      description: `Estorno integral de aposta por empate em damas (ID: ${game.id})`,
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(txRefundH);

    if (game.guest && game.guest.id !== 'bot-dama') {
      const gUser = await getOrCreateUser(game.guest!.id);
      await refundBetWithBonus(gUser, game.betAmount);

      const txRefundG: Transaction = {
        id: `tx-ref-${crypto.randomBytes(4).toString('hex')}`,
        userId: game.guest!.id,
        type: 'draw_refund',
        amount: game.betAmount,
        description: `Estorno integral de aposta por empate em damas (ID: ${game.id})`,
        createdAt: new Date().toISOString()
      };
      await TransactionRepository.create(txRefundG);
    }
  }

  await gameKvSet(game);
  broadcastGame(gameId);

  res.json({ success: true, game });
});

// Cancel Room
app.post(['/api/games/:gameId/cancel', '/api/games/cancel'], async (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const userId = (req.body.userId || req.body.hostId) as string;

  if (!gameId || !userId) return res.status(400).json({ error: 'Dados insuficientes' });

  const game = await gameKvGet(gameId);
  if (!game) return res.status(404).json({ error: 'Partida não encontrada' });

  if (game.host.id !== userId) return res.status(403).json({ error: 'Apenas o anfitrião pode cancelar' });
  if (game.status !== 'waiting_for_challenger' && game.status !== 'bet_confirmation') {
    return res.status(400).json({ error: 'Não é possível cancelar uma partida ativa' });
  }

  game.status = 'cancelled';
  game.log.push('Partida cancelada pelo anfitrião.');

  await gameKvSet(game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// In-game Chat Message
app.post(['/api/games/:gameId/chat', '/api/games/chat'], async (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const userId = (req.body.userId || req.body.senderId) as string;
  const { text } = req.body;

  if (!gameId || !userId || !text) return res.status(400).json({ error: 'Dados insuficientes' });

  const game = await gameKvGet(gameId);
  if (!game) return res.status(404).json({ error: 'Partida não encontrada' });

  const sender = game.host.id === userId ? game.host : game.guest?.id === userId ? game.guest : null;
  if (!sender) return res.status(403).json({ error: 'Você não faz parte desta partida' });

  const message: Message = {
    id: `msg-${crypto.randomBytes(4).toString('hex')}`,
    senderId: userId,
    senderName: sender.name,
    text,
    timestamp: new Date().toISOString()
  };

  game.chat.push(message);
  await gameKvSet(game);
  broadcastGame(gameId);

  res.json({ success: true });
});

// Checkers Move Submissions
app.post(['/api/games/:gameId/move', '/api/games/move'], async (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId, move } = req.body;

  if (!gameId || !userId || !move) return res.status(400).json({ error: 'Dados insuficientes' });

  const game = await gameKvGet(gameId);
  if (!game) return res.status(404).json({ error: 'Partida não encontrada' });
  if (game.status !== 'active') return res.status(400).json({ error: 'Mesa não está em estado de jogo ativo' });

  const activeTurnColor = game.turn;
  const expectedPlayerId = activeTurnColor === 'red' ? game.host.id : game.guest?.id;

  if (expectedPlayerId !== userId) return res.status(400).json({ error: 'Não é seu turno!' });

  if (game.mustJumpPieceIdByTurn) {
    const movingPiece = game.board.grid[move.from.row][move.from.col];
    if (!movingPiece || movingPiece.id !== game.mustJumpPieceIdByTurn) {
      return res.status(400).json({ error: 'Movimento inválido! Continue capturando com a mesma peça.' });
    }
  }

  const validMoves = getValidMoves(game.board.grid, activeTurnColor, game.mustJumpPieceIdByTurn);
  const matchedMove = validMoves.find(
    vm => vm.from.row === move.from.row && vm.from.col === move.from.col && vm.to.row === move.to.row && vm.to.col === move.to.col
  );

  if (!matchedMove) return res.status(400).json({ error: 'Movimento ilegal!' });

  const { grid: nextGrid, promotedToKing, nextSpecialMustJumpPieceId } = executeMove(game.board.grid, matchedMove);
  game.board.grid = nextGrid;

  const updatedPieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = nextGrid[r][c];
      if (p) updatedPieces.push(p);
    }
  }
  game.pieces = updatedPieces;

  const pieceName = matchedMove.isJump ? 'capturou peça' : 'moveu para';
  const playerLabel = activeTurnColor === 'red' ? game.host.name : game.guest!.name;
  const promotionMsg = promotedToKing ? ' 👑 PROMOVIDO A DAMA!' : '';
  game.log.push(`${playerLabel} ${pieceName} [${matchedMove.to.row + 1},${matchedMove.to.col + 1}]${promotionMsg}`);

  if (nextSpecialMustJumpPieceId) {
    game.mustJumpPieceIdByTurn = nextSpecialMustJumpPieceId;
  } else {
    game.mustJumpPieceIdByTurn = null;
    game.turn = game.turn === 'red' ? 'black' : 'red';
  }

  const gameOverStatus = checkGameOver(game.board.grid, game.turn);
  if (gameOverStatus.isGameOver) {
    game.status = 'finished';
    await finalizeBotGameCount(game);
    if (gameOverStatus.winner) {
      const winnerId = gameOverStatus.winner === 'red' ? game.host.id : game.guest!.id;
      const winnerName = gameOverStatus.winner === 'red' ? game.host.name : game.guest!.name;
      game.winnerId = winnerId;
      game.log.push(`👑 FIM DE JOGO: ${winnerName} venceu!`);

      if (winnerId !== 'bot-dama') {
        game.log.push(`🎉 Prêmio de R$ ${game.prizePool.toFixed(2)} creditado.`);
        const luckyWinner = await getOrCreateUser(winnerId);
        luckyWinner.balance += game.prizePool;
        await UserRepository.save(luckyWinner);
        recordWin(winnerName, game.prizePool);

        const txPayout: Transaction = {
          id: `tx-win-${crypto.randomBytes(4).toString('hex')}`,
          userId: winnerId,
          type: 'win_payout',
          amount: game.prizePool,
          description: `Prêmio recebido: Vitória no Dama Bet (ID: ${game.id})`,
          createdAt: new Date().toISOString()
        };
        await TransactionRepository.create(txPayout);
      }
    }
  }

  await gameKvSet(game);
  broadcastGame(gameId);
  broadcastLobby();

  if (game.status === 'active' && game.isBotGame && game.turn === 'black') {
    runBotTurnIfActive(gameId).catch(err => console.error('Bot turn failed:', err));
  }

  res.json({ success: true, game });
});

// SSE Game subscription streams
app.get(['/api/games/:gameId/stream', '/api/games/stream'], async (req, res) => {
  const gameId = (req.params.gameId || req.query.gameId) as string;
  if (!gameId) return res.status(400).send('Falta gameId');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const connId = `conn-${crypto.randomBytes(4).toString('hex')}`;
  const connection: Connection = { id: connId, res };

  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  const conns = gameConnections.get(gameId) || [];
  gameConnections.set(gameId, [...conns, connection]);

  const game = await gameKvGet(gameId);
  if (game) res.write(`data: ${JSON.stringify(game)}\n\n`);

  req.on('close', () => {
    clearInterval(keepAlive);
    const list = gameConnections.get(gameId) || [];
    gameConnections.set(gameId, list.filter(c => c.id !== connId));
  });
});

// SSE Lobby Stream
app.get('/api/lobby/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const connId = `conn-${crypto.randomBytes(4).toString('hex')}`;
  const connection: Connection = { id: connId, res };

  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  lobbyConnections.push(connection);

  const lobbyGames = Array.from(games.values()).filter(
    g => (g.status === 'waiting_for_challenger' || g.status === 'bet_confirmation') && !g.isPrivate
  );
  res.write(`data: ${JSON.stringify(lobbyGames)}\n\n`);

  req.on('close', () => {
    clearInterval(keepAlive);
    const idx = lobbyConnections.findIndex(c => c.id === connId);
    if (idx !== -1) lobbyConnections.splice(idx, 1);
  });
});

// Lobby general stats
app.get('/api/stats', (req, res) => {
  const activeMatches = Array.from(games.values()).filter(g => g.status === 'active').length;
  const onlinePlayers = 800 + Math.floor(Math.random() * 500);
  res.json({ onlinePlayers, activeMatches });
});

// Weekly Ranking
app.get('/api/ranking/weekly', (req, res) => {
  const list = fictitiousNames.map((name, idx) => ({
    id: `fake-${idx}`,
    name,
    total: Math.floor(Math.random() * 1200) + 200
  })).sort((a, b) => b.total - a.total);
  res.json({ ranking: list });
});

// Last Winners feed
app.get('/api/ranking/last-winners', (req, res) => {
  res.json({ winners: lastWinners.slice(0, 20) });
});

// Optimistic status polling fallback
app.get('/api/games/state', async (req, res) => {
  const gameId = req.query.gameId as string;
  if (!gameId) return res.status(400).json({ error: 'Falta gameId' });
  const game = await gameKvGet(gameId);
  if (!game) return res.status(404).json({ error: 'Jogo não encontrado' });
  res.json({ game });
});

// Database boostrapping sequence (Migrating legacy users-db.json)
async function bootstrapDatabase() {
  try {
    const oldDbPath = path.join(process.cwd(), 'users-db.json');
    const backupDbPath = path.join(process.cwd(), '.data', 'users-db.json');
    const sourcePath = fs.existsSync(oldDbPath) ? oldDbPath : (fs.existsSync(backupDbPath) ? backupDbPath : null);

    if (sourcePath) {
      console.log(`[BOOTSTRAP] Migrating data from legacy file: ${sourcePath}`);
      const raw = fs.readFileSync(sourcePath, 'utf-8');
      const dbPayload = JSON.parse(raw);

      if (dbPayload.users) {
        for (const [userId, user] of dbPayload.users) {
          const existing = await UserRepository.findById(userId);
          if (!existing) {
            console.log(`[BOOTSTRAP] Migrating user: ${user.name}`);
            await UserRepository.save({
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              balance: user.balance,
              email: user.email,
              botGamesPlayed: user.botGamesPlayed || 0,
              bonusBalance: user.bonusBalance || 0,
              rolloverRequired: user.rolloverRequired || 0,
              rolloverWagered: user.rolloverWagered || 0,
              passwordHash: user.passwordHash,
              passwordSalt: user.passwordSalt
            });
          }
        }
      }

      if (dbPayload.transactions) {
        for (const [userId, txList] of dbPayload.transactions) {
          const existingTxs = await TransactionRepository.findAllByUserId(userId);
          if (existingTxs.length === 0) {
            console.log(`[BOOTSTRAP] Migrating transactions for user: ${userId}`);
            for (const tx of txList) {
              await TransactionRepository.create({
                id: tx.id,
                userId: userId,
                type: tx.type,
                amount: tx.amount,
                description: tx.description,
                createdAt: tx.timestamp || new Date().toISOString()
              });
            }
          }
        }
      }

      try {
        fs.renameSync(sourcePath, sourcePath + '.migrated');
        console.log('[BOOTSTRAP] Legacy database file renamed to .migrated');
      } catch (err) {
        console.error('[BOOTSTRAP] Error renaming database file:', err);
      }
    }
  } catch (err) {
    console.error('[BOOTSTRAP] Error during legacy migration:', err);
  }
}

// Background cleaner logic for expired deposits
setInterval(async () => {
  try {
    const expiredList = await DepositRepository.getExpiredPendingDeposits();
    for (const dep of expiredList) {
      console.log(`[PAYMENT_EXPIRATION] Deposit ${dep.id} (MP payment ${dep.mpPaymentId}) has expired.`);
      await DepositRepository.updateStatus(dep.id, 'expired');
    }
  } catch (err) {
    console.error('Error running expiration cleaner:', err);
  }
}, 60000);

// Global Error Handler
app.use((err: any, req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err?.stack || err?.message || err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Boot backend server
async function seedAdminUser() {
  const adminId = 'user_admin';
  const adminUsername = 'admin';
  const adminEmail = 'admin@gmail.com';

  try {
    // SECURITY: only create the admin account on first boot. Never overwrite an
    // existing admin's password on every restart — that let anyone who reads this
    // source file's git history log back in even after the password was rotated.
    const existing = await UserRepository.findById(adminId);
    if (existing) {
      console.log('[BOOTSTRAP] Admin user already exists. Leaving credentials untouched.');
      return;
    }

    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    if (!process.env.ADMIN_PASSWORD) {
      console.warn(`[BOOTSTRAP] ADMIN_PASSWORD not set. Generated one-time admin password: ${adminPassword}`);
      console.warn('[BOOTSTRAP] Save this password now — it will not be shown again. Set ADMIN_PASSWORD to control it explicitly.');
    }

    console.log('[BOOTSTRAP] Seeding admin user...');
    const { hash, salt } = hashPassword(adminPassword);
    const adminUser: Player = {
      id: adminId,
      name: adminUsername,
      email: adminEmail,
      passwordHash: hash,
      passwordSalt: salt,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${adminId}`,
      balance: 0,
      botGamesPlayed: 0,
      bonusBalance: 0,
      rolloverRequired: 0,
      rolloverWagered: 0
    };
    await UserRepository.save(adminUser);
    console.log('[BOOTSTRAP] Admin user successfully seeded.');
  } catch (err) {
    console.error('[BOOTSTRAP] Failed to seed admin user:', err);
  }
}

async function startServer() {
  await bootstrapDatabase();
  await seedAdminUser();
  app.listen(PORT, () => {
    console.log(`Dama Bet API Backend running on port ${PORT}`);
  });
}

startServer();
export default app;
