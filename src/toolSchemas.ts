export const toolSchemas = [
  {
    name: "get_center_profile",
    description: "Return the local Pilates center profile and poster defaults. Use before poster generation.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "update_center_profile",
    description: "Update non-member Pilates center profile fields and default poster expression rules such as VAT and table style.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        name: { type: "string" },
        logoPath: { type: ["string", "null"] },
        defaultLocale: { type: "string" },
        defaultStyle: { type: "string" },
        brand: { type: "object" },
        footerText: { type: ["string", "null"] },
        posterDefaults: {
          type: "object",
          properties: {
            programSeparation: { enum: ["none", "section", "color", "table", "card"] },
            tablePreference: { enum: ["required", "preferred", "none"] },
            tableStyle: { enum: ["single", "split", "grouped", "comparison", "price-list"] },
            vatPolicy: { enum: ["included", "excluded", "not_applicable", "unspecified"] }
          }
        }
      }
    }
  },
  createPosterSchema("create_poster", "Create and archive a new HTML/CSS poster only after required operating and price-display rules are known. Validates PosterBrief first and returns missing questions instead of guessing eventName, VAT policy, table preference, table style, or program separation."),
  {
    name: "update_poster",
    description: "Update an existing poster source HTML/CSS through structured content/theme fields. Creates a simple revision backup first.",
    inputSchema: {
      type: "object",
      required: ["posterId"],
      additionalProperties: false,
      properties: {
        posterId: { type: "string" },
        title: { type: "string" },
        content: contentSchema(),
        style: { type: "string" },
        mood: { type: "array", items: { type: "string" } },
        theme: { type: "object" },
        status: { enum: ["draft", "used", "archived"] },
        notes: { type: "string" }
      }
    }
  },
  {
    name: "search_posters",
    description: "Search local archived poster metadata by date, layout, purpose, style, feedback-related tags, free text, VAT policy, and table structure.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        year: { type: "number" },
        month: { type: "number" },
        layout: { enum: ["table", "standard"] },
        purpose: { enum: ["event", "price", "notice", "schedule", "promotion", "other"] },
        style: { type: "string" },
        mood: { type: "string" },
        tag: { type: "string" },
        status: { enum: ["draft", "used", "archived"] },
        query: { type: "string" },
        recentMonths: { type: "number" },
        programCategory: { enum: ["group", "private", "duet", "other"] },
        programSeparation: { enum: ["none", "section", "color", "table", "card"] },
        tableStyle: { enum: ["single", "split", "grouped", "comparison", "price-list"] },
        vatPolicy: { enum: ["included", "excluded", "not_applicable", "unspecified"] },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "get_poster",
    description: "Return one archived poster's metadata, structured content, theme, HTML, CSS, and local archive paths.",
    inputSchema: { type: "object", required: ["posterId"], additionalProperties: false, properties: { posterId: { type: "string" } } }
  },
  {
    name: "reuse_poster_template",
    description: "Copy an existing poster's layout/style/theme into a new poster and replace only the content. Never overwrites the source poster.",
    inputSchema: createPosterSchema("reuse_poster_template", "").inputSchema
  },
  {
    name: "import_poster",
    description: "Import existing HTML/CSS into the local archive with metadata. Image-only poster reconstruction is intentionally out of Phase 1 scope.",
    inputSchema: { type: "object", required: ["metadata"], additionalProperties: false, properties: { html: { type: "string" }, css: { type: "string" }, htmlPath: { type: "string" }, cssPath: { type: "string" }, metadata: { type: "object" }, content: contentSchema(), theme: { type: "object" } } }
  },
  {
    name: "render_poster",
    description: "Render an archived HTML/CSS poster to PNG and/or PDF with headless Chromium. JavaScript is disabled during rendering.",
    inputSchema: {
      type: "object",
      required: ["posterId"],
      additionalProperties: false,
      properties: {
        posterId: { type: "string" },
        png: { type: "boolean" },
        pdf: { type: "boolean" },
        size: { enum: ["instagram-portrait", "instagram-square", "story", "a4-portrait"] }
      }
    }
  },
  {
    name: "add_design_feedback",
    description: "Store reusable design feedback locally. Scope can be global, table, standard, or a specific poster.",
    inputSchema: {
      type: "object",
      required: ["scope", "text"],
      additionalProperties: false,
      properties: {
        scope: { enum: ["global", "table", "standard", "poster"] },
        posterId: { type: "string" },
        text: { type: "string" },
        active: { type: "boolean" }
      }
    }
  },
  {
    name: "get_design_feedback",
    description: "Return active local design feedback by scope, poster, or layout so generation can reference it.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { enum: ["global", "table", "standard", "poster"] },
        posterId: { type: "string" },
        layout: { enum: ["table", "standard"] },
        activeOnly: { type: "boolean" }
      }
    }
  },
  {
    name: "recommend_poster_style",
    description: "Recommend poster layout/style/table structure from local archive history and saved feedback only. Does not search the internet.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        purpose: { enum: ["event", "price", "notice", "schedule", "promotion", "other"] },
        month: { type: "number" },
        recentMonths: { type: "number" },
        programCategories: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "get_schedule_settings",
    description: "Return local non-CRM schedule settings such as week display, opening hours, slot minutes, locale, and holiday marking.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  {
    name: "update_schedule_settings",
    description: "Update center schedule defaults. These are operational settings and must not include member CRM data.",
    inputSchema: scheduleSettingsSchema()
  },
  {
    name: "inspect_schedule_file",
    description: "Inspect an existing XLSX schedule file inside the workspace and infer worksheet, used range, day columns, time column, merges, widths, and heights without executing formulas.",
    inputSchema: { type: "object", required: ["filePath"], additionalProperties: false, properties: { filePath: { type: "string" } } }
  },
  {
    name: "import_schedule_file",
    description: "Import an existing group/private XLSX schedule into a dirty Schedule Workspace draft while preserving mapping metadata where possible.",
    inputSchema: { type: "object", required: ["filePath"], additionalProperties: false, properties: { filePath: { type: "string" }, scheduleType: { enum: ["group", "private"] } } }
  },
  {
    name: "create_schedule_template",
    description: "Create a new unsaved weekly group/private schedule template after required settings are known. Does not save until save_schedule is called.",
    inputSchema: { type: "object", required: ["scheduleType"], additionalProperties: false, properties: { scheduleType: { enum: ["group", "private"] }, settings: scheduleSettingsSchema() } }
  },
  scheduleTypeTool("get_schedule", "Return the current dirty draft or saved schedule template."),
  {
    name: "generate_weekly_schedule",
    description: "Generate an unsaved weekly schedule from the weekly template plus holidays, center closures, and overrides.",
    inputSchema: {
      type: "object",
      required: ["scheduleType", "weekStart"],
      additionalProperties: false,
      properties: {
        scheduleType: { enum: ["group", "private"] },
        weekStart: { type: "string" },
        applyHolidays: { type: "boolean" },
        applyCenterClosures: { type: "boolean" }
      }
    }
  },
  {
    name: "set_schedule_slot",
    description: "Set one group/private schedule slot in the dirty workspace. Conflicts are returned unless overwrite is explicitly true. Only displayName is allowed for private names; no CRM fields.",
    inputSchema: {
      type: "object",
      required: ["scheduleType", "startTime"],
      additionalProperties: false,
      properties: {
        scheduleType: { enum: ["group", "private"] },
        dayOfWeek: daySchema(),
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        displayName: { type: "string" },
        groupTitle: { type: "string" },
        instructor: { type: "string" },
        note: { type: "string" },
        overwrite: { type: "boolean" }
      }
    }
  },
  {
    name: "clear_schedule_slot",
    description: "Clear a schedule slot in the dirty workspace without saving until save_schedule is called.",
    inputSchema: { type: "object", required: ["scheduleType", "startTime"], additionalProperties: false, properties: { scheduleType: { enum: ["group", "private"] }, dayOfWeek: daySchema(), date: { type: "string" }, startTime: { type: "string" } } }
  },
  {
    name: "find_available_slots",
    description: "Find available schedule slots by schedule type, date/day, time range, and duration.",
    inputSchema: { type: "object", required: ["scheduleType"], additionalProperties: false, properties: { scheduleType: { enum: ["group", "private"] }, date: { type: "string" }, dayOfWeek: daySchema(), fromTime: { type: "string" }, toTime: { type: "string" }, duration: { type: "number" } } }
  },
  scheduleTypeTool("validate_schedule", "Validate duplicate slots, operating hours, holiday conflicts, time ranges, and Excel mapping warnings."),
  {
    name: "add_center_closure",
    description: "Add a center-specific closure date. If existing schedule entries are present, returns warnings and requires confirmation semantics without deleting data.",
    inputSchema: { type: "object", required: ["date"], additionalProperties: false, properties: { date: { type: "string" }, label: { type: "string" } } }
  },
  {
    name: "remove_center_closure",
    description: "Remove a center-specific closure date.",
    inputSchema: { type: "object", required: ["date"], additionalProperties: false, properties: { date: { type: "string" } } }
  },
  {
    name: "get_center_closures",
    description: "Return locally stored center-specific closure dates.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} }
  },
  scheduleTypeTool("save_schedule", "Explicitly save the dirty schedule template and create a revision backup when replacing an existing saved template."),
  {
    name: "export_schedule",
    description: "Export the current schedule to XLSX, preserving mapping metadata where possible and backing up an existing XLSX before writing.",
    inputSchema: { type: "object", required: ["scheduleType"], additionalProperties: false, properties: { scheduleType: { enum: ["group", "private"] }, filename: { type: "string" } } }
  },
  {
    name: "create_schedule_poster",
    description: "Create a Phase 1 poster from public-safe schedule data. Private displayName values are excluded by default.",
    inputSchema: { type: "object", required: ["scheduleType", "title"], additionalProperties: false, properties: { scheduleType: { enum: ["group", "private"] }, weekStart: { type: "string" }, title: { type: "string" }, render: { anyOf: [{ const: false }, { type: "object", properties: { png: { type: "boolean" }, pdf: { type: "boolean" }, size: { enum: ["instagram-portrait", "instagram-square", "story", "a4-portrait"] } } }] } } }
  }
];

function scheduleSettingsSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      weekDisplay: { enum: ["mon-fri", "mon-sat", "mon-sun"] },
      openingTime: { type: "string" },
      closingTime: { type: "string" },
      defaultSlotMinutes: { type: "number" },
      autoHolidayMarking: { type: "boolean" },
      locale: { type: "string" },
      countryCode: { type: "string" }
    }
  };
}

function daySchema() {
  return { enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] };
}

function scheduleTypeTool(name: string, description: string) {
  return {
    name,
    description,
    inputSchema: { type: "object", required: ["scheduleType"], additionalProperties: false, properties: { scheduleType: { enum: ["group", "private"] } } }
  };
}

function createPosterSchema(name: string, description: string) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      required: name === "reuse_poster_template" ? ["sourcePosterId", "title", "content"] : ["title", "purpose", "content"],
      additionalProperties: false,
      properties: {
        sourcePosterId: { type: "string" },
        title: { type: "string" },
        layout: { enum: ["table", "standard"] },
        purpose: { enum: ["event", "price", "notice", "schedule", "promotion", "other"] },
        brief: briefSchema(),
        content: contentSchema(),
        style: { type: "string" },
        mood: { type: "array", items: { type: "string" } },
        year: { type: "number" },
        month: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        status: { enum: ["draft", "used", "archived"] },
        theme: { type: "object" },
        render: {
          anyOf: [
            { const: false },
            {
              type: "object",
              properties: {
                png: { type: "boolean" },
                pdf: { type: "boolean" },
                size: { enum: ["instagram-portrait", "instagram-square", "story", "a4-portrait"] }
              }
            }
          ]
        },
        notes: { type: "string" }
      }
    }
  };
}

function briefSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      eventName: { type: "string", description: "Required. Ask the user if missing; do not invent an event name." },
      purpose: { enum: ["event", "price", "notice", "schedule", "promotion", "other"] },
      programCategories: { type: "array", items: { enum: ["group", "private", "duet", "other"] } },
      programSeparation: { enum: ["none", "section", "color", "table", "card"], description: "Required unless center defaults define it. Ask how to visually separate group/private/duet: separate sections, separate tables, accent colors, one grouped table, or cards." },
      tablePreference: { enum: ["required", "preferred", "none"], description: "User intent for table usage. layout is the final rendering decision." },
      tableStyle: { enum: ["single", "split", "grouped", "comparison", "price-list"], description: "Required when tablePreference is required or table content is supplied." },
      vatPolicy: { enum: ["included", "excluded", "not_applicable", "unspecified"], description: "Required for price content. Never guess VAT." },
      style: { type: "string" },
      mood: { type: "array", items: { type: "string" } },
      notes: { type: "string" }
    }
  };
}

function contentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      eyebrow: { type: "string" },
      title: { type: "string" },
      subtitle: { type: "string" },
      headline: { type: "string" },
      body: { type: "string" },
      highlight: { type: "string" },
      cta: { type: "string" },
      badge: { type: "string" },
      note: { type: "string" },
      footer: { type: "string" },
      table: {
        type: "object",
        required: ["columns", "rows"],
        additionalProperties: false,
        properties: {
          columns: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          highlightColumn: { type: "number" },
          rowCategories: { type: "array", items: { type: ["string", "null"] } }
        }
      }
    }
  };
}
