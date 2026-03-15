// ── Opening Study Data ────────────────────────────────────────────────────────
// Each opening: { name, perspective ('w'|'b'), description, moves: ['e2e4','e7e5',...] }
// Moves use coordinate notation: file+rank for from and to (a=0..h=7, rank 1=row7..8=row0)

function algToSq(s) {
  const f = s.charCodeAt(0) - 97; // a=0
  const r = 8 - parseInt(s[1]);   // '1'→7, '8'→0
  return r * 8 + f;
}

function parseCoordMove(s) {
  return { from: algToSq(s.slice(0, 2)), to: algToSq(s.slice(2, 4)) };
}

// Build a game state by replaying moves from start
function replayMoves(coordMoves, upToIndex) {
  const g = createGame();
  const count = Math.min(upToIndex, coordMoves.length);
  for (let i = 0; i < count; i++) {
    const cm = parseCoordMove(coordMoves[i]);
    const legal = generateMoves(g);
    // Find matching legal move (handle promotions, castling, en passant automatically)
    const match = legal.find(m => m.from === cm.from && m.to === cm.to)
      || legal.find(m => m.from === cm.from && m.to === cm.to && m.promotion === QUEEN);
    if (!match) break; // invalid sequence, stop
    makeMove(g, match);
  }
  return g;
}

// Format moves as algebraic pairs for display: "1. e4 e5  2. Nf3 Nc6 ..."
// We store display-friendly SAN alongside the coord moves
const OPENINGS = {
  white: [
    {
      name: "Italian Game",
      san: "1. e4 e5 2. Nf3 Nc6 3. Bc4",
      desc: "Classic open game aiming at f7. White develops quickly toward the center and kingside. The bishop on c4 targets the weak f7 pawn.",
      moves: ["e2e4","e7e5","g1f3","b8c6","f1c4"]
    },
    {
      name: "Ruy Lopez",
      san: "1. e4 e5 2. Nf3 Nc6 3. Bb5",
      desc: "The 'Spanish Game' — one of the oldest and most deeply analyzed openings. The bishop pins the knight defending e5, creating long-term pressure.",
      moves: ["e2e4","e7e5","g1f3","b8c6","f1b5"]
    },
    {
      name: "Queen's Gambit",
      san: "1. d4 d5 2. c4",
      desc: "White offers a pawn to gain central control. Not a true gambit — white can usually regain the pawn. Leads to strategic, positional play.",
      moves: ["d2d4","d7d5","c2c4"]
    },
    {
      name: "London System",
      san: "1. d4 d5 2. Nf3 Nf6 3. Bf4",
      desc: "A solid, low-theory system. White develops the dark-squared bishop before playing e3, creating a sturdy pawn structure. Popular at all levels.",
      moves: ["d2d4","d7d5","g1f3","g8f6","c1f4"]
    },
    {
      name: "King's Gambit",
      san: "1. e4 e5 2. f4",
      desc: "An aggressive romantic-era opening. White sacrifices a pawn for rapid development and attack on the f-file. Sharp and tactical.",
      moves: ["e2e4","e7e5","f2f4"]
    },
    {
      name: "Scotch Game",
      san: "1. e4 e5 2. Nf3 Nc6 3. d4",
      desc: "White immediately challenges the center. After 3...exd4 4.Nxd4, white has a lead in development and open lines.",
      moves: ["e2e4","e7e5","g1f3","b8c6","d2d4"]
    },
    {
      name: "English Opening",
      san: "1. c4",
      desc: "A flexible flank opening. White controls d5 from the wing and can transpose into many systems. Favored by positional players.",
      moves: ["c2c4"]
    },
    {
      name: "Vienna Game",
      san: "1. e4 e5 2. Nc3",
      desc: "Prepares f4 (a delayed King's Gambit) while developing a piece. Less forcing than 2.Nf3, giving white flexible plans.",
      moves: ["e2e4","e7e5","b1c3"]
    },
    {
      name: "Catalan Opening",
      san: "1. d4 Nf6 2. c4 e6 3. g3",
      desc: "White fianchettoes the light-squared bishop, combining Queen's Gambit ideas with kingside pressure along the long diagonal.",
      moves: ["d2d4","g8f6","c2c4","e7e6","g2g3"]
    },
    {
      name: "Four Knights Game",
      san: "1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6",
      desc: "Both sides develop knights symmetrically. Solid and principled, often leading to balanced positions with chances for both sides.",
      moves: ["e2e4","e7e5","g1f3","b8c6","b1c3","g8f6"]
    }
  ],
  black: [
    {
      name: "Sicilian Defense",
      san: "1. e4 c5",
      desc: "The most popular response to 1.e4. Black fights for the center asymmetrically, leading to rich tactical play. Statistically black's best scoring reply.",
      moves: ["e2e4","c7c5"]
    },
    {
      name: "Sicilian Najdorf",
      san: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6",
      desc: "The sharpest Sicilian variation. 5...a6 prepares ...e5 and ...b5 expansions. A favorite of Fischer and Kasparov — extremely complex.",
      moves: ["e2e4","c7c5","g1f3","d7d6","d2d4","c5d4","f3d4","g8f6","b1c3","a7a6"]
    },
    {
      name: "French Defense",
      san: "1. e4 e6",
      desc: "Solid and strategic. Black's pawn chain (e6/d5) is sturdy but the light-squared bishop is often restricted. Leads to closed, structural battles.",
      moves: ["e2e4","e7e6"]
    },
    {
      name: "Caro-Kann Defense",
      san: "1. e4 c6",
      desc: "Similar goals to the French but keeps the light-squared bishop active. After 2.d4 d5, black has a solid, slightly passive but resilient position.",
      moves: ["e2e4","c7c6"]
    },
    {
      name: "King's Indian Defense",
      san: "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7",
      desc: "Black allows white to build a broad center, then counterattacks with ...e5 or ...c5. Highly dynamic — Kasparov's weapon of choice.",
      moves: ["d2d4","g8f6","c2c4","g7g6","b1c3","f8g7"]
    },
    {
      name: "Slav Defense",
      san: "1. d4 d5 2. c4 c6",
      desc: "A solid Queen's Gambit Declined. The c6 pawn supports d5 while keeping the light-squared bishop's diagonal open. Very reliable.",
      moves: ["d2d4","d7d5","c2c4","c7c6"]
    },
    {
      name: "Nimzo-Indian Defense",
      san: "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4",
      desc: "Black pins the c3 knight, fighting for control of e4. One of the most respected defenses — flexible and strategically rich.",
      moves: ["d2d4","g8f6","c2c4","e7e6","b1c3","f8b4"]
    },
    {
      name: "Grünfeld Defense",
      san: "1. d4 Nf6 2. c4 g6 3. Nc3 d5",
      desc: "Black immediately strikes at the center with ...d5, often sacrificing it to undermine white's pawn center later. Dynamic counterplay.",
      moves: ["d2d4","g8f6","c2c4","g7g6","b1c3","d7d5"]
    },
    {
      name: "Dutch Defense",
      san: "1. d4 f5",
      desc: "An aggressive reply to 1.d4. Black grabs kingside space and aims for a direct attack. Ambitious but slightly weakening of the king.",
      moves: ["d2d4","f7f5"]
    },
    {
      name: "Pirc Defense",
      san: "1. e4 d6 2. d4 Nf6 3. Nc3 g6",
      desc: "A hypermodern approach — black lets white occupy the center, then attacks it with pieces and pawn breaks. Flexible but requires precision.",
      moves: ["e2e4","d7d6","d2d4","g8f6","b1c3","g7g6"]
    }
  ]
};
