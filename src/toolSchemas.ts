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
  }
];

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
