import {
  ATK,
  Components,
  MAXHP,
  MAXSP,
  PDEF,
  RpgEvent,
  type EventDefinition,
  type RpgPlayer,
  createServer,
  provideServerModules,
} from "@rpgjs/server";
import {
  createActionBattleVisual,
  createActionEnemy,
  defineActionBattleEnemy,
  provideActionBattle,
} from "@rpgjs/action-battle/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";

const MAP_ID = "demo";

const FieldRation = {
  id: "field-ration",
  name: "Field Ration",
  description: "Restores health in the field.",
  icon: "field-ration",
  consumable: true,
  hitRate: 1,
  hpValue: 80,
  _type: "item" as const,
};

const missionStates = new WeakMap<object, MissionStatus>();

interface MissionStatus {
  activatedTowers: number;
  // alert: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  enemiesSpawned: boolean;
}

type MissionMap = NonNullable<ReturnType<RpgPlayer["getCurrentMap"]>>;
type Role = "vanguard" | "ranger";

function getMissionState(map: MissionMap): MissionStatus {
  const existing = missionStates.get(map);
  if (existing) return existing;

  const created: MissionStatus = {
    activatedTowers: 0,
    // alert: 0,
    bossSpawned: false,
    bossDefeated: false,
    enemiesSpawned: false,
  };
  missionStates.set(map, created);
  return created;
}

function announce(map: MissionMap, message: string) {
  for (const player of map.getPlayers()) {
    player.showText(message, {autoClose: true}).catch((err) => {
      console.error("Error showing text:", err);
    });
  }
}

function drawMarker(event: RpgEvent, label: string, color: string) {
  event.setComponentsCenter([
    Components.shape({
      type: "rounded-rectangle",
      fill: color,
      width: 42,
      height: 30,
      radius: 6,
      line: { color: "#111827", width: 2 },
    }),
    Components.text(label, {
      fill: "#fff7ed",
      fontSize: 10,
      fontWeight: "700",
      stroke: "#111827",
    }),
  ]);
}

function setRole(player: RpgPlayer, role: Role) {
  const stats = role === "vanguard"
    ? { maxHp: 360, atk: 22, pdef: 13, speed: 2.2 }
    : { maxHp: 260, atk: 30, pdef: 6, speed: 2.8 };

  // player.name = `回声${stats.name}`;
  const hpRatio = player.param[MAXHP] > 0 ? player.hp / player.param[MAXHP] : 1;
  player.speed = stats.speed;
  player.param[MAXHP] = stats.maxHp;
  player.param[MAXSP] = 100;
  player.param[ATK] = stats.atk;
  player.param[PDEF] = stats.pdef;
  player.hp = Math.max(1, Math.round(stats.maxHp * hpRatio));
  player.sp = Math.min(player.sp ?? 100, 100);
  player.setVariable("war.role", role);
}

const Scout = defineActionBattleEnemy({
  graphic: "monster",
  stats: { maxHp: 90, atk: 12, pdef: 3 },
  visionRange: 240,
  attackCooldown: 1500,
  rewards: { exp: 8, gold: 5 },
});

const Commander = defineActionBattleEnemy({
  graphic: "monster",
  stats: { maxHp: 520, atk: 25, pdef: 10 },
  visionRange: 360,
  attackCooldown: 900,
  rewards: { exp: 80, gold: 50 },
});

function createScout(): EventDefinition {
  return {
    name: "敌方侦察兵",
    onInit() {
      createActionEnemy(this, Scout);
    },
  };
}

function createCommander(map: MissionMap): EventDefinition {
  return {
    name: "战区指挥官",
    onInit() {
      createActionEnemy(this, {
        ...Commander,
        onDefeated: () => {
          const state = getMissionState(map);
          state.bossDefeated = true;
          announce(map, "战区指挥官已被击败。撤离点已经解锁！");
        },
      });
    },
  };
}

async function spawnInitialEnemies(map: MissionMap) {
  const state = getMissionState(map);
  if (state.enemiesSpawned) return;
  state.enemiesSpawned = true;

  await map.createDynamicEvent({
    id: "war-scout-east",
    x: 650,
    y: 250,
    event: createScout(),
  });
  await map.createDynamicEvent({
    id: "war-scout-west",
    x: 160,
    y: 430,
    event: createScout(),
  });
}

async function spawnCommander(map: MissionMap) {
  const state = getMissionState(map);
  if (state.bossSpawned) return;

  state.bossSpawned = true;
  await map.createDynamicEvent({
    id: "war-commander",
    x: 400,
    y: 320,
    event: createCommander(map),
  });
  announce(map, "警报：敌方指挥官已经抵达战区！");
}

const RoleTerminal: EventDefinition = {
  name: "作战终端",
  onInit() {
    drawMarker(this, "ROLE", "#2563eb");
  },
  async onAction(player: RpgPlayer) {
    const choice = await player.showChoices("选择本次任务的作战角色", [
      { text: "先锋：高生命、高防御", value: "vanguard" },
      { text: "游骑：高攻击、高机动", value: "ranger" },
    ]);
    if (choice?.value !== "vanguard" && choice?.value !== "ranger") return;

    setRole(player, choice.value);
    await player.showText(
      choice.value === "vanguard"
        ? "先锋已就位。顶住火力，为小队争取时间。"
        : "游骑已就位。保持距离，优先处理高威胁目标。",
    );
  },
};

