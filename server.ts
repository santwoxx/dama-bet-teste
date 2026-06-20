import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { initializeBoard, getValidMoves, executeMove, checkGameOver } from './src/utils/checkers';
import { Game, Player, Message, Transaction, GameStatus, PlayerColor, MoveCoordinates, Piece } from './src/types';

// ─── Security Utilities ───────────────────────────────────────────────
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

// Session management (tokens in memory)
const sessions = new Map<string, { userId: string; createdAt: number }>();
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, createdAt: Date.now() });
  // Clean old tokens periodically
  if (sessions.size > 1000) {
    const now = Date.now();
    for (const [t, s] of sessions) {
      if (now - s.createdAt > TOKEN_EXPIRY_MS) sessions.delete(t);
    }
  }
  return token;
}

function validateToken(token: string): string | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > TOKEN_EXPIRY_MS) {
    sessions.delete(token);
    return null;
  }
  return session.userId;
}

// Rate limiting (simple in-memory per IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max 20 requests per window per IP

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

// Sanitize string input
function sanitize(val: string): string {
  return val.replace(/[<>&"']/g, '').trim();
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Multi-player State Managers (Server is source of truth)
const users = new Map<string, Player>();
const transactions = new Map<string, Transaction[]>();
const games = new Map<string, Game>();

// ─── Win Tracking for Ranking & Last Winners ─────────────────────────
interface WinRecord {
  playerName: string;
  playerId: string;
  amount: number;
  timestamp: string;
}

interface LastWinnerEntry {
  playerName: string;
  amount: number;
  timestamp: string;
}

const winRecords: WinRecord[] = [];
const lastWinners: LastWinnerEntry[] = [];

const fictitiousNames = [
  'Ruan2020', 'Lucas77', 'MatheusBR', 'PedroX10', 'Kaio99', 'Gabriel22',
  'Felipe777', 'ViniciusX', 'JoãoPro', 'Rafa2025', 'Gustavo01', 'Henrique7',
  'LeoMaster', 'Kauan09', 'DaviX1', 'ArthurPlay', 'Biel777', 'ThiagoBR',
  'BrunoX', 'Caio2024', 'Kadabra30', 'Ruanzinho7', 'JPX99', 'Nando22',
  'AllanPro', 'Ana2020', 'JuliaX', 'Bia777', 'MariGamer', 'Luh22',
  'CarolBR', 'Bella99', 'AmandaX', 'DudaPlay', 'Isa2024', 'Vivi777',
  'NathyPro', 'Gabi01', 'LariX', 'Juhzinha', 'Sofia22', 'ManuBR',
  'Milena99', 'Cacau777', 'AlicePro', 'Shadow22', 'DarkX99', 'Frost777',
  'KillerBR', 'Hunter2020', 'Ruan_2020', 'ana_clara22', 'pedrin777',
  'joaovitor10', 'mari_souza', 'lucasbr99', 'julinha22', 'thiago_01',
  'gabix777', 'carolzinha10', 'ruan_2020', 'joaovitor22', 'lucas_br99',
  'matheus01', 'gabrielzinho7', 'kaio_10', 'rafabr2024', 'gustavo22',
  'henrique777', 'leozinho99', 'brunin01', 'arthur2025', 'thiagobr7',
  'caio_x10', 'davi_22', 'allan777', 'nando99', 'joaozinho10', 'vinibr2020',
  'julinha777', 'gabi_2024', 'duda777', 'biazinha99', 'lari22', 'amanda_01',
  'vivi2025', 'sofia777', 'alicezinha7', 'nathy99', 'milena22', 'manu_br',
  'isa2020', 'juhzinha10', 'bella777', 'cacau99', 'lais22', 'player_2020',
  'gamer777', 'xande22', 'betinho99', 'jpx777', 'darkzin10', 'shadow22',
  'frost99', 'hunter777', 'proplayer01', 'ruan.santos', 'joao_vitor10',
  'pedroh_22', 'lucasoliveira', 'matheuslima7', 'gabrielss01', 'kaioferreira',
  'rafaelbraga22', 'gustavohenriq', 'thiagocosta7', 'anaclara.ofc',
  'juliasouza22', 'marisilva01', 'carol.alves', 'gabioliveira', 'dudamartins7',
  'sofiasantos22', 'manuferreira', 'isacosta01', 'laiszinha777'
];

function recordWin(playerName: string, playerId: string, amount: number) {
  const record: WinRecord = {
    playerName, playerId, amount,
    timestamp: new Date().toISOString(),
  };
  winRecords.push(record);
  lastWinners.unshift({
    playerName, amount,
    timestamp: record.timestamp,
  });
  if (lastWinners.length > 50) lastWinners.length = 50;
}

// Database persistence — file (local) + Vercel KV (production)
const DB_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'users-db.json');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

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

function buildDbPayload() {
  return {
    users: Array.from(users.entries()),
    transactions: Array.from(transactions.entries()),
    sessions: Array.from(sessions.entries()),
  };
}

function restoreFromPayload(dbPayload: any) {
  if (dbPayload.users) {
    users.clear();
    for (const [key, val] of dbPayload.users) {
      users.set(key, val);
    }
  }
  if (dbPayload.transactions) {
    transactions.clear();
    for (const [key, val] of dbPayload.transactions) {
      transactions.set(key, val);
    }
  }
  if (dbPayload.sessions) {
    sessions.clear();
    for (const [key, val] of dbPayload.sessions) {
      sessions.set(key, val);
    }
  }
}

function saveDb() {
  try {
    const dbPayload = buildDbPayload();
    fs.writeFileSync(DB_FILE, JSON.stringify(dbPayload, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving JSON database:', err);
  }
  // Fire-and-forget KV sync
  if (kvAvailable) {
    const dbPayload = buildDbPayload();
    kvSet('db_payload', JSON.stringify(dbPayload));
  }
}

function loadDb() {
  // File fallback (local dev / Vercel without KV)
  try {
    let dbPath = DB_FILE;
    const oldPath = path.join(process.cwd(), 'users-db.json');
    if (!fs.existsSync(dbPath) && fs.existsSync(oldPath)) {
      dbPath = oldPath;
    }
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      restoreFromPayload(JSON.parse(raw));
      console.log(`Database loaded from ${dbPath}. Total users: ${users.size}, Txs: ${transactions.size}, Sessions: ${sessions.size}`);
    } else {
      console.log('No existing database file found. Fresh instance created.');
    }
  } catch (err) {
    console.error('Error loading JSON database:', err);
  }
  // Fire-and-forget KV load — overwrites file data with KV if available
  if (kvAvailable) {
    kvGet('db_payload').then((raw) => {
      if (raw) {
        const dbPayload = JSON.parse(raw);
        restoreFromPayload(dbPayload);
        console.log(`Database loaded from KV. Users: ${users.size}, Txs: ${transactions.size}, Sessions: ${sessions.size}`);
      }
    });
  }
}

// Load database immediately
loadDb();

// Periodic auto-save — only on non-serverless environments
if (!process.env.VERCEL) {
  setInterval(() => {
    saveDb();
  }, 3000);
}

// Active Stream Connections (SSE to keep games and lobby in real-time)
interface Connection {
  id: string;
  res: any;
}

const gameConnections = new Map<string, Connection[]>();
const lobbyConnections: Connection[] = [];

// Helper: Broadcast game state to connected players
function broadcastGame(gameId: string) {
  const game = games.get(gameId);
  if (!game) return;

  const conns = gameConnections.get(gameId) || [];
  const deadConns: string[] = [];

  for (const conn of conns) {
    try {
      conn.res.write(`data: ${JSON.stringify(game)}\n\n`);
    } catch (err) {
      deadConns.push(conn.id);
    }
  }

  // Clean closed connections
  if (deadConns.length > 0) {
    gameConnections.set(
      gameId,
      conns.filter((c) => !deadConns.includes(c.id))
    );
  }
}

// Helper: Broadcast lobby state to all active searchers
function broadcastLobby() {
  const lobbyGames = Array.from(games.values()).filter(
    (g) => g.status === 'waiting_for_challenger' || g.status === 'bet_confirmation'
  );

  const deadConns: string[] = [];
  for (const conn of lobbyConnections) {
    try {
      conn.res.write(`data: ${JSON.stringify(lobbyGames)}\n\n`);
    } catch (err) {
      deadConns.push(conn.id);
    }
  }

  // Clean closed connections
  if (deadConns.length > 0) {
    const nextList = lobbyConnections.filter((c) => !deadConns.includes(c.id));
    lobbyConnections.length = 0;
    lobbyConnections.push(...nextList);
  }
}

// Check if a specific cell would make the piece vulnerable to capture
function isCellVulnerable(grid: (Piece | null)[][], row: number, col: number, color: PlayerColor): boolean {
  const oppColor = color === 'red' ? 'black' : 'red';
  const directions = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 1 },
  ];

  for (const { dr, dc } of directions) {
    const oppRow = row + dr;
    const oppCol = col + dc;
    if (oppRow >= 0 && oppRow < 8 && oppCol >= 0 && oppCol < 8) {
      const p = grid[oppRow][oppCol];
      if (p && p.color === oppColor) {
        // Can they jump over us to row - dr, col - dc?
        const landRow = row - dr;
        const landCol = col - dc;
        if (landRow >= 0 && landRow < 8 && landCol >= 0 && landCol < 8) {
          if (grid[landRow][landCol] === null) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

// Helper: standard heuristic score for a single move
function evaluateOneStepMove(grid: (Piece | null)[][], color: PlayerColor, move: MoveCoordinates): number {
  let score = 0;

  // 1. If it's a jump, prioritize maximum captures
  if (move.isJump) {
    score += move.capturedPieceIds.length * 100;
  }

  const movingPiece = grid[move.from.row][move.from.col];
  if (movingPiece) {
    // 2. Promotion to King is very high priority
    if (!movingPiece.isKing && move.to.row === (color === 'red' ? 0 : 7)) {
      score += 80;
    }
    
    // 3. Prefer center squares
    const isCenter = move.to.row >= 2 && move.to.row <= 5 && move.to.col >= 2 && move.to.col <= 5;
    if (isCenter) {
      score += 5;
    }
    
    // 4. Avoid moving to vulnerable squares
    if (isCellVulnerable(grid, move.to.row, move.to.col, color)) {
      score -= 50;
    }

    // 5. Prefer protecting back row and back row stability
    if (movingPiece.row === (color === 'red' ? 7 : 0)) {
      score -= 10;
    }
  }

  return score;
}

// Deep static board evaluation for Minimax (forColor: bot color)
function evaluateBoard(grid: (Piece | null)[][], forColor: PlayerColor): number {
  let score = 0;
  const oppColor = forColor === 'red' ? 'black' : 'red';
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = grid[r][c];
      if (piece) {
        let pieceVal = 0;
        if (piece.isKing) {
          pieceVal += 35; // Kings are worth a lot
        } else {
          pieceVal += 10;
          // Encourage advancing forward (closer to promotion)
          const advancement = piece.color === 'black' ? r : (7 - r);
          pieceVal += advancement * 1.5;
        }

        // Prefer protecting edges
        if (c === 0 || c === 7) {
          pieceVal += 2;
        }

        if (piece.color === forColor) {
          score += pieceVal;
        } else {
          score -= pieceVal;
        }
      }
    }
  }
  return score;
}

// Minimax with Alpha-Beta Pruning
function minimax(
  grid: (Piece | null)[][],
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: boolean,
  color: PlayerColor,
  mustJumpId: string | null = null
): number {
  const gameOver = checkGameOver(grid, color);
  if (gameOver.isGameOver) {
    if (gameOver.winner === color) return 10000 + depth;
    if (gameOver.winner) return -10000 - depth;
    return 0;
  }

  if (depth === 0) {
    return evaluateBoard(grid, color);
  }

  const oppColor = color === 'red' ? 'black' : 'red';
  const activeColor = maximizingPlayer ? color : oppColor;
  const moves = getValidMoves(grid, activeColor, mustJumpId);

  if (moves.length === 0) {
    return maximizingPlayer ? -10000 + depth : 10000 - depth;
  }

  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const m of moves) {
      const { grid: nextGrid, nextSpecialMustJumpPieceId } = executeMove(grid, m);
      const nextMustJump = nextSpecialMustJumpPieceId;
      const nextMax = nextMustJump ? true : false;
      
      const evaluation = minimax(
        nextGrid,
        depth - 1,
        alpha,
        beta,
        nextMax,
        color,
        nextMustJump
      );
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      const { grid: nextGrid, nextSpecialMustJumpPieceId } = executeMove(grid, m);
      const nextMustJump = nextSpecialMustJumpPieceId;
      const nextMax = nextMustJump ? false : true;
      
      const evaluation = minimax(
        nextGrid,
        depth - 1,
        alpha,
        beta,
        nextMax,
        color,
        nextMustJump
      );
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Select move using depth-limited Minimax
function selectMinimaxMove(grid: (Piece | null)[][], color: PlayerColor, moves: MoveCoordinates[], depth: number): MoveCoordinates {
  if (moves.length === 1) return moves[0];
  
  let bestMove = moves[0];
  let bestScore = -Infinity;
  
  for (const m of moves) {
    const { grid: nextGrid, nextSpecialMustJumpPieceId } = executeMove(grid, m);
    const nextMustJump = nextSpecialMustJumpPieceId;
    const nextMax = nextMustJump ? true : false;
    
    const score = minimax(
      nextGrid,
      depth - 1,
      -Infinity,
      Infinity,
      nextMax,
      color,
      nextMustJump
    );
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  
  return bestMove;
}

// Heuristic selection of the best move with adaptive difficulty
function selectSmartBotMove(
  grid: (Piece | null)[][],
  color: PlayerColor,
  moves: MoveCoordinates[],
  botGamesPlayed: number
): MoveCoordinates {
  if (moves.length === 1) return moves[0];

  // LEVEL 1: VERY EASY & Commits Mistakes (botGamesPlayed === 0)
  if (botGamesPlayed === 0) {
    // 50% chance of playing random moves, or otherwise picking the lowest scored move
    if (Math.random() < 0.50) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    
    let worstMove = moves[0];
    let worstScore = Infinity;
    for (const move of moves) {
      const score = evaluateOneStepMove(grid, color, move);
      if (score < worstScore) {
        worstScore = score;
        worstMove = move;
      }
    }
    return worstMove;
  }

  // LEVEL 2: MODERATE (botGamesPlayed === 1)
  if (botGamesPlayed === 1) {
    // 15% random play, 85% standard greedy heuristic
    if (Math.random() < 0.15) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    
    let bestMove = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
      const score = evaluateOneStepMove(grid, color, move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  // LEVEL 3: IMPOSSIBLE (botGamesPlayed >= 2)
  // Deep search of 5 plies makes it mathematically unbeatable!
  return selectMinimaxMove(grid, color, moves, 5);
}

async function runBotTurnIfActive(gameId: string) {
  let game = games.get(gameId);
  if (!game || game.status !== 'active') return;

  while (game && game.isBotGame && game.turn === 'black' && game.status === 'active') {
    // 1. Simulated artificial thinking delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Fetch freshest copy
    game = games.get(gameId);
    if (!game || game.status !== 'active' || game.turn !== 'black') break;

    const validMoves = getValidMoves(game.board.grid, 'black', game.mustJumpPieceIdByTurn);
    if (validMoves.length === 0) {
      break;
    }

    const hostProfile = getOrCreateUser(game.host.id);
    const botGamesPlayed = hostProfile.botGamesPlayed || 0;
    const move = selectSmartBotMove(game.board.grid, 'black', validMoves, botGamesPlayed);

    // Apply move
    const { grid: nextGrid, promotedToKing, nextSpecialMustJumpPieceId } = executeMove(game.board.grid, move);

    game.board.grid = nextGrid;

    // flat pieces sync
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
      game.log.push(`⚠️ Jogada dupla! ${playerLabel} deve continuar a sequência de capturas!`);
    } else {
      game.mustJumpPieceIdByTurn = null;
      game.turn = 'red';
    }

    // Check game over
    const gameOverStatus = checkGameOver(game.board.grid, game.turn);
    if (gameOverStatus.isGameOver) {
      game.status = 'finished';
      finalizeBotGameCount(game);
      if (gameOverStatus.winner) {
        const winnerId = gameOverStatus.winner === 'red' ? game.host.id : 'bot-dama';
        const winnerName = gameOverStatus.winner === 'red' ? game.host.name : (game.guest?.name || 'Adversário');
        game.winnerId = winnerId;
        game.log.push(`👑 FIM DE JOGO: ${winnerName} venceu por bloqueio/aniquilação de peças inimigas!`);

        if (gameOverStatus.winner === 'red') {
          // Payout to human
          game.log.push(`🎉 Prêmio de R$ ${game.prizePool.toFixed(2)} transferido à carteira segura.`);
          const luckyWinner = getOrCreateUser(game.host.id);
          luckyWinner.balance += game.prizePool;
          users.set(game.host.id, luckyWinner);
          recordWin(winnerName, game.host.id, game.prizePool);

          const txPayout: Transaction = {
            id: `tx-win-${Math.random().toString(36).substring(2, 9)}`,
            type: 'win_payout',
            amount: game.prizePool,
            gameId: game.id,
            timestamp: new Date().toISOString(),
            description: `Prêmio recebido: Vitória contra ${game.guest?.name || 'Adversário'} (ID: ${game.id})`,
          };
          const walletW = transactions.get(game.host.id) || [];
          transactions.set(game.host.id, [txPayout, ...walletW]);
        } else {
          game.log.push(`Oponente ${game.guest?.name || 'Adversário'} levou a melhor nessa rodada! Tente novamente.`);
        }
      } else {
        game.winnerId = null;
        game.log.push('Partida encerrada em EMPATE por bloqueio absoluto.');
      }
    }

    // Bot quick reaction/provocation emoji feature
    const botSender = game.guest || { id: 'bot-dama', name: 'Smart Bot 🤖' };
    let reactionEmoji: string | null = null;
    if (gameOverStatus.isGameOver && gameOverStatus.winner === 'black') {
      reactionEmoji = '💪';
    } else if (promotedToKing) {
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
        id: `msg-bot-${Math.random().toString(36).substring(2, 9)}`,
        senderId: botSender.id,
        senderName: botSender.name,
        text: reactionEmoji,
        timestamp: new Date().toISOString()
      });
    }

    games.set(gameId, game);
    broadcastGame(gameId);
    broadcastLobby();
  }
}

// Finalize bot games played tracker
function finalizeBotGameCount(game: Game) {
  if (game.isBotGame) {
    const hostUser = getOrCreateUser(game.host.id);
    hostUser.botGamesPlayed = (hostUser.botGamesPlayed || 0) + 1;
    users.set(game.host.id, hostUser);
    saveDb();
  }
}

// Helper to deduct bet utilizing bonus balance first and updating rollover progress
function deductBetWithBonus(user: Player, betAmount: number, gameId: string) {
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

  // Track rollover wager progress
  if (user.rolloverRequired > 0) {
    user.rolloverWagered += betAmount;

    // Check if rollover target met
    if (user.rolloverWagered >= user.rolloverRequired) {
      // Liberated! Remaining bonus balance is turned completely into real cash playable/withdrawable balance
      const remainingBonus = user.bonusBalance;
      user.balance += remainingBonus;
      user.bonusBalance = 0;
      
      const unlockedTx: Transaction = {
        id: `tx-roll-win-${Math.random().toString(36).substring(2, 9)}`,
        type: 'win_payout',
        amount: remainingBonus,
        timestamp: new Date().toISOString(),
        description: `🏆 BONUSAZO DA COPA DO MUNDO LIBERADO! Rollover de R$ ${user.rolloverRequired.toFixed(2)} cumprido com sucesso!`,
      };

      const currentTxs = transactions.get(user.id) || [];
      transactions.set(user.id, [unlockedTx, ...currentTxs]);
      
      user.rolloverRequired = 0;
      user.rolloverWagered = 0;
    }
  }
}

// Helper to refund bets under cancels or consensual draws safely back to balance
// For precision, refund back to balance, and deduct from rollover progress to prevent exploitation loops
function refundBetWithBonus(user: Player, betAmount: number) {
  user.balance += betAmount;
  if (user.rolloverRequired && user.rolloverRequired > 0) {
    user.rolloverWagered = Math.max(0, (user.rolloverWagered || 0) - betAmount);
  }
}

// Check if a game has timed out (10 minutes = 600,000 ms) and resolve in its current state
function checkGameTimeoutAndResolve(gameId: string): boolean {
  const game = games.get(gameId);
  if (!game || game.status !== 'active' || !game.startedAt) return false;

  const startedTime = new Date(game.startedAt).getTime();
  const now = Date.now();
  const elapsedMs = now - startedTime;

  // 10 minutes = 600,000 milliseconds
  if (elapsedMs >= 600000) {
    // Game timed out! Force conclusion.
    game.status = 'finished';
    finalizeBotGameCount(game);

    // Count pieces to determine winner
    let redCount = 0;
    let blackCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = game.board.grid[r][c];
        if (p) {
          if (p.color === 'red') redCount++;
          else if (p.color === 'black') blackCount++;
        }
      }
    }

    game.log.push(`⏱️ TEMPO LIMITE EXCEDIDO (10 minutos)! Partida encerrada de imediato.`);
    game.log.push(`Placar final de peças: Vermelhas (Você): ${redCount} vs Pretas (Adversário): ${blackCount}`);

    let winnerColor: 'red' | 'black' | 'draw' = 'draw';
    if (redCount > blackCount) {
      winnerColor = 'red';
    } else if (blackCount > redCount) {
      winnerColor = 'black';
    }

    if (winnerColor === 'red') {
      const winnerId = game.host.id;
      const winnerName = game.host.name;
      game.winnerId = winnerId;
      game.log.push(`👑 VENCEDOR DECLARADO por vantagem de peças: ${winnerName}!`);
      game.log.push(`🎉 Prêmio de R$ ${game.prizePool.toFixed(2)} transferido à carteira segura.`);

      // Award funds
      const luckyWinner = getOrCreateUser(winnerId);
      luckyWinner.balance += game.prizePool;
      users.set(winnerId, luckyWinner);
      recordWin(winnerName, winnerId, game.prizePool);

      const txPayout: Transaction = {
        id: `tx-win-timed-${Math.random().toString(36).substring(2, 9)}`,
        type: 'win_payout',
        amount: game.prizePool,
        gameId: game.id,
        timestamp: new Date().toISOString(),
        description: `Prêmio recebido: Vitória por Vantagem de Peças (ID: ${game.id})`,
      };
      const walletW = transactions.get(winnerId) || [];
      transactions.set(winnerId, [txPayout, ...walletW]);
    } else if (winnerColor === 'black') {
      const winnerId = game.guest ? game.guest.id : 'bot-dama';
      const winnerName = game.guest ? game.guest.name : 'Adversário';
      game.winnerId = winnerId;
      game.log.push(`👑 VENCEDOR DECLARADO por vantagem de peças: ${winnerName}!`);

      if (winnerId !== 'bot-dama' && game.guest) {
        // Human guest wins other player
        game.log.push(`🎉 Prêmio de R$ ${game.prizePool.toFixed(2)} transferido à carteira segura.`);
        const luckyWinner = getOrCreateUser(winnerId);
        luckyWinner.balance += game.prizePool;
        users.set(winnerId, luckyWinner);
        recordWin(winnerName, winnerId, game.prizePool);

        const txPayout: Transaction = {
          id: `tx-win-timed-${Math.random().toString(36).substring(2, 9)}`,
          type: 'win_payout',
          amount: game.prizePool,
          gameId: game.id,
          timestamp: new Date().toISOString(),
          description: `Prêmio recebido: Vitória por Vantagem de Peças (ID: ${game.id})`,
        };
        const walletW = transactions.get(winnerId) || [];
        transactions.set(winnerId, [txPayout, ...walletW]);
      } else {
        game.log.push(`Oponente faturou por fim de tempo!`);
      }
    } else {
      // Draw setup - refund both players
      game.winnerId = null;
      game.log.push('🤝 EMPATE DECLARADO por igualdade exata de peças no estouro do cronômetro!');
      game.log.push(`Reembolso integral do valor da aposta de R$ ${game.betAmount.toFixed(2)} devolvido a ambos.`);

      // Refund host
      const host = getOrCreateUser(game.host.id);
      refundBetWithBonus(host, game.betAmount);
      users.set(game.host.id, host);

      const txRefundH: Transaction = {
        id: `tx-ref-timed-${Math.random().toString(36).substring(2, 9)}`,
        type: 'draw_refund',
        amount: game.betAmount,
        gameId: game.id,
        timestamp: new Date().toISOString(),
        description: `Estorno de aposta: Empate por Tempo Limite (ID: ${game.id})`
      };
      const wH = transactions.get(game.host.id) || [];
      transactions.set(game.host.id, [txRefundH, ...wH]);

      // Refund guest
      if (game.guest && game.guest.id !== 'bot-dama') {
        const guest = getOrCreateUser(game.guest.id);
        refundBetWithBonus(guest, game.betAmount);
        users.set(game.guest.id, guest);

        const txRefundG: Transaction = {
          id: `tx-ref-timed-${Math.random().toString(36).substring(2, 9)}`,
          type: 'draw_refund',
          amount: game.betAmount,
          gameId: game.id,
          timestamp: new Date().toISOString(),
          description: `Estorno de aposta: Empate por Tempo Limite (ID: ${game.id})`
        };
        const wG = transactions.get(game.guest.id) || [];
        transactions.set(game.guest.id, [txRefundG, ...wG]);
      }
    }

    games.set(gameId, game);
    saveDb();
    broadcastGame(gameId);
    broadcastLobby();
    return true;
  }
  return false;
}

// Background interval to check for game match 10-minute timeouts
setInterval(() => {
  for (const game of games.values()) {
    if (game.status === 'active' && game.startedAt) {
      checkGameTimeoutAndResolve(game.id);
    }
  }
}, 3000);

// Generate fake winners every 5 minutes for social proof ticker
setInterval(() => {
  const values = [18, 28, 38, 48];
  const fakeName = fictitiousNames[Math.floor(Math.random() * fictitiousNames.length)];
  const fakeValue = values[Math.floor(Math.random() * values.length)];
  lastWinners.unshift({
    playerName: fakeName,
    amount: fakeValue,
    timestamp: new Date().toISOString(),
  });
  if (lastWinners.length > 50) lastWinners.length = 50;
}, 5 * 60 * 1000);

// Ensure user exists or create a default Profile
function getOrCreateUser(id: string, customName?: string): Player {
  let user = users.get(id);
  if (!user) {
    const names = [
      'Guerreiro da Dama',
      'Mestre das Pedras',
      'TacticalCheck',
      'DamaMestre',
      'ReiDoTabu',
      'DamaBetPro',
      'DamaPremium',
      'ProDamas',
    ];
    const defaultName = customName || `${names[Math.floor(Math.random() * names.length)]}#${Math.floor(1000 + Math.random() * 9000)}`;
    user = {
      id,
      name: defaultName,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`,
      balance: 100.0, // Everyone starts with simulated R$100.00
      botGamesPlayed: 0,
      bonusBalance: 0,
      rolloverRequired: 0,
      rolloverWagered: 0,
    };
    users.set(id, user);

    // Initial transaction log
    const welcomeTx: Transaction = {
      id: `tx-welcome-${Math.random().toString(36).substring(2, 9)}`,
      type: 'deposit',
      amount: 100.0,
      timestamp: new Date().toISOString(),
      description: 'Saldo de boas-vindas simulado (100% seguro)',
    };
    transactions.set(id, [welcomeTx]);
    saveDb();
  } else if (customName && customName !== user.name) {
    user.name = customName;
    users.set(id, user);
    saveDb();
  }
  return user;
}

// API Routes

// Registration endpoint (Gmail + Nick + Password)
app.post('/api/auth/register', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
  }

  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Por favor, insira o Gmail, o nick e a senha.' });
  }

  const normalizedUser = sanitize(username);
  const normalizedEmail = sanitize(email).toLowerCase();
  const normalizedPass = password;

  // Validate Gmail format
  if (!normalizedEmail.includes('@') || !normalizedEmail.endsWith('gmail.com')) {
    return res.status(400).json({ error: 'Insira um endereço de E-mail do Gmail válido (exemplo@gmail.com).' });
  }

  if (normalizedUser.length < 3) {
    return res.status(400).json({ error: 'O nick de usuário deve ter no mínimo 3 caracteres.' });
  }
  if (normalizedPass.length < 4) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres.' });
  }

  // Check if nick or email already in use
  const existingUserByNick = Array.from(users.values()).find(
    (u) => u.name.toLowerCase() === normalizedUser.toLowerCase()
  );
  const existingUserByEmail = Array.from(users.values()).find(
    (u: any) => u.email && u.email.toLowerCase() === normalizedEmail
  );

  if (existingUserByNick) {
    return res.status(400).json({ error: 'Este nick de usuário já está em uso.' });
  }
  if (existingUserByEmail) {
    return res.status(400).json({ error: 'Este Gmail já está cadastrado em outra conta.' });
  }

  const { hash, salt } = hashPassword(normalizedPass);

  const id = 'user_' + crypto.randomBytes(8).toString('hex');
  const newUser: any = {
    id,
    name: normalizedUser,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${id}`,
    balance: 100.0,
  };

  users.set(id, newUser);

  const welcomeTx: Transaction = {
    id: `tx-welcome-${crypto.randomBytes(4).toString('hex')}`,
    type: 'deposit',
    amount: 100.0,
    timestamp: new Date().toISOString(),
    description: 'Saldo de boas-vindas para treinar no DamaBet',
  };
  transactions.set(id, [welcomeTx]);

  const token = createSession(id);
  saveDb();

  res.json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      avatar: newUser.avatar,
      balance: newUser.balance,
    },
  });
});

