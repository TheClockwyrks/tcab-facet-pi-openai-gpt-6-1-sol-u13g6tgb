import type { InitApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { FacetState } from "./game";
import * as C from "./constants";

export interface Art {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly systems: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
export async function loadArt(api: InitApi<FacetState>): Promise<Art> {
  const paths: string[] = [
    "gems/frame.png",
    "gems/brilliant.png",
    "gems/star.png",
  ];
  for (const name of [...C.GEM_KINDS, "prism"])
    for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
      paths.push(`gems/${name}-${strain}.png`);
  for (const kind of C.GEM_KINDS)
    for (let frame = 0; frame < 6; frame++)
      paths.push(`gems/break/${kind}/${frame}.png`);
  for (let frame = 0; frame < 8; frame++)
    for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
      paths.push(`gems/prism-turn/${strain ? `${strain}-` : ""}${frame}.png`);
  const images = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [p, await api.assets.loadImage(p)] as const),
    ),
  );
  const systems = Object.fromEntries(
    await Promise.all(
      ["clear", "flawed", "cut", "aura"].map(
        async (p) =>
          [
            p,
            JSON.parse(
              await (await api.assets.load(`fx/${p}/system.json`)).text(),
            ) as ParticleSystem,
          ] as const,
      ),
    ),
  );
  await Promise.all([
    ...Object.values(C.CUES).map((cue) =>
      api.audio.load(
        cue,
        `audio/${cue === C.CUES.clear ? "shatter" : cue}.wav`,
      ),
    ),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, n) =>
      api.audio.load(`chain-${n + 1}`, `audio/chain-${n + 1}.wav`),
    ),
    api.audio.load("title-music", "audio/title.wav"),
    api.audio.load("play-music", "audio/play.wav"),
  ]);
  return { images, systems };
}
