import { Piece, BoardState, MoveCoordinates, PlayerColor } from '../types';

/**
 * Initializes the standard checkers board.
 * - 8x8 grid.
 * - Black pieces in upper rows (0, 1, 2) on dark squares.
 * - Red pieces in lower rows (5, 6, 7) on dark squares.
 * - Squares are dark if (row + col) % 2 === 1.
 */
export function initializeBoard(): { pieces: Piece[]; grid: (Piece | null)[][] } {
  const pieces: Piece[] = [];
  const grid: (Piece | null)[][] = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));

  let redId = 0;
  let blackId = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) {
          // Black piece
          const piece: Piece = {
            id: `black-${blackId++}`,
            color: 'black',
            isKing: false,
            row: r,
            col: c,
          };
          pieces.push(piece);
          grid[r][c] = piece;
        } else if (r > 4) {
          // Red piece
          const piece: Piece = {
            id: `red-${redId++}`,
            color: 'red',
            isKing: false,
            row: r,
            col: c,
          };
          pieces.push(piece);
          grid[r][c] = piece;
        }
      }
    }
  }

  return { pieces, grid };
}

/**
 * Checks if a coordinate is within the board boundaries.
 */
export function isValidCoordinate(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/**
 * Returns all valid moves for a specific player color.
 * Enforces mandatory captures: if any jump move exists for ANY of the player's pieces,
 * only jump moves are considered valid!
 */
export function getValidMoves(
  grid: (Piece | null)[][],
  color: PlayerColor,
  mustJumpPieceId: string | null = null
): MoveCoordinates[] {
  let jumpMoves: MoveCoordinates[] = [];
  let normalMoves: MoveCoordinates[] = [];

  // 1. Gather all pieces belonging to this color
  const playerPieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = grid[r][c];
      if (p && p.color === color) {
        playerPieces.push(p);
      }
    }
  }

  // If a piece is locked in a multi-jump sequence, ONLY that piece can continue jumping
  const activePieces = mustJumpPieceId
    ? playerPieces.filter((p) => p.id === mustJumpPieceId)
    : playerPieces;

  for (const piece of activePieces) {
    const pieceMoves = calculatePieceMoves(grid, piece);
    for (const m of pieceMoves) {
      if (m.isJump) {
        jumpMoves.push(m);
      } else {
        normalMoves.push(m);
      }
    }
  }

  // Checkers Rule: If there are ANY jump moves, they are MANDATORY.
  if (jumpMoves.length > 0) {
    // Standard rule: In Brazilian checkers, capturing the maximum number of pieces is mandatory.
    // For simplicity and fluid play, we enforce that jumps are mandatory.
    return jumpMoves;
  }

  // If we are locked in a double-jump sequence, but no jump moves are available, 
  // that shouldn't happen, but lock restricts normal moves.
  if (mustJumpPieceId) {
    return [];
  }

  return normalMoves;
}

/**
 * Calculates all possible moves for a specific piece, ignoring mandatory constraints.
 */
export function calculatePieceMoves(grid: (Piece | null)[][], piece: Piece): MoveCoordinates[] {
  const moves: MoveCoordinates[] = [];
  const { row, col, color, isKing } = piece;

  if (!isKing) {
    // Normal Checkers Rules (Brazilian/International Variant):
    // - Walk forward 1 step diagonally.
    // - Jump 2 steps in ANY of the 4 diagonal directions (can jump backward!)
    
    // Normal moves (forward only)
    const forwardDirection = color === 'red' ? -1 : 1;
    const stepCols = [-1, 1];
    for (const dc of stepCols) {
      const tr = row + forwardDirection;
      const tc = col + dc;
      if (isValidCoordinate(tr, tc) && grid[tr][tc] === null) {
        moves.push({
          from: { row, col },
          to: { row: tr, col: tc },
          capturedPieceIds: [],
          isJump: false,
        });
      }
    }

    // Capture jumps (all 4 diagonal directions)
    const directions = [
      { dr: -1, dc: -1 },
      { dr: -1, dc: 1 },
      { dr: 1, dc: -1 },
      { dr: 1, dc: 1 },
    ];

    for (const { dr, dc } of directions) {
      const neighborRow = row + dr;
      const neighborCol = col + dc;
      const targetRow = row + 2 * dr;
      const targetCol = col + 2 * dc;

      if (isValidCoordinate(targetRow, targetCol)) {
        const neighbor = grid[neighborRow][neighborCol];
        const target = grid[targetRow][targetCol];

        if (neighbor && neighbor.color !== color && target === null) {
          moves.push({
            from: { row, col },
            to: { row: targetRow, col: targetCol },
            capturedPieceIds: [neighbor.id],
            isJump: true,
          });
        }
      }
    }
  } else {
    // King (Dama) Rules:
    // - Can move any distance diagonally (slide like a Bishop in chess).
    // - Can jump over an opponent piece at any diagonal distance and land in any free square behind it.
    const directions = [
      { dr: -1, dc: -1 },
      { dr: -1, dc: 1 },
      { dr: 1, dc: -1 },
      { dr: 1, dc: 1 },
    ];

    for (const { dr, dc } of directions) {
      let r = row + dr;
      let c = col + dc;
      let opponentSeen: Piece | null = null;
      let blocked = false;

      while (isValidCoordinate(r, c) && !blocked) {
        const item = grid[r][c];

        if (item === null) {
          if (!opponentSeen) {
            // normal slide
            moves.push({
              from: { row, col },
              to: { row: r, col: c },
              capturedPieceIds: [],
              isJump: false,
            });
          } else {
            // jump landing slot
            moves.push({
              from: { row, col },
              to: { row: r, col: c },
              capturedPieceIds: [opponentSeen.id],
              isJump: true,
            });
          }
        } else {
          // There is a piece
          if (item.color === color) {
            // Blocked by friendly piece
            blocked = true;
          } else {
            // Blocked by opponent piece
            if (opponentSeen) {
              // Can't jump over two pieces in the same diagonal!
              blocked = true;
            } else {
              opponentSeen = item;
            }
          }
        }

        r += dr;
        c += dc;
      }
    }
  }

  return moves;
}

