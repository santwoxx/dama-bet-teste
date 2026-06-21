import { Piece, BoardState, MoveCoordinates, PlayerColor } from '../types.js';

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

export function isValidCoordinate(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function getValidMoves(
  grid: (Piece | null)[][],
  color: PlayerColor,
  mustJumpPieceId: string | null = null
): MoveCoordinates[] {
  let jumpMoves: MoveCoordinates[] = [];
  let normalMoves: MoveCoordinates[] = [];

  const playerPieces: Piece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = grid[r][c];
      if (p && p.color === color) {
        playerPieces.push(p);
      }
    }
  }

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

  if (jumpMoves.length > 0) {
    return jumpMoves;
  }

  if (mustJumpPieceId) {
    return [];
  }

  return normalMoves;
}

export function calculatePieceMoves(grid: (Piece | null)[][], piece: Piece): MoveCoordinates[] {
  const moves: MoveCoordinates[] = [];
  const { row, col, color, isKing } = piece;

  if (!isKing) {
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
            moves.push({
              from: { row, col },
              to: { row: r, col: c },
              capturedPieceIds: [],
              isJump: false,
            });
          } else {
            moves.push({
              from: { row, col },
              to: { row: r, col: c },
              capturedPieceIds: [opponentSeen.id],
              isJump: true,
            });
          }
        } else {
          if (item.color === color) {
            blocked = true;
          } else {
            if (opponentSeen) {
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

export function executeMove(
  grid: (Piece | null)[][],
  move: MoveCoordinates
): {
  grid: (Piece | null)[][];
  promotedToKing: boolean;
  nextSpecialMustJumpPieceId: string | null;
} {
  const nextGrid = grid.map((r) => r.map((cell) => (cell ? { ...cell } : null)));

  const { from, to, capturedPieceIds, isJump } = move;
  const movingPiece = nextGrid[from.row][from.col];

  if (!movingPiece) {
    throw new Error('No piece found on source square');
  }

  nextGrid[from.row][from.col] = null;

  for (const capId of capturedPieceIds) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (nextGrid[r][c]?.id === capId) {
          nextGrid[r][c] = null;
        }
      }
    }
  }

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

  const updatedPiece: Piece = {
    ...movingPiece,
    row: to.row,
    col: to.col,
    isKing: isPieceKingNow,
  };

  nextGrid[to.row][to.col] = updatedPiece;

  let nextSpecialMustJumpPieceId: string | null = null;
  if (isJump) {
    const furtherMovesOfSamePiece = calculatePieceMoves(nextGrid, updatedPiece);
    const furtherJumps = furtherMovesOfSamePiece.filter((m) => m.isJump);

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

export function checkGameOver(grid: (Piece | null)[][], currentTurnColor: PlayerColor): {
  isGameOver: boolean;
  winner: PlayerColor | null;
  reason: string;
} {
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

export function isCellVulnerable(grid: (Piece | null)[][], row: number, col: number, color: PlayerColor): boolean {
  const oppColor = color === 'red' ? 'black' : 'red';
  const directions = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: 1 },
    { dr: 1, dc: -1 },
    { dr: 1, dc: 1 }
  ];
  for (const { dr, dc } of directions) {
    const oppRow = row + dr;
    const oppCol = col + dc;
    if (oppRow >= 0 && oppRow < 8 && oppCol >= 0 && oppCol < 8) {
      const p = grid[oppRow][oppCol];
      if (p && p.color === oppColor) {
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

export function evaluateOneStepMove(grid: (Piece | null)[][], color: PlayerColor, move: MoveCoordinates): number {
  let score = 0;
  if (move.isJump) {
    score += move.capturedPieceIds.length * 100;
  }
  const movingPiece = grid[move.from.row][move.from.col];
  if (movingPiece) {
    if (!movingPiece.isKing && move.to.row === (color === 'red' ? 0 : 7)) {
      score += 80;
    }
    const isCenter = move.to.row >= 2 && move.to.row <= 5 && move.to.col >= 2 && move.to.col <= 5;
    if (isCenter) {
      score += 5;
    }
    if (isCellVulnerable(grid, move.to.row, move.to.col, color)) {
      score -= 50;
    }
    if (movingPiece.row === (color === 'red' ? 7 : 0)) {
      score -= 10;
    }
  }
  return score;
}

export function evaluateBoard(grid: (Piece | null)[][], forColor: PlayerColor): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = grid[r][c];
      if (piece) {
        let pieceVal = 0;
        if (piece.isKing) {
          pieceVal += 35;
        } else {
          pieceVal += 10;
          const advancement = piece.color === 'black' ? r : 7 - r;
          pieceVal += advancement * 1.5;
        }
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

export function minimax(
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
  const oppColor: PlayerColor = color === 'red' ? 'black' : 'red';
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
      const nextMax = !!nextMustJump;
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
      const nextMax = !nextMustJump;
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

export function selectMinimaxMove(
  grid: (Piece | null)[][],
  color: PlayerColor,
  moves: MoveCoordinates[],
  depth: number
): MoveCoordinates {
  if (moves.length === 1) return moves[0];
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const { grid: nextGrid, nextSpecialMustJumpPieceId } = executeMove(grid, m);
    const nextMustJump = nextSpecialMustJumpPieceId;
    const nextMax = !!nextMustJump;
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

export function selectSmartBotMove(
  grid: (Piece | null)[][],
  color: PlayerColor,
  moves: MoveCoordinates[],
  botGamesPlayed: number
): MoveCoordinates {
  if (moves.length === 1) return moves[0];
  if (botGamesPlayed === 0) {
    if (Math.random() < 0.5) {
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
  if (botGamesPlayed === 1) {
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
  // Hard/Impossible difficulty uses optimized Minimax depth 4 instead of 5 to avoid blocking event loop
  return selectMinimaxMove(grid, color, moves, 4);
}
