import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import cors from 'cors';
import { initializeBoard, getValidMoves, executeMove, checkGameOver, selectSmartBotMove } from './utils/checkers.js';
import { Game, Player, Message, Transaction, GameStatus, PlayerColor, MoveCoordinates, Piece, Deposit, WebhookEvent } from './types.js';
import { UserRepository, DepositRepository, TransactionRepository, WebhookEventRepository } from './db/repositories.js';
import { requireAuth, AuthenticatedRequest, signToken, verifyToken } from './utils/auth.js';
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

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup matching FRONTEND_URL
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
  credentials: true
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
    g => g.status === 'waiting_for_challenger' || g.status === 'bet_confirmation'
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
      balance: 100.0,
      botGamesPlayed: 0,
      bonusBalance: 0,
      rolloverRequired: 0,
      rolloverWagered: 0
    };
    await UserRepository.save(user);

    const welcomeTx: Transaction = {
      id: `tx-welcome-${crypto.randomBytes(4).toString('hex')}`,
      userId: id,
      type: 'deposit',
      amount: 100.0,
      description: 'Saldo de boas-vindas simulado (100% seguro)',
      createdAt: new Date().toISOString()
    };
    await TransactionRepository.create(welcomeTx);
  } else if (customName && customName !== user.name) {
    user.name = customName;
    await UserRepository.save(user);
  }
  return user;
}

// --- Mercado Pago Client initialization ---
const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
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
    balance: 100.0,
    botGamesPlayed: 0,
    bonusBalance: 0,
    rolloverRequired: 0,
    rolloverWagered: 0
  };

  await UserRepository.save(newUser);

  const welcomeTx: Transaction = {
    id: `tx-welcome-${crypto.randomBytes(4).toString('hex')}`,
    userId: id,
    type: 'deposit',
    amount: 100.0,
    description: 'Saldo de boas-vindas para treinar no DamaBet',
    createdAt: new Date().toISOString()
  };
  await TransactionRepository.create(welcomeTx);

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
      rolloverWagered: newUser.rolloverWagered
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
      rolloverWagered: foundUser.rolloverWagered
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
      rolloverWagered: user.rolloverWagered
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
  res.json({ user, transactions: txHistory });
});

// Name update
app.post('/api/users/update-name', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Dados insuficientes' });
  const user = await UserRepository.findById(req.userId!);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  user.name = sanitize(name);
  await UserRepository.save(user);
  res.json({ success: true, user });
});

// Dev Simulation Deposit
app.post('/api/users/deposit', async (req, res) => {
  const { id, amount } = req.body;
  const numAmount = parseFloat(amount);
  if (!id || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Quantia de depósito inválida' });
  }

  // Security gate: block simulated deposits in production unless allowed
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SIMULATED_DEPOSITS !== 'true') {
    return res.status(403).json({ error: 'Depósitos simulados estão desativados em produção. Use o fluxo Mercado Pago PIX.' });
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
  res.json({ user, transactions: txHistory });
});

// Withdrawal Request (to be paid manually by administrator)
app.post('/api/users/withdraw', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { amount, pixKey } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Quantia de saque inválida' });
  }

  const user = await UserRepository.findById(req.userId!);
  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }

  const rolloverLeft = (user.rolloverRequired || 0) - (user.rolloverWagered || 0);
  if (rolloverLeft > 0) {
    return res.status(400).json({
      error: `Saque bloqueado! Você possui bônus ativo da Copa do Mundo 2026. Complete o rollover restante de R$ ${rolloverLeft.toFixed(2)} jogando damas para autorizar saques.`
    });
  }

  if (user.balance < numAmount) {
    return res.status(400).json({ error: 'Saldo de carteira insuficiente' });
  }

  user.balance -= numAmount;
  await UserRepository.save(user);

  const destinationPixKey = pixKey ? sanitize(pixKey) : user.email || 'Não informada';

  const tx: Transaction = {
    id: `tx-with-${crypto.randomBytes(4).toString('hex')}`,
    userId: user.id,
    type: 'withdrawal',
    amount: numAmount,
    description: `Solicitação de retirada PIX registrada para a chave: ${destinationPixKey} (Valor: R$ ${numAmount.toFixed(2)}). O valor foi deduzido da carteira virtual e o administrador realizará a transferência manualmente.`,
    createdAt: new Date().toISOString()
  };
  await TransactionRepository.create(tx);

  const txHistory = await TransactionRepository.findAllByUserId(user.id);
  res.json({ user, transactions: txHistory });
});