// Login endpoint (Gmail/Nick + Password)
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Por favor, insira o seu Gmail (ou nick) e a senha.' });
  }

  const normalizedInput = sanitize(username).toLowerCase();
  const inputPass = password;

  // Find user by either email or username/nickname
  const foundUser: any = Array.from(users.values()).find(
    (u: any) =>
      (u.name && u.name.toLowerCase() === normalizedInput) ||
      (u.email && u.email.toLowerCase() === normalizedInput)
  );

  if (!foundUser) {
    return res.status(400).json({ error: 'Credenciais inválidas. Verifique o Gmail/Nick e a senha.' });
  }

  // Verify hashed password
  if (!foundUser.passwordHash || !foundUser.passwordSalt) {
    return res.status(400).json({ error: 'Credenciais inválidas. Verifique o Gmail/Nick e a senha.' });
  }

  const isValid = verifyPassword(inputPass, foundUser.passwordHash, foundUser.passwordSalt);
  if (!isValid) {
    return res.status(400).json({ error: 'Credenciais inválidas. Verifique o Gmail/Nick e a senha.' });
  }

  const token = createSession(foundUser.id);

  res.json({
    success: true,
    token,
    user: {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      avatar: foundUser.avatar,
      balance: foundUser.balance,
    },
  });
});

