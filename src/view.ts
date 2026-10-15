import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleSimulator } from "@clockwyrks/particle-runtime";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { CellRef, GemState } from "./game";
import * as C from "./constants";
import * as M from "./model";

const INK = "#ebeadf",
  GOLD = "#c9b588",
  DIM = "#91a9ae",
  TEAL = "#74ded4";
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function spaced(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size: number,
  tracking = 3,
  color = INK,
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "left";
  for (const ch of value) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + tracking;
  }
}
function line(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  color = "#34464a",
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}
function wrap(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  width: number,
  size = 17,
  color = DIM,
  height = 27,
) {
  ctx.font = `${size}px sans-serif`;
  let row = "";
  for (const word of value.split(" ")) {
    if (ctx.measureText(`${row} ${word}`).width > width && row) {
      text(ctx, row, x, y, size, color);
      y += height;
      row = word;
    } else row += (row ? " " : "") + word;
  }
  if (row) text(ctx, row, x, y, size, color);
  return y + height;
}
function sprite(
  s: M.State,
  ctx: Context,
  path: string,
  x: number,
  y: number,
  size = 64,
) {
  const image = s.art?.images[path];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
function gem(
  s: M.State,
  ctx: Context,
  g: GemState,
  x: number,
  y: number,
  size = 64,
  animate = true,
) {
  ctx.save();
  ctx.shadowColor = "#000a";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 4;
  if (g.cut === "prism" && animate) {
    const frame = s.screen === "playing" ? Math.floor(s.simTime * 7) % 8 : 0;
    sprite(
      s,
      ctx,
      `gems/prism-turn/${g.strain ? `${g.strain}-` : ""}${frame}.png`,
      x,
      y,
      size,
    );
  } else
    sprite(s, ctx, `gems/${g.kind ?? "prism"}-${g.strain}.png`, x, y, size);
  ctx.restore();
  if (g.cut === "brilliant" || g.cut === "star")
    sprite(s, ctx, `gems/${g.cut}.png`, x, y, size);
}
/** The pure particle runtime is sampled at the state's animation time, not wall time. */
function particles(
  s: M.State,
  ctx: Context,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  const system = s.art?.systems[name];
  if (!system || age < 0 || age > 1.6) return;
  const simulator = new ParticleSimulator(system as ParticleSystem, {
    seed: seed + s.score * 17,
    maxParticles: 72,
  });
  for (let t = 0; t < age; t += 1 / 30)
    simulator.step(Math.min(1 / 30, age - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of simulator.capture()) {
    ctx.globalAlpha = p.opacity * 0.85;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(v * 255)).join(",")})`;
    const r = Math.max(0.5, p.size);
    // Authored particle positions and appearance; no baked flash or static stand-in.
    ctx.fillRect(x + p.position[0] - r / 2, y - p.position[1] - r / 2, r, r);
  }
  ctx.restore();
}
function field(ctx: Context) {
  const glow = ctx.createRadialGradient(650, 320, 80, 650, 360, 740);
  glow.addColorStop(0, "#17343c");
  glow.addColorStop(0.65, "#0e222b");
  glow.addColorStop(1, "#09171e");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#8aa8ad0b";
  ctx.lineWidth = 1;
  for (let i = -500; i < 1600; i += 96) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 550, C.STAGE_H);
    ctx.stroke();
  }
  line(ctx, 64, 110, 208, "#50616a55");
  line(ctx, 996, 110, 220, "#50616a55");
}
function footer(s: M.State, ctx: Context) {
  spaced(ctx, "A STUDY IN STRAIN", 64, 690, 10, 2, "#769199");
  text(
    ctx,
    `M  /  SOUND ${s.muted ? "OFF" : "ON"}`,
    s.screen === "howto" ? 1020 : 1216,
    690,
    11,
    DIM,
    "sans-serif",
    "right",
  );
}
function button(
  ctx: Context,
  t: M.Target,
  label: string,
  selected: boolean,
  armed: boolean,
) {
  ctx.fillStyle = selected ? (armed ? "#8ebeb7" : "#dbd7c4") : "#0c2029";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = selected ? "#f6e5bd" : "#53676b";
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  const color = selected ? "#112c34" : INK;
  text(ctx, label, t.x + 28, t.y + t.h / 2 + 7, 18, color);
  text(
    ctx,
    selected ? "↗" : "·",
    t.x + t.w - 30,
    t.y + t.h / 2 + 8,
    25,
    color,
    "sans-serif",
    "right",
  );
}
function menu(s: M.State, ctx: Context) {
  const items =
    s.screen === "title"
      ? C.TITLE_ITEMS
      : s.screen === "paused"
        ? C.PAUSED_ITEMS
        : s.screen === "levelclear"
          ? C.LEVELCLEAR_ITEMS
          : C.GAMEOVER_ITEMS;
  M.targets(s).forEach((t, i) =>
    button(ctx, t, items[i], s.menuIndex === i, s.armedTarget === t.id),
  );
}
function title(s: M.State, ctx: Context) {
  spaced(ctx, "THE LAPIDARY COLLECTION", 164, 164, 12, 3, GOLD);
  text(ctx, C.TITLE_TEXT, 154, 295, 112, INK, "Georgia, serif");
  spaced(ctx, C.TAGLINE_TEXT, 164, 335, 14, 3, GOLD);
  menu(s, ctx);
  text(
    ctx,
    "Seven stones. One beautiful breaking point.",
    164,
    613,
    17,
    DIM,
    "Georgia, serif",
  );
  text(ctx, "DRAG TO SWAP   /   ARROWS + ENTER TO CHOOSE", 164, 646, 10, DIM);
  // Produced stones, presented as specimens rather than a decorative game board.
  const cx = 924,
    cy = 348;
  ctx.strokeStyle = "#9a967345";
  ctx.lineWidth = 1;
  for (const r of [154, 216]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x = cx + Math.cos(a) * 216,
      y = cy + Math.sin(a) * 216;
    line(ctx, x - 4, y, 8, GOLD);
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 10);
  sprite(s, ctx, "gems/prism-0.png", 0, 0, 192);
  ctx.restore();
  C.GEM_KINDS.forEach((kind, i) => {
    const angle = (i * Math.PI * 2) / 7 - 0.9;
    const x = cx + Math.cos(angle) * 156,
      y = cy + Math.sin(angle) * 156;
    sprite(s, ctx, `gems/${kind}-${i === 4 ? 3 : 0}.png`, x, y, 72);
  });
  spaced(ctx, "01  /  CUT UNDER PRESSURE", cx - 110, 624, 10, 2, DIM);
  text(ctx, "FACET", 64, 63, 21, INK, "Georgia, serif");
  text(ctx, "EST. ∞", 1216, 63, 12, GOLD, "sans-serif", "right");
}
function marker(ctx: Context, c: CellRef, color: string) {
  const x = M.cellX(c.col),
    y = M.cellY(c.row);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * 34, y + dy * 22);
    ctx.lineTo(x + dx * 34, y + dy * 34);
    ctx.lineTo(x + dx * 22, y + dy * 34);
    ctx.stroke();
  }
}
function board(s: M.State, ctx: Context) {
  sprite(s, ctx, "gems/frame.png", C.BOARD_CX, C.BOARD_CY, 608);
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    M.cellX(0) - C.CELL_PITCH / 2,
    M.cellY(0) - C.CELL_PITCH / 2,
    C.GRID_COLS * C.CELL_PITCH,
    C.GRID_ROWS * C.CELL_PITCH,
  );
  ctx.clip();
  for (const g of s.board.cells) {
    let x = M.cellX(g.col),
      y = M.cellY(g.row);
    if (s.selection && s.offer) {
      if (M.same(g, s.selection)) {
        x = M.cellX(s.offer.col);
        y = M.cellY(s.offer.row);
      } else if (M.same(g, s.offer)) {
        x = M.cellX(s.selection.col);
        y = M.cellY(s.selection.row);
      }
    }
    if (s.phase === "swapping" && s.motion) {
      const a = s.motion.a,
        b = s.motion.b;
      const t = Math.min(1, s.swapTimer / C.SWAP_SECONDS);
      const ease = t * t * (3 - 2 * t);
      if (M.same(g, a)) {
        x = M.cellX(b.col) + (M.cellX(a.col) - M.cellX(b.col)) * ease;
        y = M.cellY(b.row) + (M.cellY(a.row) - M.cellY(b.row)) * ease;
      }
      if (M.same(g, b)) {
        x = M.cellX(a.col) + (M.cellX(b.col) - M.cellX(a.col)) * ease;
        y = M.cellY(a.row) + (M.cellY(b.row) - M.cellY(a.row)) * ease;
      }
    }
    if (s.phase === "resolving") {
      const fallTime = Math.max(0, s.stepTimer - s.lastWaves * C.WAVE_SECONDS);
      const duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const progress = duration ? Math.min(1, fallTime / duration) : 1;
      y -= g.fell * C.CELL_PITCH * (1 - progress * progress);
    } else if (s.openingAt !== undefined && s.phase === "idle" && g.fell > 0) {
      const t = Math.min(
        1,
        (s.simTime - s.openingAt) / (g.fell * C.FALL_SECONDS_PER_ROW),
      );
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    }
    gem(s, ctx, g, x, y);
    if (g.cut !== "plain")
      particles(
        s,
        ctx,
        "aura",
        x,
        y,
        ((s.screen === "playing" ? s.simTime : 0.6) +
          g.col * 0.11 +
          g.row * 0.17) %
          1.45,
        M.index(g) + 41,
      );
  }
  if (s.phase === "resolving") {
    for (const fragment of s.fragments ?? []) {
      const g = fragment.gem,
        x = M.cellX(g.col),
        y = M.cellY(g.row),
        age = s.stepTimer - fragment.wave * C.WAVE_SECONDS;
      if (age < 0) gem(s, ctx, g, x, y);
      else {
        if (g.kind && age < 0.3)
          sprite(
            s,
            ctx,
            `gems/break/${g.kind}/${Math.min(5, Math.floor(age * 20))}.png`,
            x,
            y,
          );
        particles(
          s,
          ctx,
          g.strain === C.MAX_STRAIN ? "flawed" : "clear",
          x,
          y,
          age,
          M.index(g) * 13 + 7,
        );
      }
    }
    for (const c of s.flashes ?? [])
      particles(
        s,
        ctx,
        "cut",
        M.cellX(c.col),
        M.cellY(c.row),
        s.stepTimer,
        M.index(c) + 83,
      );
  }
  ctx.restore();
  if (s.selection) marker(ctx, s.selection, TEAL);
  if (s.offer) marker(ctx, s.offer, GOLD);
  if (s.refusal) {
    marker(ctx, s.refusal.a, "#ff8b87");
    marker(ctx, s.refusal.b, "#ff8b87");
  }
}
function hud(s: M.State, ctx: Context) {
  spaced(ctx, C.TITLE_TEXT, 64, 68, 30, 5);
  spaced(ctx, C.HUD_LEVEL_LABEL, 354, 48, 11, 2, GOLD);
  text(
    ctx,
    String(s.level).padStart(2, "0"),
    354,
    80,
    27,
    INK,
    "Georgia, serif",
  );
  const target = C.LEVEL_TARGET_STEP * s.level;
  text(ctx, "THE PRESSURE GAUGE", 476, 43, 10, DIM);
  text(
    ctx,
    `${s.levelScore.toLocaleString()} / ${target.toLocaleString()}`,
    925,
    43,
    12,
    GOLD,
    "sans-serif",
    "right",
  );
  ctx.fillStyle = "#07151c";
  ctx.fillRect(476, 59, 448, 8);
  ctx.fillStyle = TEAL;
  ctx.fillRect(476, 59, 448 * Math.min(1, s.levelScore / target), 8);
  line(ctx, 476, 70, 448, "#395459");
  spaced(ctx, C.HUD_SCORE_LABEL, 64, 166, 12, 3, GOLD);
  text(ctx, s.score.toLocaleString(), 60, 218, 44, INK, "Georgia, serif");
  text(ctx, "TOTAL CARATS", 64, 245, 10, DIM);
  line(ctx, 64, 278, 208);
  if (s.phase === "resolving") {
    spaced(ctx, C.HUD_CHAIN_LABEL, 64, 326, 12, 3, TEAL);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      60,
      412,
      76,
      INK,
      "Georgia, serif",
    );
    text(
      ctx,
      `+${s.lastPoints}  /  ${s.lastCleared} STONES`,
      64,
      448,
      13,
      GOLD,
    );
  } else {
    text(ctx, "Make a little", 64, 340, 25, INK, "Georgia, serif");
    text(ctx, "pressure count.", 64, 373, 25, INK, "Georgia, serif");
    wrap(
      ctx,
      "Hold a stone. Offer it to a neighbor. Let go to swap.",
      64,
      415,
      204,
      15,
    );
  }
  line(ctx, 64, 494, 208);
  text(ctx, C.BEST_CHAIN_LABEL, 64, 530, 10, DIM);
  text(ctx, String(s.bestChain), 270, 532, 20, INK, "Georgia, serif", "right");
  text(ctx, C.BEST_MOVE_LABEL, 64, 568, 10, DIM);
  text(ctx, String(s.bestMove), 270, 570, 20, INK, "Georgia, serif", "right");
  spaced(ctx, "STRAIN / 00—03", 996, 164, 11, 2, GOLD);
  for (let i = 0; i <= C.MAX_STRAIN; i++) {
    sprite(s, ctx, `gems/beryl-${i}.png`, 1017 + i * 53, 210, 44);
    text(
      ctx,
      String(i).padStart(2, "0"),
      1017 + i * 53,
      251,
      10,
      i === C.MAX_STRAIN ? GOLD : DIM,
      "sans-serif",
      "center",
    );
  }
  text(ctx, "THE FLAW IS THE FUSE", 996, 291, 11, INK);
  wrap(
    ctx,
    "Every clear strains its neighbors. Cracked through? A touch shatters it for double.",
    996,
    322,
    214,
    15,
    DIM,
    25,
  );
  line(ctx, 996, 420, 220);
  const cuts = [
    ["brilliant", "4 IN A LINE", "Clears the ring."],
    ["star", "CROSSING LINES", "Takes row + column."],
    ["prism", "5 IN A LINE", "Takes every kind-mate."],
  ];
  cuts.forEach(([cut, label, sub], i) => {
    const y = 468 + i * 70;
    if (cut !== "prism") sprite(s, ctx, "gems/amber-0.png", 1017, y, 40);
    sprite(
      s,
      ctx,
      `gems/${cut === "prism" ? "prism-0" : cut}.png`,
      1017,
      y,
      40,
    );
    text(ctx, label, 1051, y - 4, 10, GOLD);
    text(ctx, sub, 1051, y + 16, 12, DIM);
  });
  const t = M.targets({ ...s, screen: "playing" })[0];
  button(ctx, t, C.PAUSE_LABEL, false, s.armedTarget === "pause");
}
function howto(s: M.State, ctx: Context) {
  spaced(ctx, "THE LAPIDARY’S HANDBOOK", 64, 66, 12, 3, GOLD);
  text(ctx, "Pressure is a possibility.", 64, 138, 54, INK, "Georgia, serif");
  const cols = [
    [
      "01",
      "TAKE HOLD",
      "Seven kinds of stone fill the grid. With a mouse, pen or finger, hold a gem, carry it onto a neighbor, then let go. Carry it back to withdraw the offer: nothing plays until you let go beside it.",
      "Three or more of one kind in a line shatter. A move that shatters nothing is refused. Falling stones can match again, and every step of the chain is worth more.",
    ],
    [
      "02",
      "FIND THE FLAW",
      "Every stone beside a clear takes strain. Three doses leave it flawed: cracked through and ready to go. A flawed stone shatters with any clear touching it, and is worth double.",
      "Reach the level target to move on. A round ends when no productive move remains. Look for worn corners: a small match beside one can become a beautiful chain.",
    ],
    [
      "03",
      "EARN A BETTER CUT",
      "Four in a line leaves a brilliant; it takes the ring around it. Five or more leaves a prism; swap it with a stone to take every stone of that kind. Crossing lines leave a star: the whole row and column go.",
      "Menus: ↑ / ↓, Enter or Space to choose. Escape or P pauses and resumes. M mutes all sound. Escape goes back from this page and the end of a round. The pointer works every menu too.",
    ],
  ];
  cols.forEach(([num, heading, p1, p2], i) => {
    const x = 64 + i * 400;
    line(ctx, x, 185, 350);
    text(ctx, num, x, 233, 22, TEAL, "Georgia, serif");
    spaced(ctx, heading, x + 48, 232, 12, 2, GOLD);
    let y = wrap(ctx, p1, x, 278, 346, 17, DIM, 27);
    y += 19;
    wrap(ctx, p2, x, y, 346, 17, DIM, 27);
  });
  button(ctx, M.targets(s)[0], C.BACK_LABEL, true, s.armedTarget === "back");
}
function overlay(s: M.State, ctx: Context) {
  ctx.fillStyle = "#06131be0";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#102831";
  ctx.fillRect(416, 146, 448, 478);
  ctx.strokeStyle = "#677368";
  ctx.lineWidth = 1;
  ctx.strokeRect(416.5, 146.5, 447, 477);
  spaced(ctx, "F A C E T", 586, 192, 11, 2, GOLD);
  const heading =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  text(ctx, heading, 640, 270, 38, INK, "Georgia, serif", "center");
  if (s.screen === "paused")
    text(
      ctx,
      "The stones can wait.",
      640,
      322,
      19,
      DIM,
      "Georgia, serif",
      "center",
    );
  else if (s.screen === "levelclear") {
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level}  /  COMPLETE`,
      640,
      309,
      12,
      GOLD,
      "sans-serif",
      "center",
    );
    text(
      ctx,
      `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     ·     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
      640,
      354,
      12,
      DIM,
      "sans-serif",
      "center",
    );
  } else {
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString()}     /     ${C.HUD_LEVEL_LABEL}  ${s.level}`,
      640,
      327,
      18,
      GOLD,
      "sans-serif",
      "center",
    );
  }
  line(ctx, 464, 382, 352);
  menu(s, ctx);
}
export function render(s: M.State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (s.screen === "title") title(s, ctx);
  else if (s.screen === "howto") howto(s, ctx);
  else {
    hud(s, ctx);
    if (s.board.cells.length) board(s, ctx);
    if (s.screen !== "playing") overlay(s, ctx);
  }
  footer(s, ctx);
  ctx.restore();
}