/**
 * Executes a move on the board, modifying the board grid.
 * Returns:
 * - updatedGrid: the new grid
 * - promotedToKing: whether the piece was promoted to king
 * - nextSpecialMustJumpPieceId: if the piece can double jump, returns its ID, else null
 */
export function executeMove(
  grid: (Piece | null)[][],
  move: MoveCoordinates
): {
  grid: (Piece | null)[][];
  promotedToKing: boolean;
  nextSpecialMustJumpPieceId: string | null;
} {
  // Deep clone grid
  const nextGrid = grid.map((r) => r.map((cell) => (cell ? { ...cell } : null)));

  const { from, to, capturedPieceIds, isJump } = move;
  const movingPiece = nextGrid[from.row][from.col];

  if (!movingPiece) {
    throw new Error('No piece found on source square');
  }

  // Remove moving piece from old square
  nextGrid[from.row][from.col] = null;

  // Perform captures
  for (const capId of capturedPieceIds) {
    // find captured piece on board and delete it
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (nextGrid[r][c]?.id === capId) {
          nextGrid[r][c] = null;
        }
      }
    }
  }

  // Promotion logic
  let promotedToKing = false;
  let isPieceKingNow = movingPiece.isKing;
  if (!movingPiece.isKing) {
    if (movingPiece.color === 'red' && to.row === 0) {
      promotedToKing = true;
      isPieceKingNow = true;
    } else if (movingPiece.color === 'black' && to.row === 7) {
      promotedToKing = true;
      isPieceKingNow = true;
    }
  }

  // Update piece state
  const updatedPiece: Piece = {
    ...movingPiece,
    row: to.row,
    col: to.col,
    isKing: isPieceKingNow,
  };

  // Place in target square
  nextGrid[to.row][to.col] = updatedPiece;

  // Double jump checker:
  // ONLY if this move was a jump, check if the SAME piece has more jumps.
  let nextSpecialMustJumpPieceId: string | null = null;
  if (isJump) {
    const furtherMovesOfSamePiece = calculatePieceMoves(nextGrid, updatedPiece);
    const furtherJumps = furtherMovesOfSamePiece.filter((m) => m.isJump);

    // Standard rule: if further jumps are available for this specific piece, 
    // it MUST double-jump!
    if (furtherJumps.length > 0) {
      nextSpecialMustJumpPieceId = updatedPiece.id;
    }
  }

  return {
    grid: nextGrid,
    promotedToKing,
    nextSpecialMustJumpPieceId,
  };
}

/**
 * Checks if a player has any active pieces or valid moves.
 * If they have no pieces or no valid moves, they lose!
 */
export function checkGameOver(grid: (Piece | null)[][], currentTurnColor: PlayerColor): {
  isGameOver: boolean;
  winner: PlayerColor | null;
  reason: string;
} {
  // 1. Check if anyone has zero pieces
  let redCount = 0;
  let blackCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = grid[r][c];
      if (cell) {
        if (cell.color === 'red') redCount++;
        if (cell.color === 'black') blackCount++;
      }
    }
  }

  if (redCount === 0) {
    return { isGameOver: true, winner: 'black', reason: 'As vermelhas foram totalmente capturadas!' };
  }
  if (blackCount === 0) {
    return { isGameOver: true, winner: 'red', reason: 'As pretas foram totalmente capturadas!' };
  }

  // 2. Check if current turn player is blocked (has pieces but no valid moves)
  const availableMoves = getValidMoves(grid, currentTurnColor);
  if (availableMoves.length === 0) {
    const winner: PlayerColor = currentTurnColor === 'red' ? 'black' : 'red';
    return {
      isGameOver: true,
      winner,
      reason: `As ${currentTurnColor === 'red' ? 'Vermelhas' : 'Pretas'} não possuem movimentos válidos (Bloqueio)!`,
    };
  }

  return { isGameOver: false, winner: null, reason: '' };
}
