import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConstantClock } from "@clockwyrks/simple-2d";
import { fakeDecoders, harness, event } from "./test-support";
import * as M from "./model";
import * as C from "./constants";
import { game, update } from "./game";
import type { FacetState } from "./game";
import type { UpdateApi } from "@clockwyrks/simple-2d";

beforeEach(fakeDecoders);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const rows = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => `${M.letters[(r * 2 + c) % 7]}0`).join(
    " ",
  ),
);
async function setup(step = 1000 / 60) {
  const h = await harness(step);
  const { engine: e, d } = h;
  e.apply((s) => d.setScreen(s, "playing"));
  e.apply((s) => d.loadBoard(s, rows));
  e.apply((s) => d.setGem(s, 0, 0, "R0"));
  e.apply((s) => d.setGem(s, 1, 0, "A0"));
  e.apply((s) => d.setGem(s, 2, 0, "R0"));
  e.apply((s) => d.setGem(s, 1, 1, "R0"));
  for (let c = 0; c < 8; c++)
    e.apply((s) =>
      d.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => M.letters[(r * 2 + c) % 7]).join(
          "",
        ),
      ),
    );
  return h;
}
const key = (events: EventTarget, code: string) => {
  event(events, "keydown", { code });
  event(events, "keyup", { code });
};

