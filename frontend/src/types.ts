export type PlayerColor = 'red' | 'black';

export interface Piece {
  id: string; // unique piece id (e.g., 'red-0', 'black-11')
  color: PlayerColor;
  isKing: boolean;
  row: number;
  col: number;
}

export interface BoardState {
  // We can represent the board as an 8x8 grid of cell contents: Piece or null
  grid: (Piece | null)[][];
}

export interface Player {
  id: string;
  name: string;
  avatar: string; // url or keyword
  balance: number; // simulated wallet balance
  lockedBalance?: number;
  email?: string;
  botGamesPlayed?: number;
  bonusBalance?: number;
  rolloverRequired?: number;
  rolloverWagered?: number;
  isAdmin?: boolean;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bet_lock' | 'win_payout' | 'draw_refund' | 'cancel_refund' | 'fee';
  amount: number;
  gameId?: string;
  timestamp: string;
  description: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

export type GameStatus = 
  | 'waiting_for_challenger' // Room created, waiting for player B
  | 'bet_confirmation'       // Challenger joined, waiting for both to lock deposit
  | 'active'                 // Game in progress
  | 'finished'               // Game complete (win/loss/draw)
  | 'cancelled';             // Cancelled by host before challenge

export interface Game {
  id: string;
  isBotGame?: boolean;
  betAmount: number; // e.g. R$ 10
  platformFee: number; // e.g. R$ 2 (10% of total)
  prizePool: number; // e.g. R$ 18 (90% of total)
  status: GameStatus;
  
  host: Player; // Player A
  guest: Player | null; // Player B
  
  hostReady: boolean; // Confirmed bet
  guestReady: boolean; // Confirmed bet
  
  board: BoardState;
  pieces: Piece[]; // Flat array of active pieces
  turn: PlayerColor;
  winnerId: string | null;
  drawVotedBy: string[]; // Players who voted for a draw (needs both to agree)
  
  createdAt: string;
  startedAt?: string;
  lastMoveAt?: string;
  log: string[]; // Gameplay history messages
  chat: Message[]; // In-game chat
  
  // Highlighting selected piece and potential moves
  selectedPieceId?: string | null;
  highlightedMoves?: MoveCoordinates[];
  
  // Double-jump state: if a piece must perform another jump, store its ID
  mustJumpPieceIdByTurn: string | null;
}

export interface MoveCoordinates {
  from: { row: number; col: number };
  to: { row: number; col: number };
  capturedPieceIds: string[]; // pieces model captured in this jump path
  isJump: boolean;
}

export interface AppState {
  currentUser: Player | null;
  activeGame: Game | null;
  lobbyGames: Game[];
  transactions: Transaction[];
  selectedGameId: string | null;
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
