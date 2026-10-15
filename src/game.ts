import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { Art } from "./assets";
import { loadArt } from "./assets";
import { debug } from "./debug";
import * as M from "./model";
import * as C from "./constants";
import { render } from "./view";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];

  /** Presentation records for the active swap and chain. */
  readonly motion?: {
    readonly a: CellRef;
    readonly b: CellRef;
  };
  readonly fragments?: readonly {
    readonly gem: GemState;
    readonly wave: number;
  }[];
  readonly flashes?: readonly CellRef[];
  readonly openingAt?: number;
  readonly art?: Art;
}

export type FacetDebugApi = typeof debug;
export const BACKGROUND = "#09171e";

/** All transitions, including pointer samples, run here before any drawing. */
export function update(
  state: DeepReadonly<FacetState>,
  api: UpdateApi,
  dt: number,
): FacetState {
  let s: FacetState = { ...state, simTime: state.simTime + dt };
  const cues = new Set<string>();
  const actions = Object.fromEntries(
    C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
  );
  if (actions.mute) api.audio.setMuted(!api.audio.muted());
  s = { ...s, muted: api.audio.muted() };
  if (actions.pause) s = M.pause(s);
  if (actions.back) s = M.back(s);
  if (s.screen !== "playing" && s.screen !== "howto") {
    if (actions.up) s = { ...s, menuIndex: (s.menuIndex + 1) % 2 };
    if (actions.down) s = { ...s, menuIndex: (s.menuIndex + 1) % 2 };
    if (actions.confirm) s = M.confirm(s);
  }
  for (const sample of api.input.pointerSamples()) {
    if (!sample.primary || (sample.button && sample.button !== "primary"))
      continue;
    const before = s;
    s = M.pointer(s, sample.type, sample.x, sample.y, sample.device);
    if (!M.same(before.selection, s.selection) && s.selection)
      cues.add(C.CUES.select);
    if (before.phase !== "swapping" && s.phase === "swapping")
      cues.add(C.CUES.swap);
    if (s.refusal && s.refusal !== before.refusal) cues.add(C.CUES.refuse);
  }
  const p = api.input.pointer();
  s = { ...s, pointer: { x: p.x, y: p.y, down: p.down, device: p.device } };
  if (s.screen === "playing") {
    if (s.refusal)
      s = {
        ...s,
        refusal:
          s.refusal.timer + dt >= C.REFUSAL_SECONDS
            ? null
            : { ...s.refusal, timer: s.refusal.timer + dt },
      };
    let remaining = dt;
    let ladder = 0;
    // Spend the whole interval, preserving overshoot at every timed boundary.
    while (remaining > 1e-10 && s.screen === "playing" && s.phase !== "idle") {
      const swapping = s.phase === "swapping";
      const timer = swapping ? s.swapTimer : s.stepTimer;
      const limit = swapping ? C.SWAP_SECONDS : M.stepHold(s);
      const spend = Math.min(remaining, Math.max(0, limit - timer));
      if (
        !swapping &&
        timer < M.landAt(s) &&
        timer + spend >= M.landAt(s) &&
        M.lastFall(s) > C.LAND_MIN_ROWS
      )
        cues.add(C.CUES.land);
      s = swapping
        ? { ...s, swapTimer: timer + spend }
        : { ...s, stepTimer: timer + spend };
      remaining -= spend;
      if (timer + spend + 1e-10 < limit) break;
      const result = M.resolve(s, swapping);
      if (result) {
        s = result.state;
        cues.add(C.CUES.clear);
        ladder = Math.max(ladder, Math.min(s.chainStep, C.MAX_MULTIPLIER));
        if (result.flawed) cues.add(C.CUES.flaw);
        if (result.cut) cues.add(C.CUES.cut);
      } else {
        s = M.finish(s);
        if (s.screen === "levelclear") cues.add(C.CUES.levelUp);
        if (s.screen === "gameover") cues.add(C.CUES.gameOver);
      }
    }
    if (ladder > 0) api.audio.play(`chain-${ladder}`);
  }
  // Keep an opening deal still while a menu is up, despite the global clock.
  if (s.screen !== "playing" && s.openingAt !== undefined)
    s = { ...s, openingAt: s.openingAt + dt };
  for (const cue of cues) api.audio.play(cue);
  const title = s.screen === "title" || s.screen === "howto";
  const music = title ? "title-music" : "play-music";
  const other = title ? "play-music" : "title-music";
  if (api.audio.looping(other)) api.audio.stop(other);
  if (!api.audio.looping(music)) api.audio.loop(music);
  return s;
}

export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    for (const key of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    api.diagnostics.register(
      "level target",
      (s) => C.LEVEL_TARGET_STEP * s.level,
    );
    api.diagnostics.register("multiplier", (s) =>
      Math.min(s.chainStep, C.MAX_MULTIPLIER),
    );
    api.diagnostics.register("lastFall", M.lastFall);
    api.diagnostics.register("legalSwap", (s) => M.legalSwap(s.board));
    api.diagnostics.register("selection", (s) =>
      s.selection ? `${s.selection.col}, ${s.selection.row}` : "-",
    );
    api.diagnostics.register("offer", (s) =>
      s.offer ? `${s.offer.col}, ${s.offer.row}` : "-",
    );
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    const art = await loadArt(api);
    return [{ ...M.initial(), art }, debug];
  },
  update,
  render,
};