describe("real engine lifecycle and clocks", () => {
  it("awaits all committed assets, registers inputs and pure diagnostics, renders every screen", async () => {
    const { engine: e, d } = await harness();
    expect(e.state.art?.images["gems/frame.png"]).toBeDefined();
    expect(Object.keys(e.state.art!.images)).toHaveLength(109);
    const old = d.snapshot(e.state);
    const readings = e.diagnostics();
    expect(readings.length).toBeGreaterThanOrEqual(19);
    expect(readings.every((r) => r.error === undefined)).toBe(true);
    expect(d.snapshot(e.state)).toEqual(old);
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      e.apply((s) => d.dealBoard(s));
      e.apply((s) => d.setScreen(s, screen));
      await e.advance(1);
    }
    e.destroy();
  });
  it("accepts ordered primary pointer samples and ignores a second contact", async () => {
    const { engine: e, events } = await setup();
    const p = (name: string, x: number, y: number, primary = true) =>
      event(events, name, {
        clientX: x,
        clientY: y,
        pointerId: primary ? 1 : 2,
        pointerType: "touch",
        isPrimary: primary,
        button: 0,
        buttons: name === "pointerup" ? 0 : 1,
      });
    p("pointerdown", 460, 216);
    p("pointerdown", 892, 648, false);
    p("pointermove", 460, 144);
    p("pointerup", 460, 144);
    await e.advance(1);
    expect(e.state.phase).toBe("swapping");
    expect(e.state.selection).toBeNull();
    expect(e.state.pointer.device).toBe("touch");
    e.destroy();
  });
  it("keeps the first step behind the complete swap span and carries overshoot", async () => {
    const { engine: e, d } = await setup(10);
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(17);
    expect(e.state.phase).toBe("swapping");
    expect(e.state.score).toBe(0);
    await e.advance(1);
    expect(e.state.phase).toBe("resolving");
    expect(e.state.chainStep).toBe(1);
    expect(e.state.lastCleared).toBe(3);
    expect(e.state.stepTimer).toBeCloseTo(0);
    expect(e.state.swapTimer).toBe(0);
    await e.advance(1);
    expect(e.state.stepTimer).toBeCloseTo(0.01);
    e.destroy();
  });
  it("resolves identically across a single large interval and fine partitions", async () => {
    const a = await setup(10),
      b = await setup(1000);
    a.engine.apply((s) => a.d.requestSwap(s, 1, 1, 1, 0));
    b.engine.apply((s) => b.d.requestSwap(s, 1, 1, 1, 0));
    await a.engine.advance(100);
    await b.engine.advance(1);
    const sa = a.d.snapshot(a.engine.state),
      sb = b.d.snapshot(b.engine.state);
    expect(sa.board).toEqual(sb.board);
    expect(sa.score).toBe(sb.score);
    expect(sa.phase).toBe(sb.phase);
    expect(sa.stepTimer).toBeCloseTo(sb.stepTimer);
    a.engine.destroy();
    b.engine.destroy();
  });
  it("stops board timers and refusal on pause but not simulation time", async () => {
    const { engine: e, d, events } = await setup(10);
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(4);
    key(events, "Escape");
    await e.advance(1);
    const timer = e.state.swapTimer,
      time = e.state.simTime;
    expect(e.state.screen).toBe("paused");
    await e.advance(20);
    expect(e.state.swapTimer).toBe(timer);
    expect(e.state.simTime).toBeCloseTo(time + 0.2);
    key(events, "KeyP");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    expect(e.state.swapTimer).toBeCloseTo(timer + 0.01);
    e.destroy();
  });
  it("expires refusals after exactly the active game span", async () => {
    const { engine: e, d } = await setup(10);
    e.apply((s) => d.requestSwap(s, 0, 0, 7, 7));
    await e.advance(29);
    expect(e.state.refusal).not.toBeNull();
    await e.advance(1);
    expect(e.state.refusal).toBeNull();
    e.destroy();
  });
  it("leaves fell intact after a chain comes to rest and records best move", async () => {
    const { engine: e, d } = await setup(10);
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(100);
    expect(e.state.phase).toBe("idle");
    expect(e.state.chainStep).toBe(0);
    expect(e.state.swapTimer).toBe(0);
    expect(e.state.stepTimer).toBe(0);
    expect(e.state.bestMove).toBe(e.state.moveScore);
    expect(e.state.bestChain).toBeGreaterThan(0);
    expect(M.lastFall(e.state)).toBeGreaterThan(0);
    e.destroy();
  });
  it("finishes a level only after the running chain settles, then continues", async () => {
    const { engine: e, d, events } = await setup(10);
    e.apply((s) => d.setLevelScore(s, 2000));
    expect(e.state.screen).toBe("playing");
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(100);
    expect(e.state.screen).toBe("levelclear");
    key(events, "Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    expect(e.state.level).toBe(2);
    expect(e.state.levelScore).toBe(0);
    expect(e.state.bestMove).toBe(0);
    e.destroy();
  });
  it("navigates title, howto and quit from the registered keyboard actions", async () => {
    const { engine: e, events } = await harness();
    key(events, "ArrowUp");
    await e.advance(1);
    expect(e.state.menuIndex).toBe(1);
    key(events, "Space");
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    key(events, "Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    key(events, "ArrowDown");
    await e.advance(1);
    expect(e.state.menuIndex).toBe(0);
    key(events, "Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    e.destroy();
  });
  it("never mutates the input state when transitioning", async () => {
    const { engine: e, d } = await setup();
    const before = d.snapshot(e.state);
    const held = e.state;
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(100);
    expect(d.snapshot(held)).toEqual(before);
    e.destroy();
  });
  it("records genuine draw commands, including produced images", async () => {
    const { engine: e } = await setup();
    e.startRecording();
    await e.advance(2);
    const recording = e.stopRecording();
    expect(recording.frames).toHaveLength(2);
    expect(
      recording.ops.some((o) => o.op === "call" && o.method === "drawImage"),
    ).toBe(true);
    e.destroy();
  });
  it("advances with a replacement constant clock", async () => {
    const { engine: e } = await harness();
    e.setClock(new ConstantClock(125));
    await e.advance(8);
    expect(e.state.simTime).toBe(1);
    e.destroy();
  });
});

describe("frame audio, particles and event boundaries", () => {
  it("poses play no cues, while real pointer events play select, swap and clear once each", async () => {
    const { engine: e, d, events } = await setup(10);
    const cues: string[] = [];
    e.events.on("cue:played", (p) => cues.push(p.cue));
    e.apply((s) => d.setScore(s, 0));
    e.apply((s) => d.pointerDown(s, 388, 144));
    expect(cues).toEqual([]);
    e.apply((s) => d.clearSelection(s));
    const p = (name: string, x: number, y: number) =>
      event(events, name, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: name === "pointerup" ? 0 : 1,
      });
    p("pointerdown", 460, 216);
    p("pointermove", 460, 144);
    p("pointerup", 460, 144);
    await e.advance(18);
    expect(cues.filter((v) => v === C.CUES.select)).toHaveLength(1);
    expect(cues.filter((v) => v === C.CUES.swap)).toHaveLength(1);
    expect(cues.filter((v) => v === C.CUES.clear)).toHaveLength(1);
    expect(cues).toContain("chain-1");
    e.destroy();
  });
  it("plays refusal once, and muted clear cues still happen at zero gain", async () => {
    const { engine: e, events, d } = await setup(10);
    const cues: { cue: string; gain: number }[] = [];
    e.events.on("cue:played", (p) => cues.push(p));
    event(events, "pointerdown", {
      clientX: 388,
      clientY: 144,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
    });
    event(events, "pointermove", {
      clientX: 460,
      clientY: 144,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      buttons: 1,
    });
    event(events, "pointerup", {
      clientX: 460,
      clientY: 144,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
    });
    await e.advance(1);
    expect(cues.filter((p) => p.cue === C.CUES.refuse)).toHaveLength(1);
    key(events, "KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(18);
    expect(cues.find((p) => p.cue === C.CUES.clear)?.gain).toBe(0);
    e.destroy();
  });
  it("exercises flawed detonation, cut creation and a long landing through live rendering", async () => {
    const { engine: e, d } = await setup(20);
    e.apply((s) => d.setGem(s, 3, 0, "R0"));
    e.apply((s) => d.setGem(s, 0, 1, "B2"));
    e.apply((s) => d.setGem(s, 2, 1, "J3"));
    e.apply((s) => d.setGem(s, 2, 2, "S3s"));
    const cues: string[] = [];
    e.events.on("cue:played", (p) => cues.push(p.cue));
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(80);
    expect(cues).toContain(C.CUES.cut);
    expect(cues).toContain(C.CUES.flaw);
    expect(cues).toContain(C.CUES.land);
    e.destroy();
  });
  it("changes music groups without restarting the same loop on every frame", async () => {
    const { engine: e, d } = await harness();
    const loops: string[] = [],
      stops: string[] = [];
    e.events.on("cue:looped", (p) => loops.push(p.cue));
    e.events.on("cue:stopped", (p) => stops.push(p.cue));
    await e.advance(3);
    expect(loops).toEqual(["title-music"]);
    e.apply((s) => d.setScreen(s, "howto"));
    await e.advance(1);
    expect(loops).toHaveLength(1);
    e.apply((s) => d.setScreen(s, "playing"));
    await e.advance(1);
    expect(loops).toEqual(["title-music", "play-music"]);
    expect(stops).toEqual(["title-music"]);
    e.destroy();
  });
  it("freezes every board system on every non-playing screen", async () => {
    const { engine: e, d } = await setup(100);
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    for (const screen of [
      "title",
      "howto",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      e.apply((s) => d.setScreen(s, screen));
      const before = e.state;
      await e.advance(3);
      expect(e.state.board).toBe(before.board);
      expect(e.state.swapTimer).toBe(before.swapTimer);
      expect(e.state.simTime).toBeCloseTo(before.simTime + 0.3);
    }
    e.destroy();
  });
  it("consumes each action edge once per frame", () => {
    const seen: string[] = [];
    const api = {
      input: {
        pressed: (s: string) => {
          seen.push(s);
          return false;
        },
        pointerSamples: () => [],
        pointer: () => ({ x: 0, y: 0, down: false, device: "mouse" }),
      },
      audio: {
        muted: () => false,
        looping: () => true,
        stop: () => {},
        loop: () => {},
      },
    } as unknown as UpdateApi;
    const s = update(M.initial(), api, 0.1);
    expect(seen).toEqual([...C.ACTIONS]);
    expect(s.simTime).toBe(0.1);
  });
  it("allows render without art in pure headless poses", () => {
    expect(typeof game.render).toBe("function");
    const state: FacetState = M.initial();
    expect(state.art).toBeUndefined();
  });
});