// --- NEW MERCADO PAGO PIX ENDPOINTS ---

// 1. Create PIX Deposit
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
  const expirationMinutes = 30;
  const expirationDate = new Date(Date.now() + expirationMinutes * 60 * 1000);
  
  let paymentResponse;
  if (mpAccessToken) {
    try {
      console.log(`[DEPOSIT_CREATED] User ${user.name} (${user.id}) requested PIX of R$ ${numAmount}`);
      const mpResponse = await paymentClient.create({
        body: {
          transaction_amount: numAmount,
          description: `Depósito Dama Bet - ${user.name}`,
          payment_method_id: 'pix',
          payer: {
            email: user.email || 'jogador@damabet.com'
          },
          external_reference: depositId,
          notification_url: `${process.env.APP_URL || 'https://dama-bet.onrender.com'}/api/webhooks/mercadopago`,
          date_of_expiration: expirationDate.toISOString()
        }
      });
      paymentResponse = mpResponse;
    } catch (mpErr: any) {
      console.error('Error contacting Mercado Pago API:', mpErr?.message || mpErr);
      return res.status(500).json({ error: 'Falha ao gerar PIX com Mercado Pago. Tente mais tarde.' });
    }
  } else {
    // Fallback Mock for local development
    console.log('[DEPOSIT_CREATED] Mocking Mercado Pago PIX Creation (No ACCESS_TOKEN configured)');
    const mockId = Math.floor(100000000 + Math.random() * 900000000).toString();
    paymentResponse = {
      id: mockId,
      point_of_interaction: {
        transaction_data: {
          qr_code: `00020101021226830014br.gov.bcb.pix2561pix.example.com/qr/v2/mock-${mockId}5204000053039865405${numAmount.toFixed(2)}5802BR5915DAMA_BET_LTDA6009SAO_PAULO62070503***6304FC7D`,
          qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5gXhkAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUHBgYTFw03D***'
        }
      },
      transaction_amount: numAmount,
      status: 'pending'
    };
  }

  const mpPaymentId = String(paymentResponse.id);

  const newDeposit: Deposit = {
    id: depositId,
    userId: user.id,
    mpPaymentId: mpPaymentId,
    amount: numAmount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expirationAt: expirationDate.toISOString()
  };

  await DepositRepository.create(newDeposit);
  console.log(`[PIX_GENERATED] Deposit ${depositId} (MP ID: ${mpPaymentId}) created for R$ ${numAmount}. Expires at ${newDeposit.expirationAt}`);

  res.json({
    paymentId: depositId,
    qrCode: paymentResponse.point_of_interaction?.transaction_data?.qr_code,
    qrCodeBase64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64,
    amount: numAmount
  });
});

// 2. Mercado Pago Webhook
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

  // Update deposit to approved
  await DepositRepository.updateStatus(deposit.id, 'approved', new Date().toISOString());
  console.log(`[PAYMENT_APPROVED] Deposit ${deposit.id} status set to approved.`);

  // Calculate World Cup 2026 Promo rules
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

  // Write transactions
  const tx: Transaction = {
    id: `tx-mp-${deposit.mpPaymentId}`,
    userId: user.id,
    type: 'deposit',
    amount: deposit.amount,
    description: `Depósito via Mercado Pago PIX (Ref: ${deposit.mpPaymentId})`,
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

// 3. Status Polling Endpoint
app.get('/api/deposit/status/:id', async (req, res) => {
  const deposit = await DepositRepository.findById(req.params.id);
  if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado.' });
  res.json({
    status: deposit.status,
    amount: deposit.amount
  });
});

// 4. Authenticated Deposit History
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
  const { hostId, betAmount, isBotGame, botGamesPlayed } = req.body;
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
    betAmount: parsedBet,
    platformFee,
    prizePool,
    status: isBotGame ? 'active' : 'waiting_for_challenger',
    host: hostPlayer,
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

  game.guest = guestPlayer;
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
    g => g.status === 'waiting_for_challenger' || g.status === 'bet_confirmation'
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
async function startServer() {
  await bootstrapDatabase();
  app.listen(PORT, () => {
    console.log(`Dama Bet API Backend running on port ${PORT}`);
  });
}

startServer();
export default app;
