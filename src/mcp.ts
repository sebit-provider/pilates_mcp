import { ScheduleService } from "./schedule/service.js";
import { PosterService } from "./service.js";
import { toolSchemas } from "./toolSchemas.js";

export type JsonRpcId = string | number | null;

export interface McpRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export class McpApp {
  private readonly posters: PosterService;
  private readonly schedules: ScheduleService;
  private readonly methods: Record<string, (params: Record<string, unknown>) => Promise<unknown>>;

  constructor(dataDir?: string) {
    this.posters = new PosterService(dataDir);
    this.schedules = new ScheduleService(this.posters.storage, this.posters);
    this.methods = {
      get_center_profile: () => this.posters.getCenterProfile(),
      update_center_profile: (params) => this.posters.updateCenterProfile(params),
      create_poster: (params) => this.posters.createPoster(params as never),
      update_poster: (params) => this.posters.updatePoster(params as never),
      search_posters: (params) => this.posters.searchPosters(params as never),
      get_poster: (params) => this.posters.getPoster(String(params.posterId)),
      reuse_poster_template: (params) => this.posters.reusePosterTemplate(params as never),
      import_poster: (params) => this.posters.importPoster(params as never),
      render_poster: (params) => this.posters.renderPoster(params as never),
      add_design_feedback: (params) => this.posters.addDesignFeedback(params as never),
      get_design_feedback: (params) => this.posters.getDesignFeedback(params as never),
      recommend_poster_style: (params) => this.posters.recommendPosterStyle(params as never),
      get_schedule_settings: () => this.schedules.getScheduleSettings(),
      update_schedule_settings: (params) => this.schedules.updateScheduleSettings(params as never),
      inspect_schedule_file: (params) => this.schedules.inspectScheduleFile(params as never),
      import_schedule_file: (params) => this.schedules.importScheduleFile(params as never),
      create_schedule_template: (params) => this.schedules.createScheduleTemplate(params as never),
      get_schedule: (params) => this.schedules.getSchedule(params as never),
      generate_weekly_schedule: (params) => this.schedules.generateWeeklySchedule(params as never),
      set_schedule_slot: (params) => this.schedules.setScheduleSlot(params as never),
      clear_schedule_slot: (params) => this.schedules.clearScheduleSlot(params as never),
      find_available_slots: (params) => this.schedules.findAvailableSlots(params as never),
      validate_schedule: (params) => this.schedules.validateSchedule(params as never),
      add_center_closure: (params) => this.schedules.addCenterClosure(params as never),
      remove_center_closure: (params) => this.schedules.removeCenterClosure(params as never),
      get_center_closures: () => this.schedules.getCenterClosures(),
      save_schedule: (params) => this.schedules.saveSchedule(params as never),
      export_schedule: (params) => this.schedules.exportSchedule(params as never),
      create_schedule_poster: (params) => this.schedules.createSchedulePoster(params as never)
    };
  }

  async handle(request: McpRequest): Promise<McpResponse | null> {
    try {
      const result = await this.dispatch(request);
      if (request.method.startsWith("notifications/")) return null;
      return { jsonrpc: "2.0", id: request.id ?? null, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32000, message: (error as Error).message }
      };
    }
  }

  private async dispatch(request: McpRequest): Promise<unknown> {
    if (request.method === "initialize") {
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "pilates_mcp", version: "0.1.0" }
      };
    }
    if (request.method === "tools/list") {
      return { tools: toolSchemas };
    }
    if (request.method === "tools/call") {
      const name = String(request.params?.name ?? "");
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
      const method = this.methods[name];
      if (!method) throw new Error(`Unknown tool: ${name}`);
      const result = await method(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    if (request.method === "notifications/initialized") return {};
    throw new Error(`Unsupported method: ${request.method}`);
  }
}
