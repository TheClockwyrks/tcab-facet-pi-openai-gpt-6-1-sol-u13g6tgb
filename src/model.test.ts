import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as M from "./model";
import * as C from "./constants";
import { debug as d } from "./debug";
import type { FacetState } from "./game";

const rows = () =>
  Array.from({ length: C.GRID_ROWS }, (_, r) =>
    Array.from(
      { length: C.GRID_COLS },
      (_, c) => `${M.letters[(r * 2 + c) % C.GEM_KIND_COUNT]}0`,
    ).join(" "),
  );
const base = (): FacetState =>
  d.loadBoard(d.setScreen(M.initial(), "playing"), rows());
function set(s: FacetState, col: number, row: number, token: string) {
  return d.setGem(s, col, row, token);
}
function line(s = base(), length = 3, row = 4, col = 2) {
  for (let n = 0; n < length; n++) s = set(s, col + n, row, "R0");
  if (col + length < C.GRID_COLS) s = set(s, col + length, row, "A0");
  return s;
}
function noRandomRefill(s: FacetState) {
  for (let c = 0; c < C.GRID_COLS; c++)
    s = d.setRefillKinds(
      s,
      c,
      Array.from(
        { length: C.GRID_ROWS },
        (_, r) => M.letters[(r * 2 + c) % 7],
      ).join(""),
    );
  return s;
}
const resolve = (s: FacetState) => M.resolve(noRandomRefill(s), false)!.state;
beforeEach(() => {
  let seed = 17;
  vi.spyOn(Math, "random").mockImplementation(
    () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32,
  );
});
afterEach(() => vi.restoreAllMocks());

describe("board and opening deal", () => {
  it("starts with all declared title values and no board", () => {
    const s = M.initial();
    const snap = d.snapshot(s);
    expect(s.screen).toBe("title");
    expect(s.board.cells).toHaveLength(0);
    expect(s.refillKinds).toEqual(Array(8).fill(""));
    expect(snap.version).toBe(C.FACET_DEBUG_VERSION);
    expect(snap.lastFall).toBe(0);
    expect(snap.legalSwap).toBe(false);
    expect(snap.stepHold).toBe(C.STEP_SECONDS);
  });
  it("deals run-free, productive opening boards, with genuine incoming falls", () => {
    for (let n = 0; n < 60; n++) {
      const b = M.deal();
      expect(b.cells).toHaveLength(64);
      expect(M.runs(b)).toHaveLength(0);
      expect(M.legalSwap(b)).toBe(true);
      b.cells.forEach((g, i) => {
        expect(M.index(g)).toBe(i);
        expect(g.cut).toBe("plain");
        expect(g.strain).toBe(0);
        expect(g.fell).toBeGreaterThanOrEqual(g.row + 1);
      });
    }
  });
  it("parses every kind, damage and cut without settling", () => {
    for (const letter of M.letters)
      for (const strain of [0, 1, 2, 3])
        for (const cut of ["", "b", "s"]) {
          const g = M.token(`${letter}${strain}${cut}`, 3, 2);
          expect(g.kind).toBe(C.GEM_KINDS[M.letters.indexOf(letter)]);
          expect(g.strain).toBe(strain);
          expect(g.fell).toBe(0);
        }
    expect(M.token("X3", 0, 0)).toMatchObject({
      kind: null,
      cut: "prism",
      strain: 3,
    });
  });
  it.each(["R", "R4", "R-1", "Z0", "X0b", "R0p", "R01", " R0", "r0", ""])(
    "rejects malformed token %s",
    (t) => expect(() => M.token(t, 0, 0)).toThrow(),
  );
  it("rejects wrong dimensions and cells", () => {
    expect(() => M.loadBoard(rows().slice(1))).toThrow();
    expect(() => M.loadBoard([...rows().slice(1), "R0"])).toThrow();
    for (const [col, row] of [
      [-1, 0],
      [8, 0],
      [0, 8],
      [1.2, 2],
    ])
      expect(() => d.setGem(base(), col, row, "R0")).toThrow();
    expect(() => d.setGem(M.initial(), 0, 0, "R0")).toThrow();
  });
  it("reports exact logical cell geometry and hit-test ties", () => {
    expect([M.cellX(0), M.cellX(7), M.cellY(0), M.cellY(7)]).toEqual([
      388, 892, 144, 648,
    ]);
    expect(M.hitCell(424, 144)).toEqual({ col: 0, row: 0 });
    expect(M.hitCell(388, 180)).toEqual({ col: 0, row: 0 });
    expect(M.hitCell(424, 180)).toBeNull();
    expect(M.hitCell(-20, -20)).toBeNull();
  });
});

