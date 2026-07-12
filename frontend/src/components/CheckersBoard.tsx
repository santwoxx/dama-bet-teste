import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import { BadgeAlert, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BoardState, Piece, MoveCoordinates, PlayerColor } from '../types';
import { getValidMoves } from '../utils/checkers';

interface CheckersBoardProps {
  board: BoardState;
  turn: PlayerColor;
  userColor: PlayerColor | 'both';
  mustJumpPieceId: string | null;
  onMoveSubmitted: (move: MoveCoordinates) => void;
  gameActive: boolean;
}

function CheckersBoard({
  board,
  turn,
  userColor,
  mustJumpPieceId,
  onMoveSubmitted,
  gameActive,
}: CheckersBoardProps) {
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);

  const allValidMoves = useMemo(() => {
    if (!gameActive) return [];
    return getValidMoves(board.grid, turn, mustJumpPieceId);
  }, [board.grid, turn, mustJumpPieceId, gameActive]);

  const prevTurn = useRef(turn);
  useEffect(() => {
    if (prevTurn.current !== turn) {
      setSelectedPiece((prev) => {
        if (prev && prev.color === turn) return prev;
        return null;
      });
      prevTurn.current = turn;
    }
  }, [turn]);

  const highlightedMoves = useMemo(() => {
    if (!selectedPiece) return [];
    return allValidMoves.filter(
      (m) => m.from.row === selectedPiece.row && m.from.col === selectedPiece.col
    );
  }, [selectedPiece, allValidMoves]);

  const handlePieceClick = useCallback((piece: Piece) => {
    if (!gameActive) return;
    if (userColor !== 'both' && userColor !== piece.color) return;
    if (piece.color !== turn) return;
    if (mustJumpPieceId && piece.id !== mustJumpPieceId) return;
    
    const hasMoves = allValidMoves.some(m => m.from.row === piece.row && m.from.col === piece.col);
    if (!hasMoves) return;

    setSelectedPiece(piece);
  }, [gameActive, userColor, turn, mustJumpPieceId, allValidMoves]);

  const handleCellClick = useCallback((row: number, col: number) => {
    const matchedMove = highlightedMoves.find((m) => m.to.row === row && m.to.col === col);
    if (matchedMove) {
      onMoveSubmitted(matchedMove);
      setSelectedPiece(null);
    } else {
      const cellPiece = board.grid[row][col];
      if (cellPiece && cellPiece.color === turn) {
        handlePieceClick(cellPiece);
      } else {
        setSelectedPiece(null);
      }
    }
  }, [highlightedMoves, onMoveSubmitted, board.grid, turn, handlePieceClick]);

  const isUserTurn = userColor === 'both' || userColor === turn;

  return (
    <div className="flex flex-col items-center">
      {/* Enhanced Turn indicator and mandatory jumps alerts */}
      {gameActive ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={turn + isUserTurn.toString()}
            initial={{ scale: 0.95, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className={`mb-6 w-full flex flex-col items-center justify-center p-4 sm:p-5 rounded-lg border-2 ${
              isUserTurn
                ? 'bg-gradient-to-r from-amber-600/10 via-amber-500/20 to-amber-600/10 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.25)]'
                : 'bg-stone-900 border-stone-700 shadow-xl'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-5 h-5 rounded-full inline-block shrink-0 border-2 border-white/20 ${
                  turn === 'red' ? 'bg-[#b91c1c] shadow-[0_0_15px_rgba(185,28,28,0.8)]' : 'bg-stone-300 shadow-[0_0_15px_rgba(255,255,255,0.6)]'
                }`}
              />
              <span className={`text-2xl sm:text-3xl font-black uppercase tracking-widest ${isUserTurn ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]' : 'text-stone-300'}`}>
                {userColor === 'both' ? `Vez das ${turn === 'red' ? 'Vermelhas' : 'Pretas'}` : isUserTurn ? 'Sua Vez!' : 'Vez do Oponente'}
              </span>
            </div>

            {(mustJumpPieceId || allValidMoves.some((m) => m.isJump)) && (
              <div className="flex gap-3 mt-3">
                {mustJumpPieceId ? (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-400 bg-amber-500/10 border border-amber-500/40 px-4 py-1.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                    <BadgeAlert className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 animate-pulse" />
                    <span className="font-bold uppercase tracking-wider">Continue a captura!</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-red-400 bg-red-500/10 border border-red-500/40 px-4 py-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                    <BadgeAlert className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 animate-pulse" />
                    <span className="font-bold uppercase tracking-wider">Captura Obrigatória!</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="mb-4 w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0a0a0a] p-3 rounded-sm border border-stone-800">
          <span className="text-stone-400 font-medium">Aguardando início da partida...</span>
        </div>
      )}

      {/* 8x8 Grid Container - Premium Golden Border */}
      <div className="relative p-0 bg-[#050505] rounded-sm w-full max-w-[580px] max-sm:max-w-[96vw] mx-auto aspect-square shadow-[0_0_30px_rgba(250,191,24,0.15)] touch-none select-none [-webkit-tap-highlight-color:transparent]"
        style={{
          border: '6px solid',
          borderImage: 'linear-gradient(135deg, #FABF18, #d97706, #FABF18, #f59e0b) 1',
          borderRadius: '4px',
        }}
      >
        <div className="absolute -inset-[3px] rounded-sm bg-gradient-to-br from-[#FABF18]/10 via-transparent to-[#FABF18]/5 pointer-events-none" />
        <div className="grid h-full w-full rounded-none overflow-hidden" style={{ gridTemplateColumns: `repeat(${board.grid.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${board.grid.length}, minmax(0, 1fr))` }}>
          {board.grid.map((row, r) =>
            row.map((piece, c) => {
                  const isDark = (r + c) % 2 === 1;
                  
                  const isCellSelected = selectedPiece && selectedPiece.row === r && selectedPiece.col === c;
                  const isCellHighlighted = highlightedMoves.some((m) => m.to.row === r && m.to.col === c);

                  return (
                    <div
                      key={`${r}-${c}`}
                      onClick={() => handleCellClick(r, c)}
                      className={`relative aspect-square w-full select-none flex items-center justify-center transition-all ${
                        isDark ? 'bg-[#3d2b1f]' : 'bg-[#c4a484]'
                      } ${isCellHighlighted ? 'cursor-pointer' : ''}`}
                    >
                      {/* Grid Coords indicators (top-left of block, subtle) */}
                      {c === 0 && (
                        <div className={`absolute top-1 left-1 text-[8px] opacity-40 font-mono pointer-events-none ${isDark ? 'text-stone-400' : 'text-stone-800'}`}>
                          {r + 1}
                        </div>
                      )}
                      {r === board.grid.length - 1 && (
                        <div className={`absolute bottom-1 right-1 text-[8px] opacity-40 font-mono pointer-events-none ${isDark ? 'text-stone-400' : 'text-stone-800'}`}>
                          {String.fromCharCode(65 + c)}
                        </div>
                      )}

                      {/* Render Cell Pieces with sophisticated layout satin gradients.
                          `layout` + a shared `layoutId` makes a piece glide from its old
                          cell to its new one (FLIP transition) instead of popping out and
                          back in — this is what makes moves/captures read as "premium". */}
                      <AnimatePresence>
                        {piece && (
                          <motion.div
                            key={piece.id}
                            layout
                            layoutId={piece.id}
                            initial={{ scale: 0.3, opacity: 0 }}
                            animate={{ scale: isCellSelected ? 1.12 : 1, opacity: 1 }}
                            exit={{ scale: 1.35, opacity: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
                            whileHover={{ scale: isCellSelected ? 1.15 : 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 }, default: { type: 'spring', stiffness: 350, damping: 25 } }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePieceClick(piece);
                            }}
                            className={`relative w-4/5 h-4/5 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${
                              piece.color === 'red'
                                ? 'bg-gradient-to-br from-[#9a1c1c] via-[#b91c1c] to-[#450a0a] border-2 border-[#f87171]/40'
                                : 'bg-gradient-to-br from-[#525252] via-[#262626] to-[#0a0a0a] border-[2.5px] border-stone-400/90 shadow-[0_4px_12px_rgba(0,0,0,0.8)]'
                            } ${
                              isCellSelected
                                ? 'shadow-[0_0_25px_rgba(250,191,24,0.9)] border-[#FABF18] border-2 ring-2 ring-[#FABF18]/30'
                                : 'cursor-pointer hover:shadow-[0_0_12px_rgba(250,191,24,0.3)]'
                            } ${
                              piece.color === turn && !allValidMoves.some(m => m.from.row === piece.row && m.from.col === piece.col)
                                ? 'opacity-40 filter grayscale cursor-not-allowed'
                                : ''
                            }`}
                          >
                            {/* Inside metallic concentric rings */}
                            <div className="absolute inset-2 rounded-full border border-black/20 flex items-center justify-center">
                              <div className="absolute inset-1.5 rounded-full border border-white/5" />
                            </div>

                            {/* King crown icon indicator */}
                            {piece.isKing && (
                              <motion.div 
                                initial={{ scale: 0.5, rotate: -25 }}
                                animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                className="z-10 text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] filter"
                              >
                                <Crown className="w-5 h-5 font-bold fill-amber-400" />
                              </motion.div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Highlighted Movement Indicator - Premium Enhanced */}
                      {isCellHighlighted && (
                        <div className="absolute inset-0 z-15 flex items-center justify-center bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 backdrop-brightness-110">
                          {/* Inner pulsating target ring with golden glow */}
                          <motion.div 
                            animate={{ scale: [0.8, 1.35, 0.8] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-[#FABF18] border-2 border-stone-950 shadow-[0_0_20px_rgba(250,191,24,0.9)]" 
                          />
                          <motion.div
                            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="absolute w-8 h-8 rounded-full border border-[#FABF18]/30"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
            )}
        </div>
      </div>

      {/* Cheatsheet brief guide */}
      <p className="mt-3 text-[10px] text-stone-550 font-mono text-center">
        Clique na sua peça para ver os caminhos válidos. Damas (👑) andam múltiplas casas. Captura de peças rival é obrigatória!
      </p>
    </div>
  );
}

function boardGridChanged(prev: BoardState, next: BoardState) {
  if (prev.grid.length !== next.grid.length) return true;
  if (prev.grid[0]?.length !== next.grid[0]?.length) return true;
  for (let r = 0; r < prev.grid.length; r++) {
    for (let c = 0; c < prev.grid[r].length; c++) {
      const a = prev.grid[r][c];
      const b = next.grid[r][c];
      if (a === b) continue;
      if (!a || !b) return true;
      if (a.id !== b.id || a.row !== b.row || a.col !== b.col || a.color !== b.color || a.isKing !== b.isKing) return true;
    }
  }
  return false;
}

export default memo(CheckersBoard, (prev, next) => {
  if (prev.gameActive !== next.gameActive) return false;
  if (prev.turn !== next.turn) return false;
  if (prev.mustJumpPieceId !== next.mustJumpPieceId) return false;
  if (prev.userColor !== next.userColor) return false;
  if (boardGridChanged(prev.board, next.board)) return false;
  return true;
});
