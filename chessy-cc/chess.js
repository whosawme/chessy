// ── Chess Engine ──────────────────────────────────────────────────────────────
const W = 'w', B = 'b';
const PAWN = 'p', KNIGHT = 'n', BISHOP = 'b', ROOK = 'r', QUEEN = 'q', KING = 'k';

const PIECE_UNICODE = {
  wp: '\u2659', wn: '\u2658', wb: '\u2657', wr: '\u2656', wq: '\u2655', wk: '\u2654',
  bp: '\u265F', bn: '\u265E', bb: '\u265D', br: '\u265C', bq: '\u265B', bk: '\u265A',
};

function createGame() {
  const game = {
    board: Array(64).fill(null),
    turn: W,
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: -1,
    halfMoves: 0,
    history: [],
    capturedWhite: [],  // white pieces captured (by black)
    capturedBlack: [],  // black pieces captured (by white)
    gameOver: null,     // null | 'checkmate' | 'stalemate' | 'draw'
    winner: null,
  };
  setupInitial(game);
  return game;
}

function setupInitial(g) {
  const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let i = 0; i < 8; i++) {
    g.board[i]      = { color: B, type: back[i] };
    g.board[8 + i]  = { color: B, type: PAWN };
    g.board[48 + i] = { color: W, type: PAWN };
    g.board[56 + i] = { color: W, type: back[i] };
  }
}

// Helpers
const rank = sq => sq >> 3;
const file = sq => sq & 7;
const onBoard = sq => sq >= 0 && sq < 64;
const sq = (r, f) => r * 8 + f;

function getPiece(g, s) { return g.board[s]; }

// ── Attack / Threat Map ──────────────────────────────────────────────────────
// Returns number of times `color` attacks each square (64-element array)
function computeAttacks(g, color) {
  const attacks = new Int8Array(64);
  for (let s = 0; s < 64; s++) {
    const p = g.board[s];
    if (!p || p.color !== color) continue;
    const targets = getAttackedSquares(g, s, p);
    for (const t of targets) attacks[t]++;
  }
  return attacks;
}

function getAttackedSquares(g, s, p) {
  const out = [];
  const r = rank(s), f = file(s);

  if (p.type === PAWN) {
    const dir = p.color === W ? -1 : 1;
    if (f > 0) out.push(sq(r + dir, f - 1));
    if (f < 7) out.push(sq(r + dir, f + 1));
    return out;
  }
  if (p.type === KNIGHT) {
    for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nf = f + df;
      if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) out.push(sq(nr, nf));
    }
    return out;
  }
  if (p.type === KING) {
    for (let dr = -1; dr <= 1; dr++)
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) out.push(sq(nr, nf));
      }
    return out;
  }

  const dirs = [];
  if (p.type === BISHOP || p.type === QUEEN) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
  if (p.type === ROOK   || p.type === QUEEN) dirs.push([-1,0],[1,0],[0,-1],[0,1]);
  for (const [dr, df] of dirs) {
    let nr = r + dr, nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      out.push(sq(nr, nf));
      if (g.board[sq(nr, nf)]) break; // blocked
      nr += dr; nf += df;
    }
  }
  return out;
}

// ── Move Generation ──────────────────────────────────────────────────────────
function isSquareAttackedBy(g, s, color) {
  // Quick check: is square s attacked by `color`?
  for (let i = 0; i < 64; i++) {
    const p = g.board[i];
    if (!p || p.color !== color) continue;
    if (getAttackedSquares(g, i, p).includes(s)) return true;
  }
  return false;
}

function findKing(g, color) {
  for (let i = 0; i < 64; i++) {
    const p = g.board[i];
    if (p && p.color === color && p.type === KING) return i;
  }
  return -1;
}

function inCheck(g, color) {
  const ks = findKing(g, color);
  return ks >= 0 && isSquareAttackedBy(g, ks, color === W ? B : W);
}

// Generate all legal moves for current turn
function generateMoves(g) {
  const moves = [];
  const color = g.turn;
  for (let s = 0; s < 64; s++) {
    const p = g.board[s];
    if (!p || p.color !== color) continue;
    const pseudos = pseudoLegalMoves(g, s, p);
    for (const m of pseudos) {
      if (isLegal(g, m)) moves.push(m);
    }
  }
  return moves;
}