describe("move rules and maximal runs", () => {
  it("recognizes maximal rows and columns, not overlapping triples", () => {
    const s = line(base(), 6, 4, 0);
    const found = M.runs(s.board).filter((r) => r.horizontal);
    expect(found).toHaveLength(1);
    expect(found[0].cells).toHaveLength(6);
  });
  it("matches kind across damage and cuts, never a prism", () => {
    let s = line();
    s = set(s, 2, 4, "R2b");
    s = set(s, 3, 4, "R3s");
    expect(M.runs(s.board).length).toBeGreaterThan(0);
    s = set(s, 3, 4, "X0");
    expect(M.runs(s.board)).toHaveLength(0);
  });
  it("refuses unproductive and nonadjacent moves without changing the board", () => {
    const s = base();
    for (const b of [
      { col: 1, row: 0 },
      { col: 2, row: 2 },
      { col: 0, row: 0 },
    ]) {
      const n = M.requestSwap(s, { col: 0, row: 0 }, b);
      expect(n.board).toBe(s.board);
      expect(n.phase).toBe("idle");
      expect(n.refusal?.timer).toBe(0);
    }
  });
  it("refuses while a swap or resolution is already running", () => {
    for (const phase of ["swapping", "resolving"] as const) {
      const s = { ...line(), phase };
      expect(
        M.requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 }).board,
      ).toBe(s.board);
    }
  });
  it("accepts productive adjacent exchanges and zeroes just the travelers’ fell", () => {
    let s = base();
    s = set(s, 0, 0, "R0");
    s = set(s, 1, 0, "A0");
    s = set(s, 2, 0, "R0");
    s = set(s, 1, 1, "R2b");
    const n = d.requestSwap(s, 1, 0, 1, 1);
    expect(n.phase).toBe("swapping");
    expect(n.chainStep).toBe(0);
    expect(n.board.cells[1]).toMatchObject({
      kind: "ruby",
      strain: 2,
      cut: "brilliant",
      fell: 0,
    });
    expect(s.board.cells[1].kind).toBe("amber");
    expect(n.moveScore).toBe(0);
  });
  it("accepts a prism regardless of whether the exchange forms a run", () => {
    const s = set(base(), 0, 0, "X0");
    expect(d.requestSwap(s, 0, 0, 1, 0).phase).toBe("swapping");
  });
});

describe("resolution, pressure and waves", () => {
  it("scores the seed at the chain multiplier and pressures neighbors only once", () => {
    const s = line();
    const result = M.resolve(s, false)!;
    expect(result.state.lastCleared).toBe(3);
    expect(result.state.lastPoints).toBe(C.BASE_SCORE * 3);
    expect(result.state.lastWaves).toBe(0);
    expect(result.state.score).toBe(30);
    expect(result.state.levelScore).toBe(30);
    expect(result.state.moveScore).toBe(30);
    expect(result.state.board.cells.some((g) => g.strain === 1)).toBe(true);
    expect(s.board.cells.every((g) => g.strain === 0)).toBe(true);
  });
  it("includes recursively touching flawed stones, at minimum expansion waves, for double", () => {
    let s = line();
    s = set(s, 2, 5, "A3");
    s = set(s, 2, 6, "J3");
    s = set(s, 3, 6, "C3");
    const n = resolve(s);
    expect(n.lastCleared).toBe(6);
    expect(n.lastWaves).toBe(3);
    expect(n.lastPoints).toBe(90);
    expect(
      n.fragments?.find((f) => f.gem.col === 3 && f.gem.row === 6)?.wave,
    ).toBe(3);
  });
  it("expands brilliant rings and star rows/columns to closure", () => {
    let s = line();
    s = set(s, 3, 4, "R0b");
    s = set(s, 4, 5, "C0s");
    const n = resolve(s);
    expect(n.lastCleared).toBe(19);
    expect(n.lastWaves).toBeGreaterThan(0);
    expect(n.fragments?.some((f) => f.gem.col === 7 && f.gem.row === 5)).toBe(
      true,
    );
  });
  it("caps the multiplier at eight and scores old strain before raising it", () => {
    let s = line();
    s = set(s, 2, 4, "R3");
    s = { ...s, chainStep: 20 };
    const n = resolve(s);
    expect(n.lastPoints).toBe((20 + 10 + 10) * C.MAX_MULTIPLIER);
  });
  it("raises strain to flawed, but does not clear that newly flawed stone in this step", () => {
    const s = set(line(), 3, 5, "B2");
    const result = M.resolve(s, false)!;
    expect(result.flawed).toBe(true);
    expect(result.state.lastCleared).toBe(3);
    expect(
      result.state.board.cells.find((g) => g.col === 3 && g.row === 5)?.strain,
    ).toBe(3);
  });
  it("prism-kind seeding takes every kind-mate, not all other stones or runs", () => {
    const s = d.requestSwap(set(base(), 0, 0, "X0"), 0, 0, 1, 0);
    const kind = s.board.cells[0].kind;
    const expected = s.board.cells.filter(
      (g) => g.kind === kind || g.cut === "prism",
    ).length;
    const n = M.resolve(s, true)!.state;
    expect(n.lastCleared).toBe(expected);
    expect(n.flashes).toHaveLength(0);
  });
  it("a prism-prism swap clears the whole board and makes no cuts", () => {
    let s = set(set(base(), 0, 0, "X0"), 1, 0, "X3");
    s = d.requestSwap(s, 0, 0, 1, 0);
    const n = M.resolve(s, true)!.state;
    expect(n.lastCleared).toBe(64);
    expect(n.lastPoints).toBe(650);
    expect(n.flashes).toHaveLength(0);
    expect(n.board.cells.every((g) => g.cut === "plain")).toBe(true);
  });
  it("returns no resolution when there is no seed", () =>
    expect(M.resolve(base(), false)).toBeNull());
});

