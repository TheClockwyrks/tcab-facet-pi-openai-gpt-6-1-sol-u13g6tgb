import type { DeepReadonly } from "ts-essentials";
import type {
  BoardState,
  CellRef,
  FacetState,
  GemKind,
  GemState,
  Cut,
} from "./game";
import * as C from "./constants";

export type State = DeepReadonly<FacetState>;
export const letters = "RACJBSM";
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (c: CellRef) => c.row * C.GRID_COLS + c.col;
export const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const same = (a: CellRef | null, b: CellRef | null) =>
  a !== null && b !== null && a.col === b.col && a.row === b.row;
export function integer(n: number, min = 0): number {
  if (!Number.isInteger(n) || n < min)
    throw new RangeError(`Expected an integer >= ${min}: ${n}`);
  return n;
}
export function cell(col: number, row: number): CellRef {
  integer(col);
  integer(row);
  if (col >= C.GRID_COLS || row >= C.GRID_ROWS)
    throw new RangeError("Cell outside board");
  return { col, row };
}
export function token(text: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(text))
    throw new Error(`Invalid gem: ${text}`);
  return {
    col,
    row,
    kind: text[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(text[0])],
    strain: Number(text[1]),
    cut:
      text[0] === "X"
        ? "prism"
        : text[2] === "b"
          ? "brilliant"
          : text[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function loadBoard(rows: readonly string[]): BoardState {
  if (rows.length !== C.GRID_ROWS) throw new Error("Expected eight rows");
  const cells = rows.flatMap((line, row) => {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== C.GRID_COLS)
      throw new Error("Expected eight columns");
    return tokens.map((t, col) => token(t, col, row));
  });
  return { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
}
export function initial(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  };
}
export interface Run {
  readonly cells: readonly number[];
  readonly horizontal: boolean;
}
export function runs(board: DeepReadonly<BoardState>): Run[] {
  const result: Run[] = [];
  for (const horizontal of [true, false]) {
    for (
      let major = 0;
      major < (horizontal ? board.rows : board.cols);
      major++
    ) {
      let start = 0;
      const length = horizontal ? board.cols : board.rows;
      const at = (n: number) =>
        horizontal ? major * board.cols + n : n * board.cols + major;
      while (start < length) {
        const kind = board.cells[at(start)].kind;
        let end = start + 1;
        while (
          end < length &&
          kind !== null &&
          board.cells[at(end)].kind === kind
        )
          end++;
        if (kind !== null && end - start >= C.MATCH_MIN)
          result.push({
            cells: Array.from({ length: end - start }, (_, n) => at(start + n)),
            horizontal,
          });
        start = end;
      }
    }
  }
  return result;
}
export function exchange(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): BoardState {
  const ia = index(a),
    ib = index(b);
  return {
    ...board,
    cells: board.cells.map((g, i) =>
      i === ia
        ? { ...board.cells[ib], ...a, fell: 0 }
        : i === ib
          ? { ...board.cells[ia], ...b, fell: 0 }
          : g,
    ),
  };
}
export function productive(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): boolean {
  if (!board.cells[index(a)] || !board.cells[index(b)] || !adjacent(a, b))
    return false;
  return (
    board.cells[index(a)].cut === "prism" ||
    board.cells[index(b)].cut === "prism" ||
    runs(exchange(board, a, b)).length > 0
  );
}
export function legalSwap(board: DeepReadonly<BoardState>): boolean {
  return board.cells.some((g) =>
    [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ].some(
      (b) =>
        b.col < board.cols && b.row < board.rows && productive(board, g, b),
    ),
  );
}
const randomKind = (): GemKind =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        );
        cells.push({
          col,
          row,
          kind,
          cut: "plain",
          strain: 0,
          fell: C.GRID_ROWS,
        });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export function requestSwap(s: State, a: CellRef, b: CellRef): FacetState {
  if (s.phase !== "idle" || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const board = exchange(s.board, a, b);
  return {
    ...s,
    board,
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    motion: { a, b },
    fragments: [],
    flashes: [],
    openingAt: undefined,
  };
}
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const landAt = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
export const stepHold = (s: State) => landAt(s) + C.STEP_SECONDS;
function neighbors(i: number, diagonals = false): number[] {
  const a = ref(i),
    out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (
        (dx === 0 && dy === 0) ||
        (!diagonals && Math.abs(dx) + Math.abs(dy) !== 1)
      )
        continue;
      const col = a.col + dx,
        row = a.row + dy;
      if (col >= 0 && col < C.GRID_COLS && row >= 0 && row < C.GRID_ROWS)
        out.push(index({ col, row }));
    }
  return out;
}
export interface StepResult {
  readonly state: FacetState;
  readonly flawed: boolean;
  readonly cut: boolean;
}
/** Resolve one closure, scoring the old strain before applying pressure and gravity. */
export function resolve(s: State, first: boolean): StepResult | null {
  const cells = s.board.cells;
  let found = runs(s.board);
  let seed = found.flatMap((r) => [...r.cells]);
  if (first && s.motion) {
    const motion = s.motion;
    const a = cells[index(motion.a)],
      b = cells[index(motion.b)];
    if (a.cut === "prism" || b.cut === "prism") {
      found = [];
      seed = cells.flatMap((g, i) =>
        (a.cut === "prism" && b.cut === "prism") ||
        g.kind === (a.cut === "prism" ? b.kind : a.kind) ||
        (a.cut === "prism" && i === index(motion.a)) ||
        (b.cut === "prism" && i === index(motion.b))
          ? [i]
          : [],
      );
    }
  }
  if (seed.length === 0) return null;
  const waves = new Map<number, number>();
  const queue = [...new Set(seed)];
  queue.forEach((i) => waves.set(i, 0));
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = cells[i];
    const extra = neighbors(i).filter((n) => cells[n].strain === C.MAX_STRAIN);
    if (g.cut === "brilliant") extra.push(...neighbors(i, true));
    if (g.cut === "star")
      cells.forEach((other, n) => {
        if (other.col === g.col || other.row === g.row) extra.push(n);
      });
    for (const n of extra)
      if (!waves.has(n)) {
        waves.set(n, waves.get(i)! + 1);
        queue.push(n);
      }
  }
  const chainStep = first ? 1 : s.chainStep + 1;
  const points = queue.reduce(
    (p, i) =>
      p +
      (cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        Math.min(chainStep, C.MAX_MULTIPLIER),
    0,
  );
  const created = new Map<number, Cut>();
  const rank = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  const create = (i: number, cut: Cut) => {
    if (rank[cut] > rank[created.get(i) ?? "plain"]) created.set(i, cut);
  };
  for (const run of found) {
    if (run.cells.length >= 4) {
      const swapped = s.motion
        ? [index(s.motion.a), index(s.motion.b)]
            .filter((i) => run.cells.includes(i))
            .sort((a, b) => run.cells.indexOf(a) - run.cells.indexOf(b))
        : [];
      create(
        swapped[0] ?? run.cells[Math.floor((run.cells.length - 1) / 2)],
        run.cells.length >= 5 ? "prism" : "brilliant",
      );
    }
    for (const cross of found)
      if (cross.horizontal !== run.horizontal)
        for (const i of run.cells)
          if (cross.cells.includes(i)) create(i, "star");
  }
  let flawed = false;
  const remaining: (GemState | null)[] = cells.map((g, i) => {
    if (waves.has(i)) {
      const cut = created.get(i);
      return cut
        ? {
            ...g,
            cut,
            kind: cut === "prism" ? null : g.kind,
            strain: 0,
            fell: 0,
          }
        : null;
    }
    const strain = Math.min(
      C.MAX_STRAIN,
      g.strain + (neighbors(i).some((n) => waves.has(n)) ? 1 : 0),
    );
    if (strain === C.MAX_STRAIN && g.strain < strain) flawed = true;
    return { ...g, strain, fell: 0 };
  });
  const settled: GemState[] = [];
  for (let col = 0; col < C.GRID_COLS; col++) {
    const survivors = remaining.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const empty = C.GRID_ROWS - survivors.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      if (row < empty) {
        const letter = s.refillKinds[col]?.[row];
        settled.push({
          col,
          row,
          kind: letter ? C.GEM_KINDS[letters.indexOf(letter)] : randomKind(),
          strain: 0,
          cut: "plain",
          fell: empty,
        });
      } else {
        const g = survivors[row - empty];
        settled.push({ ...g, row, fell: row - g.row });
      }
    }
  }
  settled.sort((a, b) => index(a) - index(b));
  return {
    flawed,
    cut: created.size > 0,
    state: {
      ...s,
      board: { ...s.board, cells: settled },
      phase: "resolving",
      chainStep,
      swapTimer: 0,
      stepTimer: 0,
      lastCleared: queue.length,
      lastPoints: points,
      lastWaves: Math.max(...waves.values()),
      score: s.score + points,
      levelScore: s.levelScore + points,
      moveScore: s.moveScore + points,
      bestChain: Math.max(s.bestChain, chainStep),
      fragments: queue.map((i) => ({ gem: cells[i], wave: waves.get(i)! })),
      flashes: [...created.keys()].map(ref),
      openingAt: undefined,
    },
  };
}
export function finish(s: State): FacetState {
  const screen =
    s.levelScore >= C.LEVEL_TARGET_STEP * s.level
      ? "levelclear"
      : !legalSwap(s.board)
        ? "gameover"
        : s.screen;
  return {
    ...s,
    screen,
    menuIndex: 0,
    armedTarget: null,
    phase: "idle",
    chainStep: 0,
    stepTimer: 0,
    swapTimer: 0,
    bestMove: Math.max(s.bestMove, s.moveScore),
    fragments: [],
    flashes: [],
    motion: undefined,
  };
}
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function targets(s: State): Target[] {
  if (s.screen === "playing")
    return [
      {
        id: "pause",
        x: 1088,
        y: 36,
        w: C.TARGET_MIN_W + 32,
        h: C.TARGET_MIN_H,
      },
    ];
  if (s.screen === "howto")
    return [{ id: "back", x: 1060, y: 616, w: 144, h: C.TARGET_MIN_H }];
  return [0, 1].map((i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 164 : 464,
    y: (s.screen === "title" ? 398 : 412) + i * 88,
    w: 352,
    h: C.TARGET_MIN_H,
  }));
}
export function show(
  s: State,
  screen: FacetState["screen"],
  menuIndex = 0,
): FacetState {
  return { ...s, screen, menuIndex, armedTarget: null };
}
export function fresh(s: State): FacetState {
  return {
    ...initial(s.muted),
    art: s.art,
    screen: "playing",
    board: deal(),
    pointer: s.pointer,
    simTime: s.simTime,
    openingAt: s.simTime,
  };
}
export function confirm(s: State): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? fresh(s) : show(s, "howto");
  if (s.screen === "paused" && s.menuIndex === 0) return show(s, "playing");
  if (s.screen === "gameover" && s.menuIndex === 0) return fresh(s);
  if (s.screen === "levelclear" && s.menuIndex === 0)
    return {
      ...s,
      screen: "playing",
      menuIndex: 0,
      level: s.level + 1,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
      board: deal(),
      selection: null,
      offer: null,
      armedTarget: null,
      openingAt: s.simTime,
    };
  return {
    ...show(s, "title"),
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    fragments: [],
    flashes: [],
    motion: undefined,
    openingAt: undefined,
  };
}
export function back(s: State): FacetState {
  return s.screen === "howto"
    ? show(s, "title", 1)
    : s.screen === "gameover"
      ? show(s, "title")
      : { ...s };
}
export function pause(s: State): FacetState {
  return s.screen === "playing"
    ? show(s, "paused")
    : s.screen === "paused"
      ? show(s, "playing")
      : { ...s };
}
export function hitCell(x: number, y: number): CellRef | null {
  let nearest: CellRef | null = null,
    distance = C.GEM_HIT_R * C.GEM_HIT_R + 0.00001;
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const d = (x - cellX(col)) ** 2 + (y - cellY(row)) ** 2;
      if (d < distance) {
        distance = d;
        nearest = { col, row };
      }
    }
  return nearest;
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: FacetState["pointer"]["device"] = "mouse",
): FacetState {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  let next: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" || (type === "move" && s.pointer.down),
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (!s.pointer.down || type === "down"))
    next = { ...next, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") {
    next = { ...next, armedTarget: target?.id ?? null };
    if (target) return next;
  }
  if (type === "up") {
    next = { ...next, armedTarget: null };
    if (target && target.id === s.armedTarget)
      return target.id === "pause"
        ? pause(next)
        : target.id === "back"
          ? back(next)
          : confirm(next);
    if (s.armedTarget) return next;
    if (s.screen === "playing" && s.selection && s.offer)
      return {
        ...requestSwap(next, s.selection, s.offer),
        selection: null,
        offer: null,
      };
    return next;
  }
  if (s.screen !== "playing" || target) return next;
  const c = hitCell(x, y);
  if (type === "down") {
    if (!c) return { ...next, selection: null, offer: null };
    if (!s.selection || (!same(s.selection, c) && !adjacent(s.selection, c)))
      return { ...next, selection: c, offer: null };
    return { ...next, offer: same(s.selection, c) ? null : c };
  }
  if (s.pointer.down && s.selection && c) {
    if (same(s.selection, c)) return { ...next, offer: null };
    if (adjacent(s.selection, c)) return { ...next, offer: c };
  }
  return next;
}
export function snapshot(s: State) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection,
    offer: s.offer,
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
