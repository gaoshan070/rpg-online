import {
  RpgServerDurableObject,
  createRpgServerWorker,
} from "@rpgjs/server/cloudflare";
import serverModule from "./server";

export { RpgServerDurableObject };

interface Env extends Record<string, unknown> {
  RPGJS_ROOMS: DurableObjectNamespace;
  RPGJS_MAP_UPDATE_TOKEN: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const roomWorker = createRpgServerWorker(serverModule, {
  binding: "RPGJS_ROOMS",
  partiesPath: "/parties/main",
});

const ROOMS = new Set(["lobby-1", "map-demo"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/parties/")) {
      const room = pathname.match(/^\/parties\/main\/([^/]+)/)?.[1];
      if (!room || !ROOMS.has(room)) return new Response("Room not found", { status: 404 });
      return roomWorker.fetch(request, env, ctx); 
    }    
    return env.ASSETS?.fetch(request) ?? new Response("Not Found", { status: 404 });
  },
};