// Token verification for auto-login (replaces stored passwords)
app.post('/api/auth/verify-token', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token ausente.' });
  }
  const userId = validateToken(token);
  if (!userId) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: (user as any).email,
      avatar: user.avatar,
      balance: user.balance,
    },
  });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  const { token } = req.body;
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// User profiles
app.get('/api/users/profile', (req, res) => {
  const { id, name } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Falta o ID do usuário' });
  }
  const user = getOrCreateUser(id, typeof name === 'string' ? name : undefined);
  const txHistory = transactions.get(id) || [];
  res.json({ user, transactions: txHistory });
});

// Update profile name
app.post('/api/users/update-name', (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'Dados insuficientes' });
  }
  const user = getOrCreateUser(id);
  user.name = name;
  users.set(id, user);
  saveDb();
  res.json({ success: true, user });
});

// Simulate funds deposit (100% secure demo deposits)
app.post('/api/users/deposit', (req, res) => {
  const { id, amount } = req.body;
  const numAmount = parseFloat(amount);
  if (!id || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Quantia de depósito inválida' });
  }

  const user = getOrCreateUser(id);
  user.balance += numAmount;

  // Copa do Mundo deposit promotional event (Valid until July 19, 2026)
  const now = new Date();
  const deadline = new Date('2026-07-20T03:00:00Z'); // midnight of July 19, 2026 (local/BRT approx)
  let bonusAdded = 0;
  const rolloverMultiplier = 3; // Rollover requiring 3x the bonus value in game bets

  if (now <= deadline) {
    if (numAmount >= 100) {
      bonusAdded = 250;
    } else if (numAmount >= 50) {
      bonusAdded = 120;
    } else if (numAmount >= 20) {
      bonusAdded = 50;
    }
  }

  if (bonusAdded > 0) {
    user.bonusBalance = (user.bonusBalance || 0) + bonusAdded;
    user.rolloverRequired = (user.rolloverRequired || 0) + (bonusAdded * rolloverMultiplier);
    user.rolloverWagered = user.rolloverWagered || 0;
  }

  users.set(id, user);
  saveDb();

  const tx: Transaction = {
    id: `tx-dep-${Math.random().toString(36).substring(2, 9)}`,
    type: 'deposit',
    amount: numAmount,
    timestamp: new Date().toISOString(),
    description: `Depósito simulado via PIX de R$ ${numAmount.toFixed(2)} (Modo Seguro)`,
  };

  const currentTxs = transactions.get(id) || [];
  const updatedTxs = [tx, ...currentTxs];

  if (bonusAdded > 0) {
    const promoTx: Transaction = {
      id: `tx-promo-${Math.random().toString(36).substring(2, 9)}`,
      type: 'deposit',
      amount: bonusAdded,
      timestamp: new Date().toISOString(),
      description: `🏆 Promoção Copa 2026: Bônus de +R$ ${bonusAdded.toFixed(2)} creditado! (Rollover 3x)`,
    };
    updatedTxs.unshift(promoTx);
  }

  transactions.set(id, updatedTxs);
  saveDb();

  res.json({ user, transactions: transactions.get(id) });
});

