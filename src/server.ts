#!/usr/bin/env node
import readline from "node:readline";
import { ScheduleService } from "./schedule/service.js";
import { PosterService } from "./service.js";
import { toolSchemas } from "./toolSchemas.js";

const service = new PosterService(process.env.PILATES_MCP_DATA_DIR);
const schedules = new ScheduleService(service.storage, service);

type Request = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };

const methods: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  get_center_profile: () => service.getCenterProfile(),
  update_center_profile: (params) => service.updateCenterProfile(params),
  create_poster: (params) => service.createPoster(params as never),
  update_poster: (params) => service.updatePoster(params as never),
  search_posters: (params) => service.searchPosters(params as never),
  get_poster: (params) => service.getPoster(String(params.posterId)),
  reuse_poster_template: (params) => service.reusePosterTemplate(params as never),
  import_poster: (params) => service.importPoster(params as never),
  render_poster: (params) => service.renderPoster(params as never),
  add_design_feedback: (params) => service.addDesignFeedback(params as never),
  get_design_feedback: (params) => service.getDesignFeedback(params as never),
  recommend_poster_style: (params) => service.recommendPosterStyle(params as never),
  get_schedule_settings: () => schedules.getScheduleSettings(),
  update_schedule_settings: (params) => schedules.updateScheduleSettings(params as never),
  inspect_schedule_file: (params) => schedules.inspectScheduleFile(params as never),
  import_schedule_file: (params) => schedules.importScheduleFile(params as never),
  create_schedule_template: (params) => schedules.createScheduleTemplate(params as never),
  get_schedule: (params) => schedules.getSchedule(params as never),
  generate_weekly_schedule: (params) => schedules.generateWeeklySchedule(params as never),
  set_schedule_slot: (params) => schedules.setScheduleSlot(params as never),
  clear_schedule_slot: (params) => schedules.clearScheduleSlot(params as never),
  find_available_slots: (params) => schedules.findAvailableSlots(params as never),
  validate_schedule: (params) => schedules.validateSchedule(params as never),
  add_center_closure: (params) => schedules.addCenterClosure(params as never),
  remove_center_closure: (params) => schedules.removeCenterClosure(params as never),
  get_center_closures: () => schedules.getCenterClosures(),
  save_schedule: (params) => schedules.saveSchedule(params as never),
  export_schedule: (params) => schedules.exportSchedule(params as never),
  create_schedule_poster: (params) => schedules.createSchedulePoster(params as never)
};

function send(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function handle(request: Request): Promise<void> {
  if (request.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "pilates_mcp", version: "0.1.0" }
      }
    });
    return;
  }
  if (request.method === "tools/list") {
    send({ jsonrpc: "2.0", id: request.id, result: { tools: toolSchemas } });
    return;
  }
  if (request.method === "tools/call") {
    const name = String(request.params?.name ?? "");
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
    const method = methods[name];
    if (!method) throw new Error(`Unknown tool: ${name}`);
    const result = await method(args);
    send({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
    return;
  }
  if (request.method === "notifications/initialized") return;
  throw new Error(`Unsupported method: ${request.method}`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  void (async () => {
    let request: Request | undefined;
    try {
      request = JSON.parse(line) as Request;
      await handle(request);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: (error as Error).message }
      });
    }
  })();
});
