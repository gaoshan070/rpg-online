import { createRpgServerTransport } from "@rpgjs/server/node";
import serverModule from "./server";

const target = process.env.RPGJS_PUBLISH_TARGET;
const token = process.env.RPGJS_MAP_UPDATE_TOKEN;
const mapIds = (process.env.RPGJS_MAP_IDS ?? "demo")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!target) throw new Error("RPGJS_PUBLISH_TARGET is required");
if (!token) throw new Error("RPGJS_MAP_UPDATE_TOKEN is required");
if (mapIds.length === 0) throw new Error("RPGJS_MAP_IDS must contain a map id");
const {protocol, hostname } = new URL(target);
if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
  throw new Error("RPGJS_PUBLISH_TARGET must use https or be localhost/");
} 

const publisher = createRpgServerTransport(serverModule, {
  initializeMaps: false,
  mapUpdateToken: token,
  tiledBasePaths: ["src/tiled"],
});

for (const mapId of mapIds) {
  const response = await publisher.publishMap(mapId, { target });
  if (!response.ok) {
    throw new Error(
      `Unable to publish ${mapId}: ${response.status} ${await response.text()}`,
    );
  }
  console.log(`Published map: ${mapId}`);
}

process.exit(0);