// Simulate funds withdrawal
app.post('/api/users/withdraw', (req, res) => {
  const { id, amount } = req.body;
  const numAmount = parseFloat(amount);
  if (!id || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Quantia de saque inválida' });
  }

  const user = getOrCreateUser(id);

  // Rollout check validation
  const rolloverLeft = (user.rolloverRequired || 0) - (user.rolloverWagered || 0);
  if (rolloverLeft > 0) {
    return res.status(400).json({
      error: `Saque bloqueado! Você possui bônus ativo da Copa do Mundo 2026. Complete o rollover restante de R$ ${rolloverLeft.toFixed(2)} jogando damas para autorizar saques.`
    });
  }

  if (user.balance < numAmount) {
    return res.status(400).json({ error: 'Saldo de carteira simulado insuficiente' });
  }

  user.balance -= numAmount;
  users.set(id, user);
  saveDb();

  const tx: Transaction = {
    id: `tx-with-${Math.random().toString(36).substring(2, 9)}`,
    type: 'withdrawal',
    amount: numAmount,
    timestamp: new Date().toISOString(),
    description: `Saque simulado com sucesso de R$ ${numAmount.toFixed(2)} para conta do jogador`,
  };

  const currentTxs = transactions.get(id) || [];
  transactions.set(id, [tx, ...currentTxs]);
  saveDb();

  res.json({ user, transactions: transactions.get(id) });
});