function createTower(towerNumber: number): EventDefinition {
  return {
    name: `通信塔 ${towerNumber}`,
    onInit() {
      drawMarker(this, `T${towerNumber}`, "#7c3aed");
    },
    async onAction(player: RpgPlayer) {
      const map = player.getCurrentMap();
      if (!map) return;

      const event = this as RpgEvent & { activated?: boolean };
      if (event.activated) {
        await player.showText("这座通信塔已经接入回声网络。");
        return;
      }

      event.activated = true;
      const state = getMissionState(map);
      state.activatedTowers += 1;
      // state.alert = Math.max(0, state.alert - 12);
      drawMarker(this, "ON", "#16a34a");
      announce(map, `通信塔 ${towerNumber} 已启动（${state.activatedTowers}/3）。`);

      if (state.activatedTowers === 3) {
        // await player.showText("三座通信塔全部上线。敌方指挥官正在赶来！");
        await spawnCommander(map);
      }
    },
  };
}

const SupplyCrate: EventDefinition = {
  name: "战地补给箱",
  onInit() {
    drawMarker(this, "SUPPLY", "#b45309");
  },
  async onAction(player: RpgPlayer) {
    const crate = this as RpgEvent & { opened?: boolean };
    if (crate.opened) return;

    crate.opened = true;
    player.addItem(FieldRation, 2);
    const map = player.getCurrentMap();
    if (map) announce(map, "补给箱已打开。获得 2 个战地口粮。");
    // {
    //   const state = getMissionState(map);
    //   state.alert = Math.min(100, state.alert + 8);
    //   announce(map, `补给箱已打开。获得 2 个战地口粮，警报值 ${state.alert}%。`);
    // }
    drawMarker(this, "EMPTY", "#475569");
  },
};

const ExtractionZone: EventDefinition = {
  name: "撤离信标",
  onInit() {
    drawMarker(this, "EXIT", "#dc2626");
  },
  async onAction(player: RpgPlayer) {
    const map = player.getCurrentMap();
    if (!map) return;
    const state = getMissionState(map);

    if (state.activatedTowers < 3) {
      await player.showText(`撤离信标尚未解锁。还需要启动 ${3 - state.activatedTowers} 座通信塔。`);
      return;
    }
    if (!state.bossDefeated) {
      await player.showText("撤离通道被敌方指挥官锁定。先消灭他！");
      return;
    }
    if (player.getVariable("war.extracted")) {
      await player.showText("你已经完成撤离，等待小队其他成员。");
      return;
    }

    player.setVariable("war.extracted", true);
    player.gold += 50;
    await player.showText("撤离成功！获得 50 军需点。下一关即将开放。");
  },
};

const player = {
  async onConnected(player: RpgPlayer) {
    player.setGraphic("hero");
    player.initializeDefaultStats();
    setRole(player, "vanguard");
    player.addItem(FieldRation, 2);
    player.initializeHotbar([{ type: "item", id: FieldRation.id }]);
    await player.changeMap(MAP_ID, { x: 400, y: 300 });
  },

  async onJoinMap(player: RpgPlayer) {
    player.setGraphic("hero");
    player.setComponentsTop([
      Components.text("{name}", {
        fill: "#fff7ed",
        fontSize: 12,
        fontWeight: "700",
        stroke: "#111827",
      }),
      Components.hpBar({ width: 58, height: 6 }, null),
    ], { height: 28, marginBottom: 5 });
    await player.showHotbar();
    const map = player.getCurrentMap();
    if (map) await spawnInitialEnemies(map);
  },
};

export default createServer({
  providers: [
    provideActionBattle({
      visual: createActionBattleVisual("impact"),
      combat: { pvp: false },
    }),
    ...provideTiledMap({
      basePath: "/map",
      streaming: {
        chunkSize: 16,
        loadRadius: 2,
        retainRadius: 3,
      },
    }),
    provideServerModules([
      {
        database: async () => ({
          [FieldRation.id]: FieldRation,
        }),
        player,
        maps: [
          {
            id: MAP_ID,
            file: "src/tiled/demo.tmx",
            onJoin(player: RpgPlayer) {
              player.setGraphic("hero");
            },
            events: [
              { id: "EV-ROLE", x: 400, y: 250, event: RoleTerminal },
              { id: "EV-TOWER-1", x: 160, y: 160, event: createTower(1) },
              { id: "EV-TOWER-2", x: 640, y: 160, event: createTower(2) },
              { id: "EV-TOWER-3", x: 400, y: 500, event: createTower(3) },
              { id: "EV-SUPPLY-1", x: 220, y: 390, event: SupplyCrate },
              { id: "EV-SUPPLY-2", x: 580, y: 390, event: SupplyCrate },
              { id: "EV-EXTRACTION", x: 400, y: 80, event: ExtractionZone },
            ],
          },
        ],
      },
    ]),
  ],
});
