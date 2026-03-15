// ── UI Controller ─────────────────────────────────────────────────────────────
(function () {
  let game = createGame();
  let selected = -1;
  let legalMovesForSelected = [];
  let showHeatmap = false;
  let showCounts = false;
  let showDelta = false;
  let flipped = false;
  let lastMove = null;
  let prevWAttacks = null;
  let prevBAttacks = null;

  // ── Move Tree ─────────────────────────────────────────────────────────────
  let nextNodeId = 0;

  function createMoveNode(move, san, parent) {
    return {
      id: nextNodeId++,
      move,           // {from, to, ...} or null for root
      san,            // 'Nf3' or null for root
      parent,
      children: [],   // [0] = main line, [1..] = branches
      snapshot: null,
      prevW: null,    // attack map before this move
      prevB: null,
    };
  }

  function createRootNode() {
    const g = createGame();
    const root = createMoveNode(null, null, null);
    root.snapshot = snapshotGame(g);
    return root;
  }

  let moveTree = createRootNode();
  let currentNode = moveTree;

  // Study mode
  let studyMode = false;
  let studyOpening = null;
  let studyStep = 0;
  let studyTab = 'white';

  // DOM refs
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const heatmapBtn = document.getElementById('heatmap-toggle');
  const countsBtn = document.getElementById('counts-toggle');
  const deltaBtn = document.getElementById('delta-toggle');
  const flipBtn = document.getElementById('flip-btn');
  const resetBtn = document.getElementById('reset-btn');
  const legendEl = document.getElementById('legend');
  const capturedTopEl = document.getElementById('captured-top');
  const capturedBottomEl = document.getElementById('captured-bottom');
  const moveTreeEl = document.getElementById('move-tree');

  const studyList = document.getElementById('study-list');
  const studyControls = document.getElementById('study-controls');
  const studyNameEl = document.getElementById('study-name');
  const studyMovesEl = document.getElementById('study-moves-display');
  const studyDescEl = document.getElementById('study-desc');
  const studyTabs = document.querySelectorAll('.study-tab');

  // ── Build board squares ───────────────────────────────────────────────────
  const squares = [];
  for (let s = 0; s < 64; s++) {
    const div = document.createElement('div');
    const r = rank(s), f = file(s);
    div.className = 'square ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
    div.dataset.sq = s;

    const overlay = document.createElement('div');
    overlay.className = 'heatmap-overlay';
    div.appendChild(overlay);

    const pieceSpan = document.createElement('span');
    pieceSpan.className = 'piece';
    div.appendChild(pieceSpan);

    const countW = document.createElement('span');
    countW.className = 'count-badge top-left';
    div.appendChild(countW);

    const countB = document.createElement('span');
    countB.className = 'count-badge bottom-right';
    div.appendChild(countB);

    const deltaW = document.createElement('span');
    deltaW.className = 'delta-badge delta-top';
    div.appendChild(deltaW);

    const deltaB = document.createElement('span');
    deltaB.className = 'delta-badge delta-bottom';
    div.appendChild(deltaB);

    div.addEventListener('click', () => onSquareClick(s));
    boardEl.appendChild(div);
    squares.push(div);
  }

  function visualToLogical(vi) { return flipped ? 63 - vi : vi; }

  // ── Tree Operations ───────────────────────────────────────────────────────
  function treeMakeMove(move) {
    // Check if an existing child already matches
    const existing = currentNode.children.find(c =>
      c.move.from === move.from && c.move.to === move.to &&
      (c.move.promotion || null) === (move.promotion || null)
    );
    if (existing) {
      navigateToNode(existing);
      return;
    }

    // Compute SAN before mutating game
    const san = moveToSAN(game, move);
    const pw = computeAttacks(game, W);
    const pb = computeAttacks(game, B);

    makeMove(game, move);

    const node = createMoveNode(move, san, currentNode);
    node.snapshot = snapshotGame(game);
    node.prevW = pw;
    node.prevB = pb;

    currentNode.children.push(node);
    currentNode = node;
    lastMove = move;
    prevWAttacks = pw;
    prevBAttacks = pb;
  }

  function navigateToNode(node) {
    currentNode = node;
    game = restoreFromSnapshot(node.snapshot);
    lastMove = node.move;
    prevWAttacks = node.prevW;
    prevBAttacks = node.prevB;
    selected = -1;
    legalMovesForSelected = [];
    render();
    renderMoveTree();
  }

  function getPly(node) {
    let n = 0, cur = node;
    while (cur.parent) { n++; cur = cur.parent; }
    return n;
  }

  // ── Render Move Tree ──────────────────────────────────────────────────────
  function renderMoveTree() {
    moveTreeEl.innerHTML = '';
    if (moveTree.children.length === 0) return;
    renderLine(moveTreeEl, moveTree);
    // Scroll current move into view
    const cur = moveTreeEl.querySelector('.tree-current');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderLine(container, startNode) {
    let node = startNode;
    while (node.children.length > 0) {
      const main = node.children[0];
      container.appendChild(makeMoveSpan(main, false));

      // Render branches
      for (let i = 1; i < node.children.length; i++) {
        const branchDiv = document.createElement('span');
        branchDiv.className = 'variation-line';

        // Branch-point label: show which move this branches from
        const branchLabel = document.createElement('span');
        branchLabel.className = 'branch-label';
        const parentDesc = getBranchPointDesc(node);
        branchLabel.textContent = `after ${parentDesc}: `;
        branchLabel.addEventListener('click', (e) => { e.stopPropagation(); navigateToNode(node); });
        branchDiv.appendChild(branchLabel);

        branchDiv.appendChild(makeMoveSpan(node.children[i], true));
        renderLine(branchDiv, node.children[i]);
        container.appendChild(branchDiv);
      }
      node = main;
    }
  }

  // Describe the branch point (the parent position the branch diverges from)
  function getBranchPointDesc(node) {
    if (!node.move) return 'start';
    const ply = getPly(node);
    const moveNum = Math.floor((ply - 1) / 2) + 1;
    const isWhite = ply % 2 === 1;
    if (isWhite) return moveNum + '.\u2009' + node.san;
    return moveNum + '...\u2009' + node.san;
  }

  function makeMoveSpan(node, forceShowNum) {
    const ply = getPly(node);
    const moveNum = Math.floor((ply - 1) / 2) + 1;
    const isWhite = ply % 2 === 1;
    const isBranch = node.parent && node !== node.parent.children[0];

    const span = document.createElement('span');
    span.className = 'tree-move' + (node === currentNode ? ' tree-current' : '');
    span.dataset.nodeId = node.id;

    let text = '';
    if (isWhite) {
      text = moveNum + '.\u2009' + node.san;
    } else if (forceShowNum || isBranch) {
      text = moveNum + '...\u2009' + node.san;
    } else {
      text = node.san;
    }

    span.textContent = text + ' ';
    span.addEventListener('click', (e) => { e.stopPropagation(); navigateToNode(node); });
    return span;
  }

  // ── Board Render ──────────────────────────────────────────────────────────
  function render() {
    const wAttacks = computeAttacks(game, W);
    const bAttacks = computeAttacks(game, B);
    const isCheck = inCheck(game, game.turn);
    const kingSquare = findKing(game, game.turn);

    boardEl.classList.toggle('show-counts', showCounts);
    boardEl.classList.toggle('show-delta', showDelta);

    for (let vi = 0; vi < 64; vi++) {
      const s = visualToLogical(vi);
      const div = squares[vi];
      const p = game.board[s];
      const r = rank(s), f = file(s);

      const baseClass = 'square ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
      let cls = baseClass;
      if (s === selected) cls += ' selected';
      if (lastMove && s === lastMove.from) cls += ' last-from';
      if (lastMove && s === lastMove.to) cls += ' last-to';
      if (isCheck && s === kingSquare) cls += ' in-check';

      const moveForSquare = legalMovesForSelected.find(m => m.to === s);
      if (moveForSquare) {
        cls += game.board[s] || moveForSquare.isEnPassant ? ' capture-target' : ' move-target';
      }
      div.className = cls;

      div.querySelector('.piece').textContent = p ? PIECE_UNICODE[p.color + p.type] : '';

      const overlay = div.querySelector('.heatmap-overlay');
      if (showHeatmap) {
        const net = wAttacks[s] - bAttacks[s];
        if (net > 0) {
          overlay.style.backgroundColor = `rgba(30, 136, 229, ${Math.min(net / 3, 1) * 0.8})`;
        } else if (net < 0) {
          overlay.style.backgroundColor = `rgba(229, 57, 53, ${Math.min(-net / 3, 1) * 0.8})`;
        } else {
          overlay.style.backgroundColor = 'rgba(128, 128, 128, 0.15)';
        }
      } else {
        overlay.style.backgroundColor = 'transparent';
      }

      div.querySelector('.count-badge.top-left').textContent = wAttacks[s] > 0 ? wAttacks[s] : '';
      div.querySelector('.count-badge.bottom-right').textContent = bAttacks[s] > 0 ? bAttacks[s] : '';

      const deltaWEl = div.querySelector('.delta-badge.delta-top');
      const deltaBEl = div.querySelector('.delta-badge.delta-bottom');
      if (prevWAttacks && prevBAttacks) {
        setDeltaBadge(deltaWEl, wAttacks[s] - prevWAttacks[s]);
        setDeltaBadge(deltaBEl, bAttacks[s] - prevBAttacks[s]);
      } else {
        deltaWEl.textContent = ''; deltaWEl.className = 'delta-badge delta-top delta-zero';
        deltaBEl.textContent = ''; deltaBEl.className = 'delta-badge delta-bottom delta-zero';
      }

      // Threat-prevailing outline when any overlay is active
      const anyOverlay = showHeatmap || showCounts || showDelta;
      const hasSpecialShadow = s === selected || (isCheck && s === kingSquare);
      if (anyOverlay && !hasSpecialShadow) {
        const net = wAttacks[s] - bAttacks[s];
        if (net > 0) {
          const a = Math.min(net / 4, 1) * 0.7 + 0.3;
          div.style.boxShadow = `inset 0 0 0 2px rgba(30, 136, 229, ${a})`;
        } else if (net < 0) {
          const a = Math.min(-net / 4, 1) * 0.7 + 0.3;
          div.style.boxShadow = `inset 0 0 0 2px rgba(229, 57, 53, ${a})`;
        } else {
          div.style.boxShadow = '';
        }
      } else if (!hasSpecialShadow) {
        div.style.boxShadow = '';
      }
    }

    // Status
    if (studyMode) {
      statusEl.textContent = `Study: ${studyOpening.name} — move ${studyStep}/${studyOpening.moves.length}`;
    } else if (game.gameOver === 'checkmate') {
      statusEl.textContent = `Checkmate! ${game.winner === W ? 'White' : 'Black'} wins!`;
    } else if (game.gameOver === 'stalemate') {
      statusEl.textContent = 'Stalemate — draw!';
    } else if (game.gameOver === 'draw') {
      statusEl.textContent = 'Draw by 50-move rule!';
    } else {
      statusEl.textContent = (game.turn === W ? 'White' : 'Black') + ' to move' + (isCheck ? ' (check!)' : '');
    }

    if (flipped) {
      capturedTopEl.textContent = game.capturedWhite.map(p => PIECE_UNICODE[p.color + p.type]).join(' ');
      capturedBottomEl.textContent = game.capturedBlack.map(p => PIECE_UNICODE[p.color + p.type]).join(' ');
    } else {
      capturedTopEl.textContent = game.capturedBlack.map(p => PIECE_UNICODE[p.color + p.type]).join(' ');
      capturedBottomEl.textContent = game.capturedWhite.map(p => PIECE_UNICODE[p.color + p.type]).join(' ');
    }

    legendEl.classList.toggle('hidden', !showHeatmap);
  }

  function setDeltaBadge(el, delta) {
    const base = el.classList.contains('delta-top') ? 'delta-badge delta-top' : 'delta-badge delta-bottom';
    if (delta > 0) { el.textContent = '+' + delta; el.className = base + ' delta-pos'; }
    else if (delta < 0) { el.textContent = '' + delta; el.className = base + ' delta-neg'; }
    else { el.textContent = ''; el.className = base + ' delta-zero'; }
  }

  // ── Board Interaction ─────────────────────────────────────────────────────
  function onSquareClick(vi) {
    if (game.gameOver || studyMode) return;
    const s = visualToLogical(vi);

    const moveHit = legalMovesForSelected.find(m => m.to === s);
    if (moveHit) {
      const promoMoves = legalMovesForSelected.filter(m => m.to === s);
      const chosen = promoMoves.find(m => m.promotion === QUEEN) || promoMoves[0];
      treeMakeMove(chosen);
      renderMoveTree();
      render();
      return;
    }

    const p = game.board[s];
    if (p && p.color === game.turn) {
      selected = s;
      legalMovesForSelected = generateMoves(game).filter(m => m.from === s);
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

  deltaBtn.addEventListener('click', () => {
    showDelta = !showDelta;
    deltaBtn.classList.toggle('active', showDelta);
    render();
  });

  flipBtn.addEventListener('click', () => {
    flipped = !flipped;
    flipBtn.classList.toggle('active', flipped);
    render();
  });

  resetBtn.addEventListener('click', () => {
    exitStudy();
    game = createGame();
    moveTree = createRootNode();
    currentNode = moveTree;
    selected = -1;
    legalMovesForSelected = [];
    lastMove = null;
    prevWAttacks = null;
    prevBAttacks = null;
    render();
    renderMoveTree();
  });

  // ── History Nav Buttons ───────────────────────────────────────────────────
  document.getElementById('nav-start').addEventListener('click', () => {
    if (studyMode) return;
    navigateToNode(moveTree);
  });
  document.getElementById('nav-prev').addEventListener('click', () => {
    if (studyMode || !currentNode.parent) return;
    navigateToNode(currentNode.parent);
  });
  document.getElementById('nav-next').addEventListener('click', () => {
    if (studyMode || currentNode.children.length === 0) return;
    navigateToNode(currentNode.children[0]);
  });
  document.getElementById('nav-end').addEventListener('click', () => {
    if (studyMode) return;
    let n = currentNode;
    while (n.children.length > 0) n = n.children[0];
    navigateToNode(n);
  });

  // ── Keyboard Navigation ───────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (studyMode) {
      if (e.key === 'ArrowLeft' && studyStep > 0) { studyStep--; loadStudyPosition(); renderStudyMoves(); }
      else if (e.key === 'ArrowRight' && studyStep < studyOpening.moves.length) { studyStep++; loadStudyPosition(); renderStudyMoves(); }
      else if (e.key === 'Home') { studyStep = 0; loadStudyPosition(); renderStudyMoves(); }
      else if (e.key === 'End') { studyStep = studyOpening.moves.length; loadStudyPosition(); renderStudyMoves(); }
      return;
    }

    if (e.key === 'ArrowLeft') {
      if (currentNode.parent) navigateToNode(currentNode.parent);
    } else if (e.key === 'ArrowRight') {
      if (currentNode.children.length > 0) navigateToNode(currentNode.children[0]);
    } else if (e.key === 'ArrowUp') {
      // Previous sibling branch
      if (currentNode.parent) {
        const sibs = currentNode.parent.children;
        const idx = sibs.indexOf(currentNode);
        if (idx > 0) navigateToNode(sibs[idx - 1]);
      }
    } else if (e.key === 'ArrowDown') {
      // Next sibling branch
      if (currentNode.parent) {
        const sibs = currentNode.parent.children;
        const idx = sibs.indexOf(currentNode);
        if (idx < sibs.length - 1) navigateToNode(sibs[idx + 1]);
      }
    } else if (e.key === 'Home') {
      navigateToNode(moveTree);
    } else if (e.key === 'End') {
      let n = currentNode;
      while (n.children.length > 0) n = n.children[0];
      navigateToNode(n);
    }
  });

  // ── Study Panel ───────────────────────────────────────────────────────────
  // Collapsible toggle
  document.getElementById('study-toggle-btn').addEventListener('click', () => {
    document.getElementById('study-panel').classList.toggle('collapsed');
  });

  function renderStudyList() {
    const openings = OPENINGS[studyTab];
    studyList.innerHTML = '';
    studyControls.classList.add('hidden');
    studyList.classList.remove('hidden');
    for (const op of openings) {
      const btn = document.createElement('button');
      btn.className = 'study-item';
      btn.innerHTML = `<strong>${op.name}</strong><span class="study-san">${op.san}</span>`;
      btn.addEventListener('click', () => enterStudy(op));
      studyList.appendChild(btn);
    }
  }

  function enterStudy(opening) {
    studyMode = true;
    studyOpening = opening;
    studyStep = opening.moves.length;
    lastMove = null;
    selected = -1;
    legalMovesForSelected = [];
    if (OPENINGS.black.includes(opening) && !flipped) {
      flipped = true;
      flipBtn.classList.add('active');
    }
    // Expand study panel
    document.getElementById('study-panel').classList.remove('collapsed');
    loadStudyPosition();
    studyList.classList.add('hidden');
    studyControls.classList.remove('hidden');
    studyNameEl.textContent = opening.name;
    studyDescEl.textContent = opening.desc;
    renderStudyMoves();
  }

  function exitStudy() {
    studyMode = false;
    studyOpening = null;
    studyStep = 0;
    prevWAttacks = null;
    prevBAttacks = null;
    studyControls.classList.add('hidden');
    studyList.classList.remove('hidden');
  }

  function loadStudyPosition() {
    if (studyStep > 0) {
      const prev = replayMoves(studyOpening.moves, studyStep - 1);
      prevWAttacks = computeAttacks(prev, W);
      prevBAttacks = computeAttacks(prev, B);
    } else {
      const init = createGame();
      prevWAttacks = computeAttacks(init, W);
      prevBAttacks = computeAttacks(init, B);
    }
    game = replayMoves(studyOpening.moves, studyStep);
    lastMove = studyStep > 0 ? parseCoordMove(studyOpening.moves[studyStep - 1]) : null;
    render();
  }

  function renderStudyMoves() {
    let html = '';
    const moves = studyOpening.moves;
    for (let i = 0; i < moves.length; i++) {
      if (i % 2 === 0) html += `<span class="move-num">${Math.floor(i/2)+1}.</span> `;
      const cls = i < studyStep ? 'move-played' : 'move-future';
      const highlight = i === studyStep - 1 ? ' move-current' : '';
      html += `<span class="move ${cls}${highlight}" data-idx="${i+1}">${getMoveLabel(i)}</span> `;
    }
    studyMovesEl.innerHTML = html;
    studyMovesEl.querySelectorAll('.move').forEach(el => {
      el.addEventListener('click', () => {
        studyStep = parseInt(el.dataset.idx);
        loadStudyPosition();
        renderStudyMoves();
      });
    });
  }

  function getMoveLabel(moveIndex) {
    const parts = studyOpening.san.replace(/\d+\.\s*/g, '|').split(/[\s|]+/).filter(Boolean);
    return parts[moveIndex] || '??';
  }

  // Study nav buttons
  document.getElementById('study-start').addEventListener('click', () => { if (!studyMode) return; studyStep = 0; loadStudyPosition(); renderStudyMoves(); });
  document.getElementById('study-prev').addEventListener('click', () => { if (!studyMode || studyStep <= 0) return; studyStep--; loadStudyPosition(); renderStudyMoves(); });
  document.getElementById('study-next').addEventListener('click', () => { if (!studyMode || studyStep >= studyOpening.moves.length) return; studyStep++; loadStudyPosition(); renderStudyMoves(); });
  document.getElementById('study-end').addEventListener('click', () => { if (!studyMode) return; studyStep = studyOpening.moves.length; loadStudyPosition(); renderStudyMoves(); });
  document.getElementById('study-exit').addEventListener('click', () => {
    exitStudy();
    game = createGame();
    moveTree = createRootNode();
    currentNode = moveTree;
    lastMove = null;
    prevWAttacks = null;
    prevBAttacks = null;
    render();
    renderMoveTree();
  });

  // Study tabs
  studyTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      studyTab = tab.dataset.tab;
      studyTabs.forEach(t => t.classList.toggle('active', t === tab));
      if (studyTab === 'black' && !flipped) { flipped = true; flipBtn.classList.add('active'); }
      else if (studyTab === 'white' && flipped) { flipped = false; flipBtn.classList.remove('active'); }
      renderStudyList();
      render();
    });
  });

  // Init
  renderStudyList();
  render();
  renderMoveTree();
})();
