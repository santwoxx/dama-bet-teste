export type PlayerColor = 'red' | 'black';

export interface Piece {
  id: string;
  color: PlayerColor;
  isKing: boolean;
  row: number;
  col: number;
}

export interface BoardState {
  grid: (Piece | null)[][];
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  balance: number;
  lockedBalance?: number;
  email?: string;
  botGamesPlayed?: number;
  bonusBalance?: number;
  rolloverRequired?: number;
  rolloverWagered?: number;
  passwordHash?: string;
  passwordSalt?: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'bet_lock' | 'win_payout' | 'draw_refund' | 'cancel_refund' | 'fee';
  amount: number;
  description: string;
  createdAt: string;
  gameId?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

export type GameStatus = 
  | 'waiting_for_challenger'
  | 'bet_confirmation'
  | 'active'
  | 'finished'
  | 'cancelled';

export interface Game {
  id: string;
  isBotGame?: boolean;
  betAmount: number;
  platformFee: number;
  prizePool: number;
  status: GameStatus;
  isPrivate?: boolean;
  
  host: Player;
  guest: Player | null;
  
  hostReady: boolean;
  guestReady: boolean;
  
  board: BoardState;
  pieces: Piece[];
  turn: PlayerColor;
  winnerId: string | null;
  drawVotedBy: string[];
  
  createdAt: string;
  startedAt?: string;
  lastMoveAt?: string;
  log: string[];
  chat: Message[];
  
  mustJumpPieceIdByTurn: string | null;
}

export interface MoveCoordinates {
  from: { row: number; col: number };
  to: { row: number; col: number };
  capturedPieceIds: string[];
  isJump: boolean;
}

export interface Deposit {
  id: string;
  userId: string;
  mpPaymentId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  approvedAt?: string;
  expirationAt: string;
  // Set when the player clicks "Já paguei" — signals the admin queue that this
  // deposit is actually awaiting review, not just an abandoned generated code.
  userConfirmedAt?: string;
}

export interface WebhookEvent {
  id: string;
  mpPaymentId: string;
  eventType: string;
  processedAt: string;
}

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  pixKey: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'cancelled' | 'failed';
  createdAt: string;
  approvedAt?: string;
}