describe("earned cuts and gravity", () => {
  it.each([
    [4, "brilliant"],
    [5, "prism"],
    [6, "prism"],
  ] as const)(
    "creates %s-run cut %s at the middle without swap contact",
    (length, cut) => {
      const n = resolve(line(base(), length, 4, 0));
      const g = n.board.cells.find((g) => g.cut === cut)!;
      expect(g).toBeDefined();
      expect(g.col).toBe(Math.floor((length - 1) / 2));
      expect(g.strain).toBe(0);
      expect(g.kind).toBe(cut === "prism" ? null : "ruby");
    },
  );
  it("places a created cut at the lower-index swapped cell in a run", () => {
    let s = line(base(), 4, 4, 1);
    s = {
      ...s,
      motion: { a: { col: 3, row: 4 }, b: { col: 2, row: 4 } },
    };
    const n = resolve(s);
    expect(n.board.cells.find((g) => g.cut === "brilliant")?.col).toBe(2);
  });
  it("creates a star at crossing maximal lines", () => {
    let s = line(base(), 3, 4, 2);
    s = set(s, 3, 3, "R0");
    s = set(s, 3, 5, "R0");
    const n = resolve(s);
    expect(n.board.cells.find((g) => g.cut === "star")?.col).toBe(3);
  });
  it("prism creation wins where a five-run cut and crossing star share a cell", () => {
    let s = line(base(), 5, 4, 1);
    s = set(s, 3, 3, "R0");
    s = set(s, 3, 5, "R0");
    const n = resolve(s);
    expect(
      n.board.cells.find((g) => g.col === 3 && g.cut === "prism"),
    ).toBeDefined();
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(false);
  });
  it("preserves survivor order, cut and damage, and records exact fall distances", () => {
    let s = line();
    s = set(s, 2, 1, "S2s");
    const n = resolve(s);
    const g = n.board.cells.find((g) => g.col === 2 && g.cut === "star")!;
    expect(g.row).toBe(2);
    expect(g.fell).toBe(1);
    expect(g.strain).toBe(2);
    expect(n.board.cells[2].fell).toBeGreaterThanOrEqual(1);
    expect(M.finish(n).board).toBe(n.board);
  });
  it("reads refill poses by destination row and leaves poses standing", () => {
    let s = line(base(), 3, 0, 0);
    s = d.setRefillKinds(s, 0, "M");
    const n = M.resolve(s, false)!.state;
    expect(n.board.cells[0].kind).toBe("amethyst");
    expect(n.refillKinds[0]).toBe("M");
    expect(n.board.cells[0].fell).toBeGreaterThanOrEqual(1);
  });
});