// Mercado Pago Webhook integration to receive notifications, validate signature, 
// look up user by external_reference, and credit balance.
app.post('/api/webhooks/mercadopago', async (req, res) => {
  console.log('Mercado Pago Webhook Received:', JSON.stringify(req.body));

  const xSignature = req.headers['x-signature'] as string || req.headers['x-mp-signature'] as string;
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  // Extract payment details from payload
  // MP can send payment ID under data.id (payment.created / payment.updated event) 
  // or simply as resource ID
  const paymentId = req.body.data?.id || req.body.id || req.query['data.id'] || req.query['id'];
  const topic = req.body.type || req.body.topic || req.query['type'] || req.query['topic'] || 'payment';

  let externalReference = req.body.external_reference || req.body.data?.external_reference || req.query['external_reference'];
  let transactionAmount = parseFloat(req.body.transaction_amount || req.body.data?.transaction_amount || req.query['transaction_amount'] || '0');
  let paymentStatus = req.body.status || req.body.data?.status || 'approved';

  // 1. Signature validation
  if (webhookSecret && xSignature) {
    try {
      const crypto = await import('crypto');
      const parts = xSignature.split(',');
      let ts = '';
      let v1 = '';
      parts.forEach(part => {
        const [key, val] = part.split('=');
        if (key && key.trim() === 'ts') ts = val.trim();
        if (key && key.trim() === 'v1') v1 = val.trim();
      });

      if (ts && v1 && paymentId) {
        // Create standard message to verify
        const message = `id:${paymentId};topic:${topic};`;
        const calculatedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(`ts=${ts};${message}`)
          .digest('hex');

        if (calculatedSignature !== v1) {
          console.warn(`Mercado Pago Signature mismatch. Webhook secret: ${webhookSecret ? 'Configured' : 'Empty'}`);
          return res.status(401).json({ error: 'Assinatura inválida do webhook' });
        } else {
          console.log('Mercado Pago Signature verified successfully!');
        }
      }
    } catch (sigErr) {
      console.error('Erro de validação de assinatura Mercado Pago:', sigErr);
      return res.status(500).json({ error: 'Erro ao validar assinatura' });
    }
  }

  // 2. Fetch active payment details from official Mercado Pago API if ACCESS_TOKEN is configured
  // This is the safest way to ensure the payment is approved and avoid fake webhooks.
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (accessToken && paymentId) {
    try {
      console.log(`Fetching payment ${paymentId} details from Mercado Pago API...`);
      const apiResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (apiResponse.ok) {
        const paymentDetails = await apiResponse.json();
        externalReference = paymentDetails.external_reference;
        transactionAmount = parseFloat(paymentDetails.transaction_amount || 0);
        paymentStatus = paymentDetails.status;
        console.log(`Fetched payment stats from MP API: ref=${externalReference}, amount=${transactionAmount}, status=${paymentStatus}`);
      } else {
        console.error(`Error fetching payment from Mercado Pago: ${apiResponse.status} ${apiResponse.statusText}`);
      }
    } catch (fetchErr) {
      console.error('Error contacting Mercado Pago endpoint:', fetchErr);
    }
  }

  // 3. Process the payment if approved
  if (paymentStatus === 'approved') {
    if (!externalReference) {
      console.error('Approved payment received, but external_reference is missing.');
      return res.status(400).json({ error: 'Falta o external_reference (ID do usuário)' });
    }
    
    if (isNaN(transactionAmount) || transactionAmount <= 0) {
      console.error(`Received approved payment for user ${externalReference} but transactionAmount R$ ${transactionAmount} is invalid.`);
      return res.status(400).json({ error: 'Valor de pagamento inválido ou zerado' });
    }

    try {
      const user = getOrCreateUser(externalReference);
      user.balance += transactionAmount;

      // Apply World Cup 2026 Promo rules inside the webhook as well!
      // This matches our standard checkout PIX promotional triggers completely
      const now = new Date();
      const deadline = new Date('2026-07-20T03:00:00Z');
      let bonusAdded = 0;
      const rolloverMultiplier = 3;

      if (now <= deadline) {
        if (transactionAmount >= 100) {
          bonusAdded = 250;
        } else if (transactionAmount >= 50) {
          bonusAdded = 120;
        } else if (transactionAmount >= 20) {
          bonusAdded = 50;
        }
      }

      if (bonusAdded > 0) {
        user.bonusBalance = (user.bonusBalance || 0) + bonusAdded;
        user.rolloverRequired = (user.rolloverRequired || 0) + (bonusAdded * rolloverMultiplier);
        user.rolloverWagered = user.rolloverWagered || 0;
      }

      users.set(externalReference, user);
      saveDb();

      // Create deposit transaction record for user history
      const tx: Transaction = {
        id: `tx-mp-${paymentId || Math.random().toString(36).substring(2, 9)}`,
        type: 'deposit',
        amount: transactionAmount,
        timestamp: new Date().toISOString(),
        description: `💳 Depósito via Webhook Mercado Pago (Ref de Pagamento: ${paymentId || 'Simulado'})`
      };

      const userHistory = transactions.get(externalReference) || [];
      const updatedHistory = [tx, ...userHistory];

      if (bonusAdded > 0) {
        const promoTx: Transaction = {
          id: `tx-promo-${Math.random().toString(36).substring(2, 9)}`,
          type: 'deposit',
          amount: bonusAdded,
          timestamp: new Date().toISOString(),
          description: `🏆 Bônus Copa do Mundo 2026: +R$ ${bonusAdded.toFixed(2)} creditado! (Rollover 3x)`
        };
        updatedHistory.unshift(promoTx);
      }

      transactions.set(externalReference, updatedHistory);
      saveDb();

      console.log(`Successfully credited R$ ${transactionAmount} + R$ ${bonusAdded} (bonus) to user ${externalReference}`);
      return res.json({ success: true, message: 'Saldo adicionado com sucesso', user });
    } catch (saveErr) {
      console.error('Error applying webhook deposit to user:', saveErr);
      return res.status(500).json({ error: 'Erro interno ao processar depósito' });
    }
  } else {
    console.log(`Notification ignored. Status of payment is '${paymentStatus}' (not approved).`);
    return res.json({ success: true, message: `Notification received, status is '${paymentStatus}'` });
  }
});

