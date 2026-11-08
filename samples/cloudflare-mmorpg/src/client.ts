import {
  createActionBattleUi,
  createActionBattleVisual,
  provideActionBattle,
} from "@rpgjs/action-battle/client";
import {
  Presets,
  provideClientGlobalConfig,
  provideClientModules,
  provideMmorpg,
  startGame,
} from "@rpgjs/client";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

startGame({
  providers: [
    provideTiledMap({ basePath: "/map" }),
    provideClientGlobalConfig(),
    provideActionBattle({
      visual: createActionBattleVisual("impact"),
      ui: createActionBattleUi({
        hotbar: true,
        targeting: true,
        attackPreview: true,
      }),
    }),
    provideClientModules([
      {
        spritesheetResolver: async (id: string) => {
          if (id === "hero" || id === "monster") {
            return Presets.LPCSpritesheetPreset({
              id,
              imageSource: `${id}.png`,
              width: 1728,
              height: 5568,
              ratio: 1.5,
            });
          }
          return undefined;
        },
      },
    ]),
    provideMmorpg({
      connectionIdScope: "session",
      connectionAcceptanceTimeoutMs: 30_000,
      socketOptions: { connectionTimeout: 30_000 },
    }),
  ],
});
