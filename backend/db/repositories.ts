import fs from 'fs';
import path from 'path';
import { Player, Deposit, Transaction, WebhookEvent, Withdrawal } from '../types.js';
import { pool, isPostgresActive } from './client.js';

const DATA_DIR = path.join(process.cwd(), '.data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Fallback JSON File Paths
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const WEBHOOK_EVENTS_FILE = path.join(DATA_DIR, 'webhook_events.json');
const WITHDRAWALS_FILE = path.join(DATA_DIR, 'withdrawals.json');

// In-memory Caches for fast O(1) lookups
let cachedUsers: Player[] | null = null;
let cachedDeposits: Deposit[] | null = null;
let cachedTransactions: Transaction[] | null = null;
let cachedWebhookEvents: WebhookEvent[] | null = null;
let cachedWithdrawals: Withdrawal[] | null = null;

// Helper to read JSON database
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as T;
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

// Cache loading functions
function getUsersCache(): Player[] {
  if (cachedUsers === null) {
    cachedUsers = readJsonFile<Player[]>(USERS_FILE, []);
  }
  return cachedUsers;
}

function getDepositsCache(): Deposit[] {
  if (cachedDeposits === null) {
    cachedDeposits = readJsonFile<Deposit[]>(DEPOSITS_FILE, []);
  }
  return cachedDeposits;
}

function getTransactionsCache(): Transaction[] {
  if (cachedTransactions === null) {
    cachedTransactions = readJsonFile<Transaction[]>(TRANSACTIONS_FILE, []);
  }
  return cachedTransactions;
}

function getWebhookEventsCache(): WebhookEvent[] {
  if (cachedWebhookEvents === null) {
    cachedWebhookEvents = readJsonFile<WebhookEvent[]>(WEBHOOK_EVENTS_FILE, []);
  }
  return cachedWebhookEvents;
}

function getWithdrawalsCache(): Withdrawal[] {
  if (cachedWithdrawals === null) {
    cachedWithdrawals = readJsonFile<Withdrawal[]>(WITHDRAWALS_FILE, []);
  }
  return cachedWithdrawals;
}

// Helper to write JSON database asynchronously (non-blocking)
async function writeJsonFileAsync<T>(filePath: string, data: T): Promise<void> {
  try {
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing asynchronously to ${filePath}:`, err);
  }
}

// --- UserRepository ---
export class UserRepository {
  static async findById(id: string): Promise<Player | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        name: r.name,
        avatar: r.avatar,
        balance: parseFloat(r.balance),
        lockedBalance: parseFloat(r.locked_balance || '0'),
        email: r.email,
        botGamesPlayed: r.bot_games_played,
        bonusBalance: parseFloat(r.bonus_balance),
        rolloverRequired: parseFloat(r.rollover_required),
        rolloverWagered: parseFloat(r.rollover_wagered),
        passwordHash: r.password_hash,
        passwordSalt: r.password_salt
      };
    } else {
      const list = getUsersCache();
      const user = list.find(u => u.id === id);
      return user || null;
    }
  }

  static async findByEmailOrUsername(input: string): Promise<Player | null> {
    const queryStr = input.trim().toLowerCase();
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(name) = $1',
        [queryStr]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        name: r.name,
        avatar: r.avatar,
        balance: parseFloat(r.balance),
        lockedBalance: parseFloat(r.locked_balance || '0'),
        email: r.email,
        botGamesPlayed: r.bot_games_played,
        bonusBalance: parseFloat(r.bonus_balance),
        rolloverRequired: parseFloat(r.rollover_required),
        rolloverWagered: parseFloat(r.rollover_wagered),
        passwordHash: r.password_hash,
        passwordSalt: r.password_salt
      };
    } else {
      const list = getUsersCache();
      const user = list.find(
        u => (u.email && u.email.toLowerCase() === queryStr) || u.name.toLowerCase() === queryStr
      );
      return user || null;
    }
  }

  static async save(user: Player): Promise<void> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [user.id]);
      if (rows.length > 0) {
        await pool.query(
          `UPDATE users SET 
            name = $2, avatar = $3, balance = $4, locked_balance = $5, email = $6, bot_games_played = $7, 
            bonus_balance = $8, rollover_required = $9, rollover_wagered = $10, 
            password_hash = $11, password_salt = $12
           WHERE id = $1`,
          [
            user.id,
            user.name,
            user.avatar,
            user.balance,
            user.lockedBalance || 0,
            user.email || null,
            user.botGamesPlayed || 0,
            user.bonusBalance || 0,
            user.rolloverRequired || 0,
            user.rolloverWagered || 0,
            user.passwordHash || null,
            user.passwordSalt || null
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO users 
            (id, name, avatar, balance, locked_balance, email, bot_games_played, bonus_balance, rollover_required, rollover_wagered, password_hash, password_salt) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            user.id,
            user.name,
            user.avatar,
            user.balance,
            user.lockedBalance || 0,
            user.email || null,
            user.botGamesPlayed || 0,
            user.bonusBalance || 0,
            user.rolloverRequired || 0,
            user.rolloverWagered || 0,
            user.passwordHash || null,
            user.passwordSalt || null
          ]
        );
      }
    } else {
      const list = getUsersCache();
      const idx = list.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        list[idx] = user;
      } else {
        list.push(user);
      }
      await writeJsonFileAsync(USERS_FILE, list);
    }
  }

  static async updateBalance(
    id: string,
    balance: number,
    bonusBalance: number,
    rolloverWagered: number,
    rolloverRequired: number
  ): Promise<void> {
    const user = await this.findById(id);
    if (user) {
      user.balance = balance;
      user.bonusBalance = bonusBalance;
      user.rolloverWagered = rolloverWagered;
      user.rolloverRequired = rolloverRequired;
      await this.save(user);
    }
  }

  static async getAllUsers(): Promise<Player[]> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT * FROM users');
      return rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        avatar: r.avatar,
        balance: parseFloat(r.balance),
        lockedBalance: parseFloat(r.locked_balance || '0'),
        email: r.email,
        botGamesPlayed: r.bot_games_played,
        bonusBalance: parseFloat(r.bonus_balance),
        rolloverRequired: parseFloat(r.rollover_required),
        rolloverWagered: parseFloat(r.rollover_wagered),
        passwordHash: r.password_hash,
        passwordSalt: r.password_salt
      }));
    } else {
      return getUsersCache();
    }
  }
}

// --- DepositRepository ---
export class DepositRepository {
  static async create(deposit: Deposit): Promise<void> {
    if (isPostgresActive && pool) {
      await pool.query(
        `INSERT INTO deposits (id, user_id, mp_payment_id, amount, status, created_at, expiration_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          deposit.id,
          deposit.userId,
          deposit.mpPaymentId,
          deposit.amount,
          deposit.status,
          new Date(deposit.createdAt),
          new Date(deposit.expirationAt)
        ]
      );
    } else {
      const list = getDepositsCache();
      list.push(deposit);
      await writeJsonFileAsync(DEPOSITS_FILE, list);
    }
  }

  static async findById(id: string): Promise<Deposit | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT * FROM deposits WHERE id = $1', [id]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        mpPaymentId: r.mp_payment_id,
        amount: parseFloat(r.amount),
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined,
        expirationAt: new Date(r.expiration_at).toISOString()
      };
    } else {
      const list = getDepositsCache();
      return list.find(d => d.id === id) || null;
    }
  }

  static async findByMpPaymentId(mpPaymentId: string): Promise<Deposit | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT * FROM deposits WHERE mp_payment_id = $1', [mpPaymentId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        mpPaymentId: r.mp_payment_id,
        amount: parseFloat(r.amount),
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined,
        expirationAt: new Date(r.expiration_at).toISOString()
      };
    } else {
      const list = getDepositsCache();
      return list.find(d => d.mpPaymentId === mpPaymentId) || null;
    }
  }

  static async updateStatus(id: string, status: 'approved' | 'rejected' | 'expired', approvedAt?: string): Promise<void> {
    if (isPostgresActive && pool) {
      await pool.query(
        'UPDATE deposits SET status = $2, approved_at = $3 WHERE id = $1',
        [id, status, approvedAt ? new Date(approvedAt) : null]
      );
    } else {
      const list = getDepositsCache();
      const idx = list.findIndex(d => d.id === id);
      if (idx !== -1) {
        list[idx].status = status;
        if (approvedAt) {
          list[idx].approvedAt = approvedAt;
        }
        await writeJsonFileAsync(DEPOSITS_FILE, list);
      }
    }
  }

  static async getExpiredPendingDeposits(): Promise<Deposit[]> {
    const now = new Date();
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        "SELECT * FROM deposits WHERE status = 'pending' AND expiration_at < $1",
        [now]
      );
      return rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        mpPaymentId: r.mp_payment_id,
        amount: parseFloat(r.amount),
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined,
        expirationAt: new Date(r.expiration_at).toISOString()
      }));
    } else {
      const list = getDepositsCache();
      return list.filter(d => d.status === 'pending' && new Date(d.expirationAt).getTime() < now.getTime());
    }
  }

  static async findAllByUserId(userId: string): Promise<Deposit[]> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        'SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        mpPaymentId: r.mp_payment_id,
        amount: parseFloat(r.amount),
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined,
        expirationAt: new Date(r.expiration_at).toISOString()
      }));
    } else {
      const list = getDepositsCache();
      return list
        .filter(d => d.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }
}