describe("debug poses and derived readings", () => {
  it("poses scalars independently, including on unrelated screens", () => {
    let s = base();
    const board = s.board;
    s = d.setScore(s, 900);
    s = d.setLevel(s, 5);
    s = d.setLevelScore(s, 600);
    s = d.setBestMove(s, 111);
    s = d.setBestChain(s, 7);
    s = d.setMoveScore(s, 33);
    s = d.setMenuIndex(s, 99);
    const snap = d.snapshot(s);
    expect(snap).toMatchObject({
      score: 900,
      level: 5,
      levelTarget: 10000,
      levelScore: 600,
      bestMove: 111,
      bestChain: 7,
      moveScore: 33,
      menuIndex: 99,
    });
    expect(s.board).toBe(board);
    expect(d.reconcile(s)).toEqual(s);
    expect(d.reconcile(d.reconcile(s))).toEqual(s);
  });
  it("poses selection and offer separately, even on an absent board", () => {
    let s = d.setSelection(M.initial(), 7, 7);
    s = d.setOffer(s, 0, 0);
    s = d.clearSelection(s);
    expect(s.offer).toEqual({ col: 0, row: 0 });
    s = d.clearOffer(s);
    expect(s.offer).toBeNull();
  });
  it("clearChain, clearBoard, and clearRefusal each change only their own subject", () => {
    const s = {
      ...base(),
      phase: "resolving" as const,
      chainStep: 4,
      stepTimer: 0.3,
      refusal: { a: { col: 0, row: 0 }, b: { col: 1, row: 0 }, timer: 0.1 },
    };
    expect(d.clearChain(s)).toMatchObject({
      phase: "idle",
      chainStep: 0,
      stepTimer: 0,
      swapTimer: 0,
      board: s.board,
    });
    expect(d.clearBoard(s).phase).toBe("resolving");
    expect(d.clearRefusal(s).refusal).toBeNull();
  });
  it("dealBoard changes just the board and ignores refill poses", () => {
    const s = d.setRefillKinds(d.setScore(base(), 777), 0, "RRRRRRRR");
    const n = d.dealBoard(s);
    expect(n.score).toBe(777);
    expect(n.refillKinds).toEqual(s.refillKinds);
    expect(M.runs(n.board)).toHaveLength(0);
    expect(d.clearRefillKinds(n).refillKinds).toEqual(Array(8).fill(""));
  });
  it("reset restores declared fields while preserving the engine mute mirror", () => {
    const s = { ...base(), muted: true, score: 40, simTime: 30 };
    expect(d.reset(s)).toEqual({ ...M.initial(true), art: undefined });
  });
  it("validates every fixed argument domain loudly", () => {
    expect(() => d.setLevel(base(), 0)).toThrow();
    expect(() => d.setBestChain(base(), -1)).toThrow();
    expect(() => d.setMenuIndex(base(), -0.1)).toThrow();
    expect(() => d.setScore(base(), NaN)).toThrow();
    expect(() => d.setRefillKinds(base(), 0, "X")).toThrow();
    expect(() => d.setRefillKinds(base(), 8, "R")).toThrow();
    expect(() => d.setScreen(base(), "other" as never)).toThrow();
    expect(() => d.pointerDown(base(), NaN, 0)).toThrow();
    expect(() => d.pointerDown(base(), 0, 0, "other" as never)).toThrow();
  });
  it("derives snapshots from newly posed boards and screens without running anything", () => {
    const s = d.setScreen(set(base(), 0, 0, "X0"), "paused");
    const n = d.snapshot(s);
    expect(n.legalSwap).toBe(true);
    expect(n.targets.map((t) => t.id)).toEqual(["menu-0", "menu-1"]);
    expect(n.board.cells[0]).toMatchObject({ x: 388, y: 144, kind: null });
    expect(s.score).toBe(0);
  });
});

