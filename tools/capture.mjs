/* global document, PointerEvent */
// Run against `npm run dev`: node tools/capture.mjs
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";
import console from "node:console";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => {
  throw error;
});
await page.route("http://localhost:5173/capture.html", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<style>body{margin:0;background:#09171e}canvas{width:1280px;height:720px;display:block}</style><canvas id="capture"></canvas>',
  }),
);
await page.goto("http://localhost:5173/capture.html");
const captured = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const { runs } = await import("/src/model.ts");
  const canvas = document.getElementById("capture");
  const e = createEngine({
    canvas,
    game,
    background: BACKGROUND,
    width: 1280,
    height: 720,
    clock: new ConstantClock(1000 / 60),
  });
  await e.initialize();
  const d = e.debug;
  await e.advance(1);
  const title = canvas.toDataURL("image/png").split(",")[1];
  const rows = [
    "R0 A0 R0 R0 B0 S0 M0 R0",
    "C0 R0 B3 S3 M0 R0 A0 C0",
    "B0 S0 M3 R3b A0 C0 J0 B0",
    "M0 R0 A3 C3 J3 B0b S0 M0",
    "A0 C0 J0 B0 S1 M0 R3 A0",
    "J0 B0 S2s M0 R0 A0 C0 J0",
    "S0 M0 R0 A0 X0 J0 B0 S0",
    "R0 A0 C0 J0 B0 S0 M0 R0",
  ];
  const random = Math.random;
  let seed = 1;
  const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const pose = (n) => {
    seed = n;
    Math.random = rng;
    e.apply((s) => d.reset(s));
    e.apply((s) => d.loadBoard(s, rows));
    e.apply((s) => d.setScreen(s, "playing"));
    e.apply((s) => d.setScore(s, 1240));
    e.apply((s) => d.setLevelScore(s, 1240));
  };
  let chosen = 1;
  for (let trial = 1; trial < 50; trial++) {
    pose(trial);
    e.apply((s) => d.requestSwap(s, 1, 1, 1, 0));
    await e.advance(260);
    if (e.state.bestChain >= 3) {
      chosen = trial;
      break;
    }
  }
  pose(chosen);
  if (runs(e.state.board).length)
    throw new Error("Showcase must begin on a settled, run-free board");
  await e.advance(1);
  const board = canvas.toDataURL("image/png").split(",")[1];
  e.startRecording();
  // Use exactly the same pointer path as a player, not a bespoke visual sequence.
  const point = (type, x, y) =>
    document.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  point("pointerdown", 460, 216);
  await e.advance(14);
  point("pointermove", 460, 144);
  await e.advance(16);
  point("pointerup", 460, 144);
  await e.advance(34);
  const chain = canvas.toDataURL("image/png").split(",")[1];
  await e.advance(216);
  const recording = e.stopRecording();
  const result = {
    title,
    board,
    chain,
    recording,
    bestChain: e.state.bestChain,
    seed: chosen,
    frames: recording.frames.length,
  };
  Math.random = random;
  e.destroy();
  return result;
});
await mkdir("showcase", { recursive: true });
for (const name of ["title", "board", "chain"])
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(captured[name], "base64"),
  );
await writeFile(
  "showcase/pressure.json.gz",
  gzipSync(JSON.stringify(captured.recording)),
);
console.log(
  `Captured ${captured.frames} frames, chain ${captured.bestChain}, seed ${captured.seed}`,
);
await browser.close();