// --- TransactionRepository ---
export class TransactionRepository {
  static async create(transaction: Transaction): Promise<void> {
    if (isPostgresActive && pool) {
      await pool.query(
        `INSERT INTO transactions (id, user_id, type, amount, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          transaction.id,
          transaction.userId,
          transaction.type,
          transaction.amount,
          transaction.description,
          new Date(transaction.createdAt)
        ]
      );
    } else {
      const list = getTransactionsCache();
      list.push(transaction);
      await writeJsonFileAsync(TRANSACTIONS_FILE, list);
    }
  }

  static async findAllByUserId(userId: string): Promise<Transaction[]> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type as any,
        amount: parseFloat(r.amount),
        description: r.description,
        createdAt: new Date(r.created_at).toISOString()
      }));
    } else {
      const list = getTransactionsCache();
      return list
        .filter(t => t.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }
}

// --- WebhookEventRepository ---
export class WebhookEventRepository {
  static async create(event: WebhookEvent): Promise<void> {
    if (isPostgresActive && pool) {
      await pool.query(
        `INSERT INTO webhook_events (id, mp_payment_id, event_type, processed_at)
         VALUES ($1, $2, $3, $4)`,
        [
          event.id,
          event.mpPaymentId,
          event.eventType,
          new Date(event.processedAt)
        ]
      );
    } else {
      const list = getWebhookEventsCache();
      list.push(event);
      await writeJsonFileAsync(WEBHOOK_EVENTS_FILE, list);
    }
  }

  static async findByMpPaymentId(mpPaymentId: string): Promise<WebhookEvent | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT * FROM webhook_events WHERE mp_payment_id = $1', [mpPaymentId]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        mpPaymentId: r.mp_payment_id,
        eventType: r.event_type,
        processedAt: new Date(r.processed_at).toISOString()
      };
    } else {
      const list = getWebhookEventsCache();
      return list.find(e => e.mpPaymentId === mpPaymentId) || null;
    }
  }
}

// --- WithdrawalRepository ---
export class WithdrawalRepository {
  static async createWithdrawalTransaction(
    w: Withdrawal,
    balanceDeduction: number,
    lockedBalanceAddition: number,
    txLog: Transaction
  ): Promise<void> {
    if (isPostgresActive && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Update user balances (deduct balance, increase locked_balance)
        await client.query(
          `UPDATE users 
           SET balance = balance - $1, locked_balance = locked_balance + $2 
           WHERE id = $3`,
          [balanceDeduction, lockedBalanceAddition, w.userId]
        );

        // 2. Insert into withdrawals
        await client.query(
          `INSERT INTO withdrawals (id, user_id, amount, pix_key, pix_key_type, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [w.id, w.userId, w.amount, w.pixKey, w.pixKeyType, w.status, new Date(w.createdAt)]
        );

        // 3. Insert transaction log
        await client.query(
          `INSERT INTO transactions (id, user_id, type, amount, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [txLog.id, txLog.userId, txLog.type, txLog.amount, txLog.description, new Date(txLog.createdAt)]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Fallback JSON implementation
      const user = await UserRepository.findById(w.userId);
      if (!user) throw new Error('Usuário não encontrado');
      
      user.balance -= balanceDeduction;
      user.lockedBalance = (user.lockedBalance || 0) + lockedBalanceAddition;
      await UserRepository.save(user);

      const wList = getWithdrawalsCache();
      wList.push(w);
      await writeJsonFileAsync(WITHDRAWALS_FILE, wList);

      await TransactionRepository.create(txLog);
    }
  }

  static async updateWithdrawalStatusTransaction(
    id: string,
    status: 'approved' | 'rejected' | 'failed' | 'cancelled' | 'processing',
    approvedAt?: string
  ): Promise<void> {
    if (isPostgresActive && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Fetch current withdrawal to calculate balance adjustment
        const { rows } = await client.query('SELECT * FROM withdrawals WHERE id = $1', [id]);
        if (rows.length === 0) {
          throw new Error('Retirada não encontrada');
        }
        const w = rows[0];
        const amount = parseFloat(w.amount);
        const userId = w.user_id;

        // Update withdrawal status
        await client.query(
          'UPDATE withdrawals SET status = $2, approved_at = $3 WHERE id = $1',
          [id, status, approvedAt ? new Date(approvedAt) : null]
        );

        if (status === 'approved') {
          // If approved: unlock the balance (simply deduct it from locked_balance)
          await client.query(
            'UPDATE users SET locked_balance = GREATEST(0.00, locked_balance - $1) WHERE id = $2',
            [amount, userId]
          );
        } else if (status === 'rejected' || status === 'failed' || status === 'cancelled') {
          // If rejected/failed/cancelled: refund it back to balance, deduct locked_balance
          await client.query(
            `UPDATE users 
             SET balance = balance + $1, 
                 locked_balance = GREATEST(0.00, locked_balance - $1) 
             WHERE id = $2`,
            [amount, userId]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const wList = getWithdrawalsCache();
      const idx = wList.findIndex(w => w.id === id);
      if (idx !== -1) {
        const w = wList[idx];
        const user = await UserRepository.findById(w.userId);
        if (user) {
          wList[idx].status = status;
          if (approvedAt) {
            wList[idx].approvedAt = approvedAt;
          }

          if (status === 'approved') {
            user.lockedBalance = Math.max(0, (user.lockedBalance || 0) - w.amount);
          } else if (status === 'rejected' || status === 'failed' || status === 'cancelled') {
            user.balance += w.amount;
            user.lockedBalance = Math.max(0, (user.lockedBalance || 0) - w.amount);
          }
          await UserRepository.save(user);
        }
        await writeJsonFileAsync(WITHDRAWALS_FILE, wList);
      }
    }
  }

  static async findById(id: string): Promise<Withdrawal | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query('SELECT * FROM withdrawals WHERE id = $1', [id]);
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        amount: parseFloat(r.amount),
        pixKey: r.pix_key,
        pixKeyType: r.pix_key_type as any,
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined
      };
    } else {
      const list = getWithdrawalsCache();
      return list.find(w => w.id === id) || null;
    }
  }

  static async findPendingByUserId(userId: string): Promise<Withdrawal | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        "SELECT * FROM withdrawals WHERE user_id = $1 AND (status = 'pending' OR status = 'processing') LIMIT 1",
        [userId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        amount: parseFloat(r.amount),
        pixKey: r.pix_key,
        pixKeyType: r.pix_key_type as any,
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined
      };
    } else {
      const list = getWithdrawalsCache();
      return list.find(w => w.userId === userId && (w.status === 'pending' || w.status === 'processing')) || null;
    }
  }

  static async findLastByUserId(userId: string): Promise<Withdrawal | null> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        "SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
        [userId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        amount: parseFloat(r.amount),
        pixKey: r.pix_key,
        pixKeyType: r.pix_key_type as any,
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined
      };
    } else {
      const list = getWithdrawalsCache();
      const filtered = list.filter(w => w.userId === userId);
      if (filtered.length === 0) return null;
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    }
  }

  static async findAllByUserId(userId: string): Promise<Withdrawal[]> {
    if (isPostgresActive && pool) {
      const { rows } = await pool.query(
        'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        amount: parseFloat(r.amount),
        pixKey: r.pix_key,
        pixKeyType: r.pix_key_type as any,
        status: r.status as any,
        createdAt: new Date(r.created_at).toISOString(),
        approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined
      }));
    } else {
      const list = getWithdrawalsCache();
      return list
        .filter(w => w.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }
}
