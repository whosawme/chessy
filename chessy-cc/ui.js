// ── UI Controller ─────────────────────────────────────────────────────────────
(function () {
  let game = createGame();
  let selected = -1;
  let legalMovesForSelected = [];
  let showHeatmap = false;
  let showCounts = false;
  let lastMove = null;

  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const heatmapBtn = document.getElementById('heatmap-toggle');
  const countsBtn = document.getElementById('counts-toggle');
  const resetBtn = document.getElementById('reset-btn');
  const legendEl = document.getElementById('legend');
  const capturedWhiteEl = document.getElementById('captured-white');
  const capturedBlackEl = document.getElementById('captured-black');

  // ── Build board squares ───────────────────────────────────────────────────
  const squares = [];
  for (let s = 0; s < 64; s++) {
    const div = document.createElement('div');
    const r = rank(s), f = file(s);
    div.className = 'square ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
    div.dataset.sq = s;

    // Heatmap overlay
    const overlay = document.createElement('div');
    overlay.className = 'heatmap-overlay';
    div.appendChild(overlay);

    // Piece span
    const pieceSpan = document.createElement('span');
    pieceSpan.className = 'piece';
    div.appendChild(pieceSpan);

    // Count badges
    const countW = document.createElement('span');
    countW.className = 'count-badge top-left';
    div.appendChild(countW);

    const countB = document.createElement('span');
    countB.className = 'count-badge bottom-right';
    div.appendChild(countB);

    div.addEventListener('click', () => onSquareClick(s));
    boardEl.appendChild(div);
    squares.push(div);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const wAttacks = computeAttacks(game, W);
    const bAttacks = computeAttacks(game, B);
    const isCheck = inCheck(game, game.turn);
    const kingSquare = findKing(game, game.turn);

    boardEl.classList.toggle('show-counts', showCounts);

    for (let s = 0; s < 64; s++) {
      const div = squares[s];
      const p = game.board[s];
      const r = rank(s), f = file(s);

      // Reset classes
      const baseClass = 'square ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
      let cls = baseClass;
      if (s === selected) cls += ' selected';
      if (lastMove && s === lastMove.from) cls += ' last-from';
      if (lastMove && s === lastMove.to) cls += ' last-to';
      if (isCheck && s === kingSquare) cls += ' in-check';

      // Move targets
      const moveForSquare = legalMovesForSelected.find(m => m.to === s);
      if (moveForSquare) {
        cls += game.board[s] || (moveForSquare.isEnPassant) ? ' capture-target' : ' move-target';
      }
      div.className = cls;

      // Piece
      const pieceSpan = div.querySelector('.piece');
      if (p) {
        pieceSpan.textContent = PIECE_UNICODE[p.color + p.type];
      } else {
        pieceSpan.textContent = '';
      }

      // Heatmap overlay
      const overlay = div.querySelector('.heatmap-overlay');
      if (showHeatmap) {
        const net = wAttacks[s] - bAttacks[s]; // positive = white dominates
        const maxIntensity = 0.65;
        if (net > 0) {
          const alpha = Math.min(net / 5, 1) * maxIntensity;
          overlay.style.backgroundColor = `rgba(33, 150, 243, ${alpha})`;
        } else if (net < 0) {
          const alpha = Math.min(-net / 5, 1) * maxIntensity;
          overlay.style.backgroundColor = `rgba(233, 69, 96, ${alpha})`;
        } else {
          overlay.style.backgroundColor = 'transparent';
        }
      } else {
        overlay.style.backgroundColor = 'transparent';
      }

      // Count badges
      const countWEl = div.querySelector('.count-badge.top-left');
      const countBEl = div.querySelector('.count-badge.bottom-right');
      countWEl.textContent = wAttacks[s] > 0 ? wAttacks[s] : '';
      countBEl.textContent = bAttacks[s] > 0 ? bAttacks[s] : '';
    }

    // Status
    if (game.gameOver === 'checkmate') {
      statusEl.textContent = `Checkmate! ${game.winner === W ? 'White' : 'Black'} wins!`;
    } else if (game.gameOver === 'stalemate') {
      statusEl.textContent = 'Stalemate — draw!';
    } else if (game.gameOver === 'draw') {
      statusEl.textContent = 'Draw by 50-move rule!';
    } else {
      statusEl.textContent = (game.turn === W ? 'White' : 'Black') + ' to move' + (isCheck ? ' (check!)' : '');
    }

    // Captured
    capturedWhiteEl.textContent = game.capturedWhite.map(p => PIECE_UNICODE[p.color + p.type]).join(' ');
    capturedBlackEl.textContent = game.capturedBlack.map(p => PIECE_UNICODE[p.color + p.type]).join(' ');

    // Legend visibility
    legendEl.classList.toggle('hidden', !showHeatmap);
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  function onSquareClick(s) {
    if (game.gameOver) return;

    // If clicking a legal move target, make the move
    const moveHit = legalMovesForSelected.find(m => m.to === s);
    if (moveHit) {
      // If there are multiple moves to same square (promotions), pick queen
      const promoMoves = legalMovesForSelected.filter(m => m.to === s);
      const chosen = promoMoves.find(m => m.promotion === QUEEN) || promoMoves[0];
      lastMove = chosen;
      makeMove(game, chosen);
      selected = -1;
      legalMovesForSelected = [];
      render();
      return;
    }

    // Select own piece
    const p = game.board[s];
    if (p && p.color === game.turn) {
      selected = s;
      const allMoves = generateMoves(game);
      legalMovesForSelected = allMoves.filter(m => m.from === s);
    } else {
      selected = -1;
      legalMovesForSelected = [];
    }
    render();
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  heatmapBtn.addEventListener('click', () => {
    showHeatmap = !showHeatmap;
    heatmapBtn.classList.toggle('active', showHeatmap);
    render();
  });

  countsBtn.addEventListener('click', () => {
    showCounts = !showCounts;
    countsBtn.classList.toggle('active', showCounts);
    render();
  });

  resetBtn.addEventListener('click', () => {
    game = createGame();
    selected = -1;
    legalMovesForSelected = [];
    lastMove = null;
    render();
  });

  // Initial render
  render();
})();