describe("pointer path and menus", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "selects, offers, withdraws and releases immediately with %s",
    (device) => {
      let s = base();
      s = d.pointerDown(s, M.cellX(2), M.cellY(2), device);
      expect(s.selection).toEqual({ col: 2, row: 2 });
      s = d.pointerMove(s, M.cellX(3), M.cellY(2), device);
      expect(s.offer).toEqual({ col: 3, row: 2 });
      s = d.pointerMove(s, M.cellX(2), M.cellY(2), device);
      expect(s.offer).toBeNull();
      s = d.pointerUp(s, device);
      expect(s.selection).not.toBeNull();
      expect(s.phase).toBe("idle");
      expect(s.pointer.device).toBe(device);
    },
  );
  it("tap-tap neighbors request on release, and refusal clears selection", () => {
    let s = base();
    s = d.pointerUp(d.pointerDown(s, 388, 144));
    s = d.pointerDown(s, 460, 144);
    expect(s.offer).toEqual({ col: 1, row: 0 });
    expect(s.phase).toBe("idle");
    s = d.pointerUp(s);
    expect(s.refusal).not.toBeNull();
    expect(s.selection).toBeNull();
  });
  it("remote presses reselect; misses deselect; remote held movement does not change an offer", () => {
    let s = d.pointerDown(base(), 388, 144);
    s = d.pointerMove(s, 460, 144);
    s = d.pointerMove(s, 1200, 650);
    expect(s.offer).toEqual({ col: 1, row: 0 });
    s = d.pointerDown(s, 892, 648);
    expect(s.selection).toEqual({ col: 7, row: 7 });
    s = d.pointerDown(s, 1, 1);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("pressing the selected gem withdraws an existing offer", () => {
    let s = d.setOffer(d.setSelection(base(), 0, 0), 1, 0);
    s = d.pointerDown(s, 388, 144);
    expect(s.offer).toBeNull();
  });
  it("all targets are large, disjoint, in bounds, and actually take their controls", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      const s = d.setScreen(base(), screen);
      const ts = M.targets(s);
      ts.forEach((t) => {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
      });
      if (ts.length === 2)
        expect(ts[0].y + ts[0].h).toBeLessThanOrEqual(ts[1].y);
      const t = ts[0];
      const n = d.pointerUp(d.pointerDown(s, t.x + t.w / 2, t.y + t.h / 2));
      expect(n.screen).not.toBe(screen);
    }
  });
  it("hover highlights, release outside cancels, and press outside cannot activate an item", () => {
    const s = M.initial(),
      t = M.targets(s)[1];
    let n = d.pointerMove(s, t.x + 10, t.y + 10);
    expect(n.menuIndex).toBe(1);
    n = d.pointerDown(n, t.x + 10, t.y + 10);
    n = d.pointerMove(n, 20, 20);
    n = d.pointerUp(n);
    expect(n.screen).toBe("title");
    expect(n.armedTarget).toBeNull();
    n = d.pointerDown(n, 20, 20);
    n = d.pointerMove(n, t.x + 10, t.y + 10);
    n = d.pointerUp(n);
    expect(n.screen).toBe("title");
  });
  it("returns from howto with the second item selected", () => {
    const s = M.confirm({ ...M.initial(), menuIndex: 1 });
    expect(s.screen).toBe("howto");
    expect(M.back(s).menuIndex).toBe(1);
    expect(M.back(s).screen).toBe("title");
  });
  it("resume preserves the board; quit puts the round down but retains its figures", () => {
    const s = { ...base(), score: 222, selection: { col: 0, row: 0 } };
    expect(M.confirm(M.pause(s)).board).toBe(s.board);
    const n = M.confirm({ ...M.pause(s), menuIndex: 1 });
    expect(n.screen).toBe("title");
    expect(n.score).toBe(222);
    expect(n.board.cells).toHaveLength(0);
    expect(n.selection).toBeNull();
  });
  it("continue opens a new level, preserving round score and resetting level records", () => {
    const s = {
      ...base(),
      screen: "levelclear" as const,
      score: 6000,
      level: 3,
      bestMove: 900,
      bestChain: 5,
      levelScore: 6000,
    };
    const n = M.confirm(s);
    expect(n).toMatchObject({
      screen: "playing",
      level: 4,
      score: 6000,
      levelScore: 0,
      bestMove: 0,
      bestChain: 0,
    });
    expect(M.runs(n.board)).toHaveLength(0);
  });
  it("gameover back leaves a board standing; play again is always fresh", () => {
    const s = { ...base(), screen: "gameover" as const, score: 7000, level: 4 };
    expect(M.back(s).board).toBe(s.board);
    expect(M.confirm(s)).toMatchObject({
      score: 0,
      level: 1,
      levelScore: 0,
      screen: "playing",
    });
  });
  it("only settling tests level and round conditions, with level-clear priority", () => {
    const s = base();
    expect(M.legalSwap(s.board)).toBe(false);
    expect(d.reconcile(s).screen).toBe("playing");
    expect(M.finish(s).screen).toBe("gameover");
    expect(M.finish({ ...s, levelScore: 2000 }).screen).toBe("levelclear");
  });
});
