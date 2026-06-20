import { useState, useEffect } from 'react';
import { BadgeAlert, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BoardState, Piece, MoveCoordinates, PlayerColor } from '../types';
import { getValidMoves, calculatePieceMoves, isValidCoordinate } from '../utils/checkers';

interface CheckersBoardProps {
  board: BoardState;
  turn: PlayerColor;
  userColor: PlayerColor | 'both'; // 'both' is used for sandbox simulation mode
  mustJumpPieceId: string | null;
  onMoveSubmitted: (move: MoveCoordinates) => void;
  gameActive: boolean;
}

export default function CheckersBoard({
  board,
  turn,
  userColor,
  mustJumpPieceId,
  onMoveSubmitted,
  gameActive,
}: CheckersBoardProps) {
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [highlightedMoves, setHighlightedMoves] = useState<MoveCoordinates[]>([]);
  const [allValidMoves, setAllValidMoves] = useState<MoveCoordinates[]>([]);

  // Calculate global valid moves for current player color whenever state or turn shifts
  useEffect(() => {
    if (!gameActive) {
      setAllValidMoves([]);
      return;
    }
    const currentColor = turn;
    const moves = getValidMoves(board.grid, currentColor, mustJumpPieceId);
    setAllValidMoves(moves);
    
    // Automatically reset visual selections if turn shifts
    setSelectedPiece((prev) => {
      // Keep if still turn turn of the same player AND still valid
      if (prev && prev.color === turn) {
        return prev;
      }
      return null;
    });
  }, [board, turn, mustJumpPieceId, gameActive]);

  // Handle piece selection
  const handlePieceClick = (piece: Piece) => {
    if (!gameActive) return;
    
    // Validate if turn matches the user's role color
    if (userColor !== 'both' && userColor !== piece.color) {
      return; // Not your piece!
    }

    if (piece.color !== turn) {
      return; // Not your turn!
    }

    // Double jump piece constraint check
    if (mustJumpPieceId && piece.id !== mustJumpPieceId) {
      return; // You must move the double-jump piece!
    }

    setSelectedPiece(piece);

    // Filter all global legal moves to those that belong to this selected piece
    const movesForThisPiece = allValidMoves.filter(
      (m) => m.from.row === piece.row && m.from.col === piece.col
    );
    setHighlightedMoves(movesForThisPiece);
  };

  // Keep highlighted moves updated when selected piece changes or turns alter
  useEffect(() => {
    if (!selectedPiece) {
      setHighlightedMoves([]);
      return;
    }
    const movesForThisPiece = allValidMoves.filter(
      (m) => m.from.row === selectedPiece.row && m.from.col === selectedPiece.col
    );
    setHighlightedMoves(movesForThisPiece);
  }, [selectedPiece, allValidMoves]);

  // Handle clicking on any square
  const handleCellClick = (row: number, col: number) => {
    // Check if there's a movement match
    const matchedMove = highlightedMoves.find((m) => m.to.row === row && m.to.col === col);
    if (matchedMove) {
      onMoveSubmitted(matchedMove);
      setSelectedPiece(null);
      setHighlightedMoves([]);
    } else {
      // Clicked outside legal targets, check if they clicked a friendly piece to switch selection
      const cellPiece = board.grid[row][col];
      if (cellPiece && cellPiece.color === turn) {
        handlePieceClick(cellPiece);
      } else {
        setSelectedPiece(null);
        setHighlightedMoves([]);
      }
    }
  };

  const isUserTurn = userColor === 'both' || userColor === turn;

  return (
    <div className="flex flex-col items-center">
      {/* Turn indicator and mandatory jumps alerts */}
      <div className="mb-4 w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0a0a0a] p-3 rounded-sm border border-stone-800">
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400">Vez de jogar:</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full inline-block shrink-0 ${
                turn === 'red' ? 'bg-[#b91c1c] shadow-[0_0_8px_rgba(185,28,28,0.7)]' : 'bg-stone-300 shadow-[0_0_8px_rgba(255,255,255,0.4)]'
              }`}
            />
            <span className="text-xs font-bold font-mono uppercase text-stone-200">
              {turn === 'red' ? 'Vermelhas' : 'Pretas'}
            </span>
            {isUserTurn && gameActive && (
              <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2.5 py-0.5 rounded-sm border border-amber-500/20 font-bold">
                SEU TURNO
              </span>
            )}
          </div>
        </div>

        {mustJumpPieceId && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-sm">
            <BadgeAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="font-medium">Mandatório concluir captura dupla!</span>
          </div>
        )}

        {gameActive && allValidMoves.some((m) => m.isJump) && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-550 bg-amber-500/5 border border-amber-500/20 px-2.5 py-1 rounded-sm">
            <Crown className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span className="font-semibold">Captura obrigatória ativa!</span>
          </div>
        )}
      </div>

      {/* 8x8 Grid Container - Tigrinho Golden Border */}
      <div className="relative p-0 bg-[#050505] rounded-sm w-full max-w-[580px] max-sm:max-w-[90vw] aspect-square shadow-[0_0_30px_rgba(250,191,24,0.15)]"
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

                      {/* Render Cell Pieces with sophisticated layout satin gradients */}
                      <AnimatePresence>
                        {piece && (
                          <motion.div
                            key={piece.id}
                            initial={{ scale: 0.3, opacity: 0 }}
                            animate={{ scale: isCellSelected ? 1.12 : 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            whileHover={{ scale: isCellSelected ? 1.15 : 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePieceClick(piece);
                            }}
                            className={`relative w-4/5 h-4/5 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 ${
                              piece.color === 'red'
                                ? 'bg-gradient-to-br from-[#9a1c1c] via-[#b91c1c] to-[#450a0a] border-2 border-[#f87171]/40'
                                : 'bg-gradient-to-br from-[#1a1a1a] via-[#111111] to-[#050505] border-2 border-stone-600/50'
                            } ${
                              isCellSelected
                                ? 'shadow-[0_0_25px_rgba(250,191,24,0.9)] border-[#FABF18] border-2 ring-2 ring-[#FABF18]/30'
                                : 'cursor-pointer hover:shadow-[0_0_12px_rgba(250,191,24,0.3)]'
                            } ${
                              mustJumpPieceId && piece.id !== mustJumpPieceId && piece.color === turn
                                ? 'opacity-40 filter grayscale'
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

                      {/* Highlighted Movement Indicator - Tigrinho Enhanced */}
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
