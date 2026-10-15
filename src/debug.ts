import type { FacetState, Screen } from "./game";
import * as C from "./constants";
import * as M from "./model";

const amount = (n: number) => {
  if (!Number.isFinite(n)) throw new RangeError("Expected finite points");
  return n;
};
/** Poses never run the clock, play audio, or implicitly reconcile the board. */
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: M.State): FacetState => ({ ...M.initial(s.muted), art: s.art }),
  reconcile: (s: M.State): FacetState => ({ ...s }),
  snapshot: M.snapshot,
  setScreen: (s: M.State, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: M.State, menuIndex: number): FacetState => ({
    ...s,
    menuIndex: M.integer(menuIndex),
  }),
  loadBoard: (s: M.State, rows: readonly string[]): FacetState => ({
    ...s,
    board: M.loadBoard(rows),
  }),
  dealBoard: (s: M.State): FacetState => ({ ...s, board: M.deal() }),
  clearBoard: (s: M.State): FacetState => ({
    ...s,
    board: { cols: 0, rows: 0, cells: [] },
  }),
  setGem: (s: M.State, col: number, row: number, text: string): FacetState => {
    const i = M.index(M.cell(col, row));
    if (!s.board.cells[i]) throw new Error("No board in play");
    const gem = M.token(text, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, n) => (n === i ? gem : g)),
      },
    };
  },
  setRefillKinds: (s: M.State, col: number, kinds: string): FacetState => {
    M.cell(col, 0);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill kinds");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, n) => (n === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: M.State): FacetState => ({
    ...s,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  }),
  setScore: (s: M.State, score: number): FacetState => ({
    ...s,
    score: amount(score),
  }),
  setLevel: (s: M.State, level: number): FacetState => ({
    ...s,
    level: M.integer(level, 1),
  }),
  setLevelScore: (s: M.State, levelScore: number): FacetState => ({
    ...s,
    levelScore: amount(levelScore),
  }),
  setBestChain: (s: M.State, bestChain: number): FacetState => ({
    ...s,
    bestChain: M.integer(bestChain),
  }),
  setBestMove: (s: M.State, bestMove: number): FacetState => ({
    ...s,
    bestMove: amount(bestMove),
  }),
  setMoveScore: (s: M.State, moveScore: number): FacetState => ({
    ...s,
    moveScore: amount(moveScore),
  }),
  setSelection: (s: M.State, col: number, row: number): FacetState => ({
    ...s,
    selection: M.cell(col, row),
  }),
  clearSelection: (s: M.State): FacetState => ({ ...s, selection: null }),
  setOffer: (s: M.State, col: number, row: number): FacetState => ({
    ...s,
    offer: M.cell(col, row),
  }),
  clearOffer: (s: M.State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: M.State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: M.State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: M.State,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState => M.requestSwap(s, M.cell(colA, rowA), M.cell(colB, rowB)),
  pointerDown: (
    s: M.State,
    x: number,
    y: number,
    device: FacetState["pointer"]["device"] = "mouse",
  ): FacetState => M.pointer(s, "down", x, y, device),
  pointerMove: (
    s: M.State,
    x: number,
    y: number,
    device: FacetState["pointer"]["device"] = "mouse",
  ): FacetState => M.pointer(s, "move", x, y, device),
  pointerUp: (
    s: M.State,
    device: FacetState["pointer"]["device"] = "mouse",
  ): FacetState => M.pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