// Create checkers Game
app.post('/api/games/create', (req, res) => {
  const { hostId, betAmount, isBotGame } = req.body;
  const parsedBet = parseFloat(betAmount);
  if (!hostId || isNaN(parsedBet) || parsedBet < 0) {
    return res.status(400).json({ error: 'Parâmetros de aposta inválidos' });
  }

  const hostPlayer = getOrCreateUser(hostId);
  const hostTotalPlayable = hostPlayer.balance + (hostPlayer.bonusBalance || 0);
  if (hostTotalPlayable < parsedBet) {
    return res.status(400).json({ error: 'Seu saldo é insuficiente para criar esta aposta!' });
  }

  const gameId = `dama-game-${Math.random().toString(36).substring(2, 9)}`;
  const { pieces, grid } = initializeBoard();

  const platformFee = parseFloat((parsedBet * 2 * 0.10).toFixed(2)); // 10% model
  const prizePool = parseFloat((parsedBet * 2 * 0.90).toFixed(2)); // 90% payout remaining

  const randomName = fictitiousNames[Math.floor(Math.random() * fictitiousNames.length)];
  const randomSeed = Math.random().toString(36).substring(2, 9);

  const botPlayer: Player | null = isBotGame ? {
    id: 'bot-dama',
    name: randomName,
    avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${randomSeed}`,
    balance: 1000.0,
  } : null;

  if (isBotGame) {
    // Automatically lock and deduct bet for bot game with bonus support
    deductBetWithBonus(hostPlayer, parsedBet, gameId);
    users.set(hostId, hostPlayer);

    const txH: Transaction = {
      id: `tx-lock-${Math.random().toString(36).substring(2, 9)}`,
      type: 'bet_lock',
      amount: parsedBet,
      gameId: gameId,
      timestamp: new Date().toISOString(),
      description: `Aposta de R$ ${parsedBet.toFixed(2)} debitada da carteira (Dama Bet ID: ${gameId})`,
    };
    const currentH = transactions.get(hostId) || [];
    transactions.set(hostId, [txH, ...currentH]);
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
    turn: 'red', // Red starts first
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
    mustJumpPieceIdByTurn: null,
  };

  games.set(gameId, newGame);
  broadcastLobby();

  res.json({ success: true, game: newGame });
});

// Join checking Game
app.post('/api/games/join', (req, res) => {
  const { gameId, guestId } = req.body;
  if (!gameId || !guestId) {
    return res.status(400).json({ error: 'Dados em falta para ingressar' });
  }

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Partida não encontrada' });
  }

  if (game.host.id === guestId) {
    return res.status(400).json({ error: 'Você não pode desafiar a si mesmo!' });
  }

  if (game.status !== 'waiting_for_challenger') {
    return res.status(400).json({ error: 'Esta mesa já está ocupada ou finalizada' });
  }

  const guestPlayer = getOrCreateUser(guestId);
  const guestTotalPlayable = guestPlayer.balance + (guestPlayer.bonusBalance || 0);
  if (guestTotalPlayable < game.betAmount) {
    return res.status(400).json({ error: 'Saldo insuficiente para cobrir o valor da aposta!' });
  }

  game.guest = guestPlayer;
  game.status = 'bet_confirmation';
  game.log.push(`${guestPlayer.name} entrou na mesa! Requer confirmação de fundos.`);

  games.set(gameId, game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Confirm Bet / Lock Deposits
app.post(['/api/games/:gameId/bet-confirm', '/api/games/confirm-bet'], (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId } = req.body;

  if (!gameId || !userId) {
    return res.status(400).json({ error: 'Dados insuficientes. Falta gameId ou userId' });
  }

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Mecanismo de jogo não encontrado' });
  }

  const isHost = game.host.id === userId;
  const isGuest = game.guest?.id === userId;

  if (!isHost && !isGuest) {
    return res.status(403).json({ error: 'Jogador não autorizado para esta partida' });
  }

  // Refetch to get updated balances
  const user = getOrCreateUser(userId);
  const totalPlayable = user.balance + (user.bonusBalance || 0);
  if (totalPlayable < game.betAmount) {
    return res.status(400).json({ error: 'Saldo de carteira insuficiente para apostar' });
  }

  if (isHost) {
    game.hostReady = true;
    game.log.push(`Anfitrião ${game.host.name} está pronto para o duelo!`);
    if (game.isBotGame) {
      game.guestReady = true;
      game.log.push(`O desafiante ${game.guest!.name} confirmou os termos e aceitou o desafio!`);
    }
  } else {
    game.guestReady = true;
    game.log.push(`Desafiante ${game.guest!.name} está pronto para o duelo!`);
  }

  // If both are ready, lock the bets and launch!
  if (game.hostReady && game.guestReady) {
    // 1. Deduct balance from host
    const hUser = getOrCreateUser(game.host.id);
    deductBetWithBonus(hUser, game.betAmount, game.id);
    users.set(game.host.id, hUser);

    const txH: Transaction = {
      id: `tx-lock-${Math.random().toString(36).substring(2, 9)}`,
      type: 'bet_lock',
      amount: game.betAmount,
      gameId: game.id,
      timestamp: new Date().toISOString(),
      description: `Aposta de R$ ${game.betAmount.toFixed(2)} debitada da carteira (Dama Bet ID: ${game.id})`,
    };
    const currentH = transactions.get(game.host.id) || [];
    transactions.set(game.host.id, [txH, ...currentH]);

    // 2. Deduct balance from guest
    if (game.guest!.id !== 'bot-dama') {
      const gUser = getOrCreateUser(game.guest!.id);
      deductBetWithBonus(gUser, game.betAmount, game.id);
      users.set(game.guest!.id, gUser);

      const txG: Transaction = {
        id: `tx-lock-${Math.random().toString(36).substring(2, 9)}`,
        type: 'bet_lock',
        amount: game.betAmount,
        gameId: game.id,
        timestamp: new Date().toISOString(),
        description: `Aposta de R$ ${game.betAmount.toFixed(2)} debitada da carteira (Dama Bet ID: ${game.id})`,
      };
      const currentG = transactions.get(game.guest!.id) || [];
      transactions.set(game.guest!.id, [txG, ...currentG]);
    } else {
      game.log.push(`🤖 Custódia fictícia travada para: ${game.guest!.name}.`);
    }

    // 3. Mark game as Active!
    game.status = 'active';
    game.startedAt = new Date().toISOString();
    game.log.push(`💸 Aposta total de R$ ${(game.betAmount * 2).toFixed(2)} está fechada e sob custódia segura! Que comece o jogo!`);
  }

  games.set(gameId, game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Forfeit Rule / Resign
app.post(['/api/games/:gameId/resign', '/api/games/resign'], (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId } = req.body;

  if (!gameId || !userId) {
    return res.status(400).json({ error: 'Dados insuficientes. Falta gameId ou userId' });
  }

  const game = games.get(gameId);
  if (!game || game.status !== 'active') {
    return res.status(404).json({ error: 'Partida em andamento não ativa' });
  }

  const isHost = game.host.id === userId;
  const isGuest = game.guest?.id === userId;

  if (!isHost && !isGuest) {
    return res.status(403).json({ error: 'Usuário não faz parte do jogo' });
  }

  const resignerName = isHost ? game.host.name : game.guest!.name;
  game.log.push(`${resignerName} desistiu da disputa!`);

  // The other player is the winner
  const winnerUserId = isHost ? game.guest!.id : game.host.id;
  const winnerEntity = isHost ? game.guest! : game.host;

  game.winnerId = winnerUserId;
  game.status = 'finished';
  finalizeBotGameCount(game);
  game.log.push(`Vitória por desistência! ${winnerEntity.name} levou o prêmio de R$ ${game.prizePool.toFixed(2)}.`);

  // Payout routine
  const luckyWinner = getOrCreateUser(winnerUserId);
  luckyWinner.balance += game.prizePool;
  users.set(winnerUserId, luckyWinner);
  recordWin(winnerEntity.name, winnerUserId, game.prizePool);

  const txPayout: Transaction = {
    id: `tx-payout-${Math.random().toString(36).substring(2, 9)}`,
    type: 'win_payout',
    amount: game.prizePool,
    gameId: game.id,
    timestamp: new Date().toISOString(),
    description: `Pagamento recebido: Vitória no jogo de Damas (ID: ${game.id})`,
  };
  const currentWinnerTx = transactions.get(winnerUserId) || [];
  transactions.set(winnerUserId, [txPayout, ...currentWinnerTx]);

  games.set(gameId, game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Vote in agreement of a Draw
app.post(['/api/games/:gameId/draw-vote', '/api/games/draw'], (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId } = req.body;

  if (!gameId || !userId) {
    return res.status(400).json({ error: 'Dados insuficientes. Falta gameId ou userId' });
  }

  const game = games.get(gameId);
  if (!game || game.status !== 'active') {
    return res.status(404).json({ error: 'Jogo inválido ou não ativo' });
  }

  if (game.host.id !== userId && game.guest?.id !== userId) {
    return res.status(403).json({ error: 'Não autorizado' });
  }

  if (!game.drawVotedBy.includes(userId)) {
    game.drawVotedBy.push(userId);
    const votingUserName = game.host.id === userId ? game.host.name : game.guest!.name;
    game.log.push(`${votingUserName} propôs um empate consensual.`);
  }

  // Draw conditions satisfied
  if (game.drawVotedBy.length === 2) {
    game.status = 'finished';
    game.winnerId = null; // No winner
    game.log.push(`🤝 Duelo encerrado em EMPATE consensual! Apostas de R$ ${game.betAmount.toFixed(2)} estornadas integralmente (taxa zero).`);

    // Refund Host
    const hUser = getOrCreateUser(game.host.id);
    refundBetWithBonus(hUser, game.betAmount);
    users.set(game.host.id, hUser);

    const txRefundH: Transaction = {
      id: `tx-ref-${Math.random().toString(36).substring(2, 9)}`,
      type: 'draw_refund',
      amount: game.betAmount,
      gameId: game.id,
      timestamp: new Date().toISOString(),
      description: `Estorno integral de aposta por empate em damas (ID: ${game.id})`,
    };
    const walletH = transactions.get(game.host.id) || [];
    transactions.set(game.host.id, [txRefundH, ...walletH]);

    // Refund Guest
    const gUser = getOrCreateUser(game.guest!.id);
    refundBetWithBonus(gUser, game.betAmount);
    users.set(game.guest!.id, gUser);

    const txRefundG: Transaction = {
      id: `tx-ref-${Math.random().toString(36).substring(2, 9)}`,
      type: 'draw_refund',
      amount: game.betAmount,
      gameId: game.id,
      timestamp: new Date().toISOString(),
      description: `Estorno integral de aposta por empate em damas (ID: ${game.id})`,
    };
    const walletG = transactions.get(game.guest!.id) || [];
    transactions.set(game.guest!.id, [txRefundG, ...walletG]);
  }

  games.set(gameId, game);
  broadcastGame(gameId);

  res.json({ success: true, game });
});

// Cancel game before anyone joins (unlocked)
app.post(['/api/games/:gameId/cancel', '/api/games/cancel'], (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const userId = (req.body.userId || req.body.hostId) as string;

  if (!gameId || !userId) {
    return res.status(400).json({ error: 'Dados insuficientes. Falta gameId ou userId' });
  }

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Partida não encontrada' });
  }

  if (game.host.id !== userId) {
    return res.status(403).json({ error: 'Apenas o anfitrião pode cancelar a mesa' });
  }

  if (game.status !== 'waiting_for_challenger' && game.status !== 'bet_confirmation') {
    return res.status(400).json({ error: 'Não é possível cancelar uma partida em andamento!' });
  }

  game.status = 'cancelled';
  game.log.push(`Partida cancelada pelo anfitrião.`);

  // Since bet triggers locked at confirmation stage only, no refund is needed. 
  // If we had deducted it, we refund it, but here deduction only happens when BOTH locked and ready!
  games.set(gameId, game);
  broadcastGame(gameId);
  broadcastLobby();

  res.json({ success: true, game });
});

// Chat message
app.post(['/api/games/:gameId/chat', '/api/games/chat'], (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const userId = (req.body.userId || req.body.senderId) as string;
  const { text } = req.body;

  if (!gameId || !userId || !text) {
    return res.status(400).json({ error: 'Dados insuficientes' });
  }

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Partida não correspondida' });
  }

  const sender = game.host.id === userId ? game.host : game.guest?.id === userId ? game.guest : null;
  if (!sender) {
    return res.status(403).json({ error: 'Você não faz parte desta partida' });
  }

  const message: Message = {
    id: `msg-${Math.random().toString(36).substring(2, 9)}`,
    senderId: userId,
    senderName: sender.name,
    text,
    timestamp: new Date().toISOString(),
  };

  game.chat.push(message);
  games.set(gameId, game);
  broadcastGame(gameId);

  res.json({ success: true });
});

// Submit Checkers Game Move
app.post(['/api/games/:gameId/move', '/api/games/move'], (req, res) => {
  const gameId = (req.params.gameId || req.body.gameId) as string;
  const { userId, move } = req.body; // move: MoveCoordinates

  if (!gameId || !userId || !move) {
    return res.status(400).json({ error: 'Dados insuficientes' });
  }

  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Partida não encontrada' });
  }

  if (game.status !== 'active') {
    return res.status(400).json({ error: 'Esta mesa não está em estado de jogo ativo' });
  }

  const activeTurnColor = game.turn;
  const expectedPlayerId = activeTurnColor === 'red' ? game.host.id : game.guest?.id;

  if (expectedPlayerId !== userId) {
    return res.status(400).json({ error: 'Não é seu turno!' });
  }

  // Enforce double jump locks if active
  if (game.mustJumpPieceIdByTurn) {
    const movingPieceRow = move.from.row;
    const movingPieceCol = move.from.col;
    const movingPiece = game.board.grid[movingPieceRow][movingPieceCol];
    if (!movingPiece || movingPiece.id !== game.mustJumpPieceIdByTurn) {
      return res.status(400).json({ error: 'Movimento inválido! Você precisa continuar capturando com a mesma peça sob tranca.' });
    }
  }

  // Server-side checkers verification
  const validMoves = getValidMoves(game.board.grid, activeTurnColor, game.mustJumpPieceIdByTurn);
  const matchedMove = validMoves.find(
    (vm) =>
      vm.from.row === move.from.row &&
      vm.from.col === move.from.col &&
      vm.to.row === move.to.row &&
      vm.to.col === move.to.col
  );

  if (!matchedMove) {
    return res.status(400).json({ error: 'Movimento de Damas ilegal!' });
  }

  // Apply move safely
  const { grid: nextGrid, promotedToKing, nextSpecialMustJumpPieceId } = executeMove(game.board.grid, matchedMove);

  // Update game state
  game.board.grid = nextGrid;
  
  // Re-sync piece array for rendering convenience
  const updatedPieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = nextGrid[r][c];
      if (p) {
        updatedPieces.push(p);
      }
    }
  }
  game.pieces = updatedPieces;

  // Render log text
  const pieceName = matchedMove.isJump ? 'capturou peça em diagonal' : 'moveu para';
  const playerLabel = activeTurnColor === 'red' ? game.host.name : game.guest!.name;
  const promotionMsg = promotedToKing ? ' 👑 PROMOVIDO A DAMA!' : '';
  game.log.push(`${playerLabel} ${pieceName} [${matchedMove.to.row + 1},${matchedMove.to.col + 1}]${promotionMsg}`);

  // Handle double jumps / end-of-turn
  if (nextSpecialMustJumpPieceId) {
    game.mustJumpPieceIdByTurn = nextSpecialMustJumpPieceId;
    game.log.push(`⚠️ Jogada dupla! ${playerLabel} deve continuar a sequência de capturas!`);
  } else {
    // End turn, hand off to next player
    game.mustJumpPieceIdByTurn = null;
    game.turn = game.turn === 'red' ? 'black' : 'red';
  }

  // Bot instant reaction on user move
  if (game.status === 'active' && game.isBotGame && game.guest) {
    let opponentEmoji: string | null = null;
    if (matchedMove.isJump) {
      // The user captured one of bot's pieces!
      const rand = Math.random();
      if (rand < 0.4) {
        opponentEmoji = '😢';
      } else if (rand < 0.7) {
        opponentEmoji = '💣';
      } else {
        opponentEmoji = '👏';
      }
    } else {
      // Regular user move
      const rand = Math.random();
      if (rand < 0.25) {
        opponentEmoji = Math.random() < 0.5 ? '😜' : '❓';
      }
    }

    if (opponentEmoji) {
      game.chat.push({
        id: `msg-bot-react-${Math.random().toString(36).substring(2, 9)}`,
        senderId: game.guest.id,
        senderName: game.guest.name,
        text: opponentEmoji,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Calculate if checkers Game Over
  const gameOverStatus = checkGameOver(game.board.grid, game.turn);
  if (gameOverStatus.isGameOver) {
    game.status = 'finished';
    finalizeBotGameCount(game);
    
    // Choose winner ID
    if (gameOverStatus.winner) {
      const winnerId = gameOverStatus.winner === 'red' ? game.host.id : game.guest!.id;
      const winnerName = gameOverStatus.winner === 'red' ? game.host.name : game.guest!.name;
      game.winnerId = winnerId;
      game.log.push(`👑 FIM DE JOGO: ${winnerName} venceu por bloqueio/aniquilação de peças inimigas!`);

      if (winnerId !== 'bot-dama') {
        game.log.push(`🎉 Prêmio de R$ ${game.prizePool.toFixed(2)} transferido à carteira segura.`);
        // Award the funds
        const luckyWinner = getOrCreateUser(winnerId);
        luckyWinner.balance += game.prizePool;
        users.set(winnerId, luckyWinner);
        recordWin(winnerName, winnerId, game.prizePool);

        const txPayout: Transaction = {
          id: `tx-win-${Math.random().toString(36).substring(2, 9)}`,
          type: 'win_payout',
          amount: game.prizePool,
          gameId: game.id,
          timestamp: new Date().toISOString(),
          description: `Prêmio recebido: Vitória no Dama Bet (ID: ${game.id})`,
        };
        const walletW = transactions.get(winnerId) || [];
        transactions.set(winnerId, [txPayout, ...walletW]);
      } else {
        game.log.push(`Oponente ${game.guest!.name} levou a melhor e faturou a rodada!`);
      }
    } else {
      // Draw setup
      game.winnerId = null;
      game.log.push('Empate forçado por travamento total.');
    }
  }

  games.set(gameId, game);
  broadcastGame(gameId);
  broadcastLobby();

  if (game.status === 'active' && game.isBotGame && game.turn === 'black') {
    runBotTurnIfActive(gameId).catch((err) => console.error('Error running bot turn:', err));
  }

  res.json({ success: true, game });
});

// Real-Time SSE Game subscription streams
app.get(['/api/games/:gameId/stream', '/api/games/stream'], (req, res) => {
  const gameId = (req.params.gameId || req.query.gameId) as string;

  if (!gameId) {
    return res.status(400).send('Falta gameId');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const connectionId = `conn-${Math.random().toString(36).substring(2, 9)}`;
  const connection: Connection = { id: connectionId, res };

  // Keep alive ping tick
  const keepAliveInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  const currentConnections = gameConnections.get(gameId) || [];
  gameConnections.set(gameId, [...currentConnections, connection]);

  // Push immediate first state
  const game = games.get(gameId);
  if (game) {
    res.write(`data: ${JSON.stringify(game)}\n\n`);
  }

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    const existingConnections = gameConnections.get(gameId) || [];
    gameConnections.set(
      gameId,
      existingConnections.filter((c) => c.id !== connectionId)
    );
  });
});

// Real-Time SSE Lobby streams (active search and tables)
app.get('/api/lobby/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const connectionId = `conn-${Math.random().toString(36).substring(2, 9)}`;
  const connection: Connection = { id: connectionId, res };

  // Keep alive ping tick
  const keepAliveInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  lobbyConnections.push(connection);

  // Send immediate update
  const lobbyGames = Array.from(games.values()).filter(
    (g) => g.status === 'waiting_for_challenger' || g.status === 'bet_confirmation'
  );
  res.write(`data: ${JSON.stringify(lobbyGames)}\n\n`);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    const idx = lobbyConnections.findIndex((c) => c.id === connectionId);
    if (idx !== -1) {
      lobbyConnections.splice(idx, 1);
    }
  });
});

// ─── Stats & Ranking Endpoints ───────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const activeMatches = Array.from(games.values()).filter(g => g.status === 'active').length;
  const totalPlayers = users.size;
  const onlinePlayers = Math.min(Math.max(totalPlayers * 3 + 800 + Math.floor(Math.random() * 200), 800), 1300);
  res.json({ onlinePlayers, activeMatches });
});

app.get('/api/ranking/weekly', (req, res) => {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyWins = winRecords.filter(r => new Date(r.timestamp).getTime() > oneWeekAgo);

  const playerTotals: Record<string, { name: string; total: number }> = {};
  for (const r of weeklyWins) {
    if (!playerTotals[r.playerId]) {
      playerTotals[r.playerId] = { name: r.playerName, total: 0 };
    }
    playerTotals[r.playerId].total += r.amount;
  }

  const ranking = Object.entries(playerTotals)
    .map(([id, data]) => ({ id, name: data.name, total: data.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const usedNames = new Set(ranking.map(r => r.name));
  while (ranking.length < 10) {
    const candidate = fictitiousNames[Math.floor(Math.random() * fictitiousNames.length)];
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      ranking.push({
        id: `fake-${Math.random().toString(36).substring(2, 6)}`,
        name: candidate,
        total: Math.floor(Math.random() * 1200) + 200,
      });
    }
  }

  res.json({ ranking, totalGames: weeklyWins.length });
});

app.get('/api/ranking/last-winners', (req, res) => {
  res.json({ winners: lastWinners.slice(0, 20) });
});

// Server boot and hot Vite bundling
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: {
          ignored: ['**/.data/**', '**/users-db.json'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dama Bet Server running on http://0.0.0.0:${PORT}`);
  });
}

// Vercel serverless export — no listening, just export the app
export default app;

// Only start the server when running directly (not on Vercel)
if (!process.env.VERCEL) {
  startServer();
}
