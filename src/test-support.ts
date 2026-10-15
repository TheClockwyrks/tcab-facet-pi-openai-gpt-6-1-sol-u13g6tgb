/// <reference types="node" />
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { game, BACKGROUND } from "./game";
import * as C from "./constants";

/** Real CPU canvas: simulation tests also exercise native drawing of the shipped art. */
export function canvasFixture() {
  const canvas = createCanvas(
    C.STAGE_W,
    C.STAGE_H,
  ) as unknown as HTMLCanvasElement;
  const events = new EventTarget();
  return {
    canvas,
    events,
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  };
}
export function fakeDecoders() {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData() {
        return {};
      }
      async resume() {}
    },
  );
}
export async function harness(step = 1000 / 60) {
  const fixture = canvasFixture();
  const engine = createEngine({
    ...fixture,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(step),
  });
  await engine.initialize();
  return { ...fixture, engine, d: engine.debug };
}
export function event(
  target: EventTarget,
  name: string,
  values: Record<string, unknown>,
) {
  target.dispatchEvent(Object.assign(new Event(name), values));
}
