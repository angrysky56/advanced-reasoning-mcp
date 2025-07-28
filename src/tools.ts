import { Tool } from "./mcp.js";
import {
  LIST_LANGCHAIN_MODELS_TOOL,
  GENERATE_LANGCHAIN_TEXT_TOOL,
} from "./langchain-tools.js";

export const ADVANCED_REASONING_TOOL: Tool = {
  name: "advanced_reasoning",
  description: `Advanced cognitive reasoning tool that builds on sequential thinking with meta-cognition, hypothesis testing, and integrated memory.

Key Features:
- Meta-cognitive assessment and confidence tracking
- Hypothesis formulation and testing capabilities
- Integrated graph-based memory system
- Dynamic reasoning quality evaluation
- Session-based context management
- Evidence tracking and validation

Enhanced Parameters:
- thought: Your reasoning step (required)
- thoughtNumber/totalThoughts: Sequential tracking (required)
- nextThoughtNeeded: Continue flag (required)
- confidence: Self-assessment 0.0-1.0 (default: 0.5)
- reasoning_quality: 'low'|'medium'|'high' (default: 'medium')
- meta_thought: Reflection on your reasoning process
- hypothesis: Current working hypothesis
- test_plan: How to validate the hypothesis
- test_result: Outcome of testing
- evidence: Supporting/contradicting evidence
- session_id: Link to reasoning session
- goal: Overall objective
- progress: 0.0-1.0 completion estimate

Branching (inherited from sequential thinking):
- isRevision/revisesThought: Revise previous thoughts
- branchFromThought/branchId: Explore alternatives

Use this tool for complex reasoning that benefits from:
- Self-reflection and confidence tracking
- Systematic hypothesis development
- Memory of previous insights
- Quality assessment of reasoning`,
  inputSchema: {
    type: "object",
    properties: {
      // Core sequential thinking fields
      thought: { type: "string", description: "Your current reasoning step" },
      nextThoughtNeeded: { type: "boolean", description: "Whether another thought step is needed" },
      thoughtNumber: { type: "integer", description: "Current thought number", minimum: 1 },
      totalThoughts: { type: "integer", description: "Estimated total thoughts needed", minimum: 1 },

      // Advanced cognitive fields
      confidence: { type: "number", description: "Confidence in this reasoning step (0.0-1.0)", minimum: 0, maximum: 1 },
      reasoning_quality: { type: "string", description: "Assessment of reasoning quality", enum: ["low", "medium", "high"] },
      meta_thought: { type: "string", description: "Meta-cognitive reflection on your reasoning process" },
      goal: { type: "string", description: "Overall goal or objective" },
      progress: { type: "number", description: "Progress toward goal (0.0-1.0)", minimum: 0, maximum: 1 },

      // Hypothesis testing
      hypothesis: { type: "string", description: "Current working hypothesis" },
      test_plan: { type: "string", description: "Plan for testing the hypothesis" },
      test_result: { type: "string", description: "Result of hypothesis testing" },
      evidence: { type: "array", items: { type: "string" }, description: "Evidence for/against hypothesis" },

      // Memory and context
      session_id: { type: "string", description: "Reasoning session identifier" },
      builds_on: { type: "array", items: { type: "string" }, description: "Previous thoughts this builds on" },
      challenges: { type: "array", items: { type: "string" }, description: "Ideas this challenges or contradicts" },

      // Branching (inherited)
      isRevision: { type: "boolean", description: "Whether this revises previous thinking" },
      revisesThought: { type: "integer", description: "Which thought is being reconsidered", minimum: 1 },
      branchFromThought: { type: "integer", description: "Branching point thought number", minimum: 1 },
      branchId: { type: "string", description: "Branch identifier" },
      needsMoreThoughts: { type: "boolean", description: "If more thoughts are needed" }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

export const QUERY_MEMORY_TOOL: Tool = {
  name: "query_reasoning_memory",
  description: `Query the integrated memory system to find related insights, hypotheses, and evidence.

Useful for:
- Finding similar problems solved before
- Retrieving relevant hypotheses and evidence
- Understanding connections between ideas
- Building on previous reasoning sessions

Parameters:
- session_id: The reasoning session to query within (required)
- query: What to search for in memory (required)

Returns related memories with confidence scores and connection information.`,
  inputSchema: {
    type: "object",
    properties: {
      session_id: { type: "string", description: "Reasoning session identifier" },
      query: { type: "string", description: "What to search for in memory" }
    },
    required: ["session_id", "query"]
  }
};

export const CREATE_LIBRARY_TOOL: Tool = {
  name: "create_memory_library",
  description: `Create a new named memory library for organized knowledge storage.

Enables you to create separate, named memory libraries for different projects, domains, or contexts.
Library names must contain only letters, numbers, underscores, and hyphens.

Parameters:
- library_name: Name for the new library (required)

Returns success status and message.`,
  inputSchema: {
    type: "object",
    properties: {
      library_name: { type: "string", description: "Name for the new memory library" }
    },
    required: ["library_name"]
  }
};

export const LIST_LIBRARIES_TOOL: Tool = {
  name: "list_memory_libraries",
  description: `List all available memory libraries with metadata.

Shows all existing memory libraries with information about:
- Library name
- Number of memory nodes
- Last modified date

Returns organized, searchable library information.`,
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

export const SWITCH_LIBRARY_TOOL: Tool = {
  name: "switch_memory_library",
  description: `Switch to a different memory library.

Allows you to switch between different memory libraries for different contexts or projects.
Current session state is saved before switching.

Parameters:
- library_name: Name of the library to switch to (required)

Returns success status and message.`,
  inputSchema: {
    type: "object",
    properties: {
      library_name: { type: "string", description: "Name of the library to switch to" }
    },
    required: ["library_name"]
  }
};

export const GET_LIBRARY_INFO_TOOL: Tool = {
  name: "get_current_library_info",
  description: `Get information about the currently active memory library.

Shows current library name, number of nodes, sessions, and other metadata.

Returns current library information.`,
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

export const CREATE_SYSTEM_JSON_TOOL: Tool = {
  name: "create_system_json",
  description: `Create a new system JSON file for storing coherent detailed searchable data or instructions and workflows for any domain or action.

Parameters:
- name: Name for the system JSON file (required) - alphanumeric, underscore, hyphen only
- domain: Domain or category for the data (required)
- description: Description of what this system JSON contains (required)
- data: The structured data to store (required) - can be any JSON-serializable object
- tags: Optional array of tags for searchability

Returns success status and confirmation message.`,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name for the system JSON file (alphanumeric, underscore, hyphen only)" },
      domain: { type: "string", description: "Domain or category for the data" },
      description: { type: "string", description: "Description of what this system JSON contains" },
      data: { type: "object", description: "The structured data to store" },
      tags: { type: "array", items: { type: "string" }, description: "Optional array of tags for searchability" }
    },
    required: ["name", "domain", "description", "data"]
  }
};

export const GET_SYSTEM_JSON_TOOL: Tool = {
  name: "get_system_json",
  description: `Retrieve a system JSON file by name.

Parameters:
- name: Name of the system JSON file to retrieve (required)

Returns the complete system JSON data including metadata and content.`,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the system JSON file to retrieve" }
    },
    required: ["name"]
  }
};

export const SEARCH_SYSTEM_JSON_TOOL: Tool = {
  name: "search_system_json",
  description: `Search through system JSON files by query.

Parameters:
- query: Search query to find matching system JSON files (required)

Returns matching files with relevance scores.`,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query to find matching system JSON files" }
    },
    required: ["query"]
  }
};

export const LIST_SYSTEM_JSON_TOOL: Tool = {
  name: "list_system_json",
  description: `List all available system JSON files.

Returns list of all system JSON files with their names, domains, and descriptions.`,
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

export const CREATE_SESSION_TOOL: Tool = {
  name: "create_session",
  description: "Create a new reasoning session.",
  inputSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "The goal of the reasoning session.",
      },
      libraryName: {
        type: "string",
        description: "The name of the library to use for the session.",
      },
    },
    required: ["goal"],
  },
};

export const ALL_TOOLS = [
  ADVANCED_REASONING_TOOL,
  QUERY_MEMORY_TOOL,
  CREATE_LIBRARY_TOOL,
  LIST_LIBRARIES_TOOL,
  SWITCH_LIBRARY_TOOL,
  GET_LIBRARY_INFO_TOOL,
  CREATE_SYSTEM_JSON_TOOL,
  GET_SYSTEM_JSON_TOOL,
  SEARCH_SYSTEM_JSON_TOOL,
  LIST_SYSTEM_JSON_TOOL,
  LIST_LANGCHAIN_MODELS_TOOL,
  GENERATE_LANGCHAIN_TEXT_TOOL,
  CREATE_SESSION_TOOL,
];