function pseudoLegalMoves(g, s, p) {
  const moves = [];
  const r = rank(s), f = file(s);
  const enemy = p.color === W ? B : W;

  if (p.type === PAWN) {
    const dir = p.color === W ? -1 : 1;
    const startRank = p.color === W ? 6 : 1;
    const promoRank = p.color === W ? 0 : 7;
    // Forward
    const fwd = sq(r + dir, f);
    if (!g.board[fwd]) {
      if (rank(fwd) === promoRank) {
        for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT])
          moves.push({ from: s, to: fwd, promotion: pr });
      } else {
        moves.push({ from: s, to: fwd });
      }
      // Double push
      if (r === startRank) {
        const fwd2 = sq(r + 2 * dir, f);
        if (!g.board[fwd2]) moves.push({ from: s, to: fwd2, enPassantSquare: fwd });
      }
    }
    // Captures
    for (const df of [-1, 1]) {
      const nf = f + df;
      if (nf < 0 || nf > 7) continue;
      const cs = sq(r + dir, nf);
      const target = g.board[cs];
      if (target && target.color === enemy) {
        if (rank(cs) === promoRank) {
          for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT])
            moves.push({ from: s, to: cs, promotion: pr });
        } else {
          moves.push({ from: s, to: cs });
        }
      }
      // En passant
      if (cs === g.enPassant) {
        moves.push({ from: s, to: cs, isEnPassant: true });
      }
    }
    return moves;
  }

  if (p.type === KNIGHT) {
    for (const [dr, df] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nf = f + df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
      const ts = sq(nr, nf);
      const t = g.board[ts];
      if (!t || t.color === enemy) moves.push({ from: s, to: ts });
    }
    return moves;
  }

  if (p.type === KING) {
    for (let dr = -1; dr <= 1; dr++)
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const nr = r + dr, nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
        const ts = sq(nr, nf);
        const t = g.board[ts];
        if (!t || t.color === enemy) moves.push({ from: s, to: ts });
      }
    // Castling
    const br = p.color === W ? 7 : 0;
    if (r === br && f === 4) {
      const opp = p.color === W ? B : W;
      // Kingside
      const ckk = p.color === W ? 'wk' : 'bk';
      if (g.castling[ckk] && !g.board[sq(br,5)] && !g.board[sq(br,6)]
          && !isSquareAttackedBy(g, sq(br,4), opp) && !isSquareAttackedBy(g, sq(br,5), opp) && !isSquareAttackedBy(g, sq(br,6), opp))
        moves.push({ from: s, to: sq(br,6), isCastle: 'k' });
      // Queenside
      const ckq = p.color === W ? 'wq' : 'bq';
      if (g.castling[ckq] && !g.board[sq(br,3)] && !g.board[sq(br,2)] && !g.board[sq(br,1)]
          && !isSquareAttackedBy(g, sq(br,4), opp) && !isSquareAttackedBy(g, sq(br,3), opp) && !isSquareAttackedBy(g, sq(br,2), opp))
        moves.push({ from: s, to: sq(br,2), isCastle: 'q' });
    }
    return moves;
  }

  // Sliding pieces
  const dirs = [];
  if (p.type === BISHOP || p.type === QUEEN) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
  if (p.type === ROOK   || p.type === QUEEN) dirs.push([-1,0],[1,0],[0,-1],[0,1]);
  for (const [dr, df] of dirs) {
    let nr = r + dr, nf = f + df;
    while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      const ts = sq(nr, nf);
      const t = g.board[ts];
      if (t) {
        if (t.color === enemy) moves.push({ from: s, to: ts });
        break;
      }
      moves.push({ from: s, to: ts });
      nr += dr; nf += df;
    }
  }
  return moves;
}

function isLegal(g, move) {
  // Make the move on a copy and see if own king is in check
  const copy = cloneGame(g);
  applyMoveRaw(copy, move);
  return !inCheck(copy, g.turn);
}

function cloneGame(g) {
  return {
    board: g.board.map(p => p ? { ...p } : null),
    turn: g.turn,
    castling: { ...g.castling },
    enPassant: g.enPassant,
    halfMoves: g.halfMoves,
    history: [],
    capturedWhite: [...g.capturedWhite],
    capturedBlack: [...g.capturedBlack],
    gameOver: g.gameOver,
    winner: g.winner,
  };
}

function applyMoveRaw(g, move) {
  const p = g.board[move.from];
  const captured = g.board[move.to];

  g.board[move.to] = p;
  g.board[move.from] = null;

  // En passant capture
  if (move.isEnPassant) {
    const epCapSq = sq(rank(move.from), file(move.to));
    g.board[epCapSq] = null;
  }

  // Castling rook move
  if (move.isCastle) {
    const br = rank(move.from);
    if (move.isCastle === 'k') {
      g.board[sq(br, 5)] = g.board[sq(br, 7)];
      g.board[sq(br, 7)] = null;
    } else {
      g.board[sq(br, 3)] = g.board[sq(br, 0)];
      g.board[sq(br, 0)] = null;
    }
  }

  // Promotion
  if (move.promotion) {
    g.board[move.to] = { color: p.color, type: move.promotion };
  }
}

function makeMove(g, move) {
  const p = g.board[move.from];
  const captured = g.board[move.to];
  const epCaptured = move.isEnPassant ? g.board[sq(rank(move.from), file(move.to))] : null;

  // Record capture
  const cap = captured || epCaptured;
  if (cap) {
    if (cap.color === W) g.capturedWhite.push(cap);
    else g.capturedBlack.push(cap);
  }

  applyMoveRaw(g, move);

  // Update castling rights
  if (p.type === KING) {
    if (p.color === W) { g.castling.wk = false; g.castling.wq = false; }
    else { g.castling.bk = false; g.castling.bq = false; }
  }
  if (p.type === ROOK) {
    if (move.from === 63) g.castling.wk = false;
    if (move.from === 56) g.castling.wq = false;
    if (move.from === 7)  g.castling.bk = false;
    if (move.from === 0)  g.castling.bq = false;
  }
  // Rook captured on starting square
  if (move.to === 63) g.castling.wk = false;
  if (move.to === 56) g.castling.wq = false;
  if (move.to === 7)  g.castling.bk = false;
  if (move.to === 0)  g.castling.bq = false;

  // En passant
  g.enPassant = move.enPassantSquare ?? -1;

  // Half-move clock
  if (p.type === PAWN || cap) g.halfMoves = 0;
  else g.halfMoves++;

  g.history.push(move);
  g.turn = g.turn === W ? B : W;

  // Check for game-over
  const legalMoves = generateMoves(g);
  if (legalMoves.length === 0) {
    if (inCheck(g, g.turn)) {
      g.gameOver = 'checkmate';
      g.winner = g.turn === W ? B : W;
    } else {
      g.gameOver = 'stalemate';
    }
  } else if (g.halfMoves >= 100) {
    g.gameOver = 'draw';
  }
}
