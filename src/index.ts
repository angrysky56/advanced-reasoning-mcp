#!/usr/bin/env node

/**
 * Advanced Reasoning MCP Server
 *
 * Builds on the sequential-thinking pattern with meta-cognition, hypothesis
 * testing, a graph-based memory system with named libraries, and structured
 * SystemJSON document storage.
 *
 * Modernized to the high-level `McpServer` + `registerTool` API (SDK 1.x) with
 * zod-validated tool inputs. See AGENTS.md for the agent-facing tool guide.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import chalk from "chalk";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { randomUUID } from "crypto";

// ===== CONSTANTS =====

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "he",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "will",
  "with",
  "this",
  "but",
  "they",
  "have",
  "had",
  "what",
  "when",
  "where",
  "who",
  "which",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "can",
  "just",
  "should",
  "now",
]);

// Resolve the project directory (one level up from build/ or src/) in a way
// that is safe for paths containing spaces and works cross-platform.
const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DATA_PATH = path.join(PROJECT_DIR, "..", "memory_data");
const SYSTEM_JSON_PATH = path.join(MEMORY_DATA_PATH, "system_json");

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Generate a short, collision-resistant id suffix. */
function shortId(): string {
  return randomUUID().slice(0, 8);
}

/** Tokenize content for TF-IDF: lowercase, strip punctuation, drop stop words. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// ===== TYPES =====

interface MemoryNode {
  id: string;
  content: string;
  type: "thought" | "hypothesis" | "evidence" | "conclusion";
  metadata: Record<string, unknown>;
  connections: string[];
  timestamp: number;
  confidence: number;
}

interface ReasoningContext {
  sessionId: string;
  goal: string;
  currentFocus: string;
  confidence: number;
  reasoning_quality: "low" | "medium" | "high";
  meta_assessment: string;
  active_hypotheses: string[];
  working_memory: string[];
}

interface SystemJSONData {
  name: string;
  domain: string;
  description: string;
  data: Record<string, unknown>;
  searchable_content: string;
  tags: string[];
  created: number;
  modified: number;
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** Helper to build a JSON text tool result. */
function jsonResult(payload: unknown, isError = false): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: isError || undefined,
  };
}

/** Helper to build an error tool result from a caught value. */
function errorResult(error: unknown): ToolResult {
  return jsonResult(
    {
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    },
    true,
  );
}

/**
 * Serialized, atomic file writer.
 *
 * Snapshots are captured at enqueue time, so a write that is queued before a
 * library switch always persists the correct (old) state to the correct file.
 * Writes for the same path never run concurrently, preventing the temp-file
 * clobbering that a fixed `.tmp` name would cause.
 */
class FileWriter {
  private queue: Promise<unknown> = Promise.resolve();

  enqueue(filePath: string, json: string): Promise<void> {
    const task = this.queue.then(() => this.atomicWrite(filePath, json));
    // Swallow rejection on the chain so one failure doesn't poison the queue,
    // but still surface it to callers that await the returned promise.
    this.queue = task.catch((error) => {
      console.error(`File write failed for ${filePath}:`, error);
    });
    return task;
  }

  private async atomicWrite(filePath: string, json: string): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${shortId()}.tmp`;
    await fs.writeFile(tempPath, json, "utf-8");
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => {});
      throw error;
    }
  }
}

// ===== SYSTEM JSON STORAGE =====
// Structured document storage for workflows, instructions and domain data.
// Storage: memory_data/system_json/{name}.json

class SystemJSON {
  private writer = new FileWriter();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = fs
      .mkdir(SYSTEM_JSON_PATH, { recursive: true })
      .then(() => {})
      .catch((error) => {
        console.error("Failed to initialize system JSON storage:", error);
      });
  }

  async createSystemJSON(
    name: string,
    domain: string,
    description: string,
    data: Record<string, unknown>,
    tags: string[] = [],
  ): Promise<{ success: boolean; message: string }> {
    if (!NAME_PATTERN.test(name)) {
      return {
        success: false,
        message:
          "Name must contain only letters, numbers, underscores, and hyphens",
      };
    }

    const filePath = path.join(SYSTEM_JSON_PATH, `${name}.json`);

    try {
      await fs.access(filePath);
      return {
        success: false,
        message: `System JSON "${name}" already exists`,
      };
    } catch {
      // Does not exist yet — good.
    }

    const now = Date.now();
    const systemData: SystemJSONData = {
      name,
      domain,
      description,
      data,
      searchable_content: this.createSearchableContent(data, description, tags),
      tags,
      created: now,
      modified: now,
    };

    try {
      await this.writer.enqueue(filePath, JSON.stringify(systemData, null, 2));
      return { success: true, message: `Created system JSON: ${name}` };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create system JSON: ${error}`,
      };
    }
  }

  async getSystemJSON(
    name: string,
  ): Promise<{ success: boolean; data?: SystemJSONData; message: string }> {
    if (!NAME_PATTERN.test(name)) {
      return {
        success: false,
        message:
          "Name must contain only letters, numbers, underscores, and hyphens",
      };
    }

    try {
      const content = await fs.readFile(
        path.join(SYSTEM_JSON_PATH, `${name}.json`),
        "utf-8",
      );
      return {
        success: true,
        data: JSON.parse(content) as SystemJSONData,
        message: `Retrieved system JSON: ${name}`,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { success: false, message: `System JSON "${name}" not found` };
      }
      return {
        success: false,
        message: `Failed to retrieve system JSON: ${error}`,
      };
    }
  }

  async searchSystemJSON(
    query: string,
  ): Promise<{
    results: Array<{ name: string; score: number; data: SystemJSONData }>;
  }> {
    const results: Array<{
      name: string;
      score: number;
      data: SystemJSONData;
    }> = [];
    try {
      const files = await fs.readdir(SYSTEM_JSON_PATH);
      for (const file of files) {
        if (!file.endsWith(".json") || file.endsWith(".tmp")) continue;
        try {
          const content = await fs.readFile(
            path.join(SYSTEM_JSON_PATH, file),
            "utf-8",
          );
          const data = JSON.parse(content) as SystemJSONData;
          const score = this.calculateSearchScore(query, data);
          if (score > 0.1) results.push({ name: data.name, score, data });
        } catch (error) {
          console.error(`Skipping corrupted system JSON file: ${file}`, error);
        }
      }
    } catch (error) {
      console.error("Failed to search system JSON:", error);
    }
    return { results: results.sort((a, b) => b.score - a.score) };
  }

  async listSystemJSON(): Promise<{
    files: Array<{ name: string; domain: string; description: string }>;
  }> {
    const systemFiles: Array<{
      name: string;
      domain: string;
      description: string;
    }> = [];
    try {
      const files = await fs.readdir(SYSTEM_JSON_PATH);
      for (const file of files) {
        if (!file.endsWith(".json") || file.endsWith(".tmp")) continue;
        try {
          const content = await fs.readFile(
            path.join(SYSTEM_JSON_PATH, file),
            "utf-8",
          );
          const data = JSON.parse(content) as SystemJSONData;
          systemFiles.push({
            name: data.name,
            domain: data.domain,
            description: data.description,
          });
        } catch (error) {
          console.error(`Skipping corrupted system JSON file: ${file}`, error);
        }
      }
    } catch (error) {
      console.error("Failed to list system JSON files:", error);
    }
    return { files: systemFiles.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  private createSearchableContent(
    data: Record<string, unknown>,
    description: string,
    tags: string[],
  ): string {
    return `${description} ${tags.join(" ")} ${JSON.stringify(data)}`.toLowerCase();
  }

  private calculateSearchScore(query: string, data: SystemJSONData): number {
    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (queryWords.length === 0) return 0;
    const contentWords = new Set(data.searchable_content.split(/\s+/));
    const common = queryWords.filter((word) => contentWords.has(word));
    return common.length / queryWords.length;
  }
}

// ===== GRAPH MEMORY WITH PERSISTENCE =====
// Memory is stored in memory_data/{library_name}.json and auto-saved on change.

class CognitiveMemory {
  private nodes: Map<string, MemoryNode> = new Map();
  private sessions: Map<string, ReasoningContext> = new Map();
  private currentLibraryName = "cognitive_memory";
  private writer = new FileWriter();

  // TF-IDF state
  private documentFrequencies: Map<string, number> = new Map();
  private totalDocuments = 0;

  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(MEMORY_DATA_PATH, { recursive: true });
      await this.loadFromFile();
    } catch (error) {
      console.error("Failed to initialize memory storage:", error);
    }
  }

  private libraryPath(name: string): string {
    return path.join(MEMORY_DATA_PATH, `${name}.json`);
  }

  private updateTfIdfStats(content: string): void {
    this.totalDocuments++;
    for (const word of new Set(tokenize(content))) {
      this.documentFrequencies.set(
        word,
        (this.documentFrequencies.get(word) || 0) + 1,
      );
    }
  }

  private rebuildSearchIndex(): void {
    this.documentFrequencies.clear();
    this.totalDocuments = 0;
    for (const node of this.nodes.values()) this.updateTfIdfStats(node.content);
  }

  /** Capture the current state as a JSON snapshot and queue an atomic write. */
  private persist(): Promise<void> {
    const memoryState = {
      nodes: Array.from(this.nodes.entries()),
      sessions: Array.from(this.sessions.entries()),
      timestamp: Date.now(),
      libraryName: this.currentLibraryName,
    };
    return this.writer.enqueue(
      this.libraryPath(this.currentLibraryName),
      JSON.stringify(memoryState, null, 2),
    );
  }

  private async loadFromFile(libraryName?: string): Promise<void> {
    const targetLibrary = libraryName || this.currentLibraryName;
    try {
      const data = await fs.readFile(this.libraryPath(targetLibrary), "utf-8");
      const memoryState = JSON.parse(data);
      this.nodes = new Map(memoryState.nodes);
      this.sessions = new Map(memoryState.sessions);
      this.currentLibraryName = targetLibrary;
      this.rebuildSearchIndex();
      console.error(
        `Loaded ${this.nodes.size} memory nodes and ${this.sessions.size} sessions from library: ${targetLibrary}`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to load memory from file:", error);
      }
      this.documentFrequencies.clear();
      this.totalDocuments = 0;
    }
  }

  // === LIBRARY MANAGEMENT ===

  async createLibrary(
    libraryName: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!NAME_PATTERN.test(libraryName)) {
      return {
        success: false,
        message:
          "Library name must contain only letters, numbers, underscores, and hyphens",
      };
    }

    try {
      await fs.access(this.libraryPath(libraryName));
      return {
        success: false,
        message: `Library "${libraryName}" already exists`,
      };
    } catch {
      // Does not exist yet — good.
    }

    try {
      // Snapshot current library first (queued at current name), then switch.
      if (this.nodes.size > 0 || this.sessions.size > 0) {
        await this.persist();
      }
      this.nodes.clear();
      this.sessions.clear();
      this.rebuildSearchIndex();
      this.currentLibraryName = libraryName;
      await this.persist();
      return { success: true, message: `Created library: ${libraryName}` };
    } catch (error) {
      return { success: false, message: `Failed to create library: ${error}` };
    }
  }

  async listLibraries(): Promise<{
    libraries: Array<{ name: string; size: number; lastModified: Date }>;
  }> {
    const libraries: Array<{ name: string; size: number; lastModified: Date }> =
      [];
    try {
      const files = await fs.readdir(MEMORY_DATA_PATH);
      for (const file of files) {
        if (!file.endsWith(".json") || file.endsWith(".tmp")) continue;
        const filePath = path.join(MEMORY_DATA_PATH, file);
        try {
          const stats = await fs.stat(filePath);
          if (!stats.isFile()) continue;
          const memoryState = JSON.parse(await fs.readFile(filePath, "utf-8"));
          libraries.push({
            name: file.replace(/\.json$/, ""),
            size: Array.isArray(memoryState.nodes)
              ? memoryState.nodes.length
              : 0,
            lastModified: stats.mtime,
          });
        } catch (error) {
          console.error(`Skipping corrupted library file: ${file}`, error);
        }
      }
    } catch (error) {
      console.error("Failed to list libraries:", error);
    }
    return {
      libraries: libraries.sort(
        (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
      ),
    };
  }

  async switchLibrary(
    libraryName: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!NAME_PATTERN.test(libraryName)) {
      return {
        success: false,
        message:
          "Library name must contain only letters, numbers, underscores, and hyphens",
      };
    }

    try {
      await fs.access(this.libraryPath(libraryName));
    } catch {
      return {
        success: false,
        message: `Library "${libraryName}" does not exist`,
      };
    }

    try {
      if (this.nodes.size > 0 || this.sessions.size > 0) {
        await this.persist();
      }
      await this.loadFromFile(libraryName);
      return { success: true, message: `Switched to library: ${libraryName}` };
    } catch (error) {
      return { success: false, message: `Failed to switch library: ${error}` };
    }
  }

  getCurrentLibraryName(): string {
    return this.currentLibraryName;
  }

  // === NODES ===

  addNode(
    content: string,
    type: MemoryNode["type"],
    metadata: Record<string, unknown> = {},
  ): string {
    const id = `node_${Date.now()}_${shortId()}`;
    const confidence =
      typeof metadata.confidence === "number" ? metadata.confidence : 0.5;
    this.nodes.set(id, {
      id,
      content,
      type,
      metadata,
      connections: [],
      timestamp: Date.now(),
      confidence,
    });
    this.updateTfIdfStats(content);
    void this.persist();
    return id;
  }

  /** Create an undirected edge between two existing nodes. Returns success. */
  connectNodes(nodeId1: string, nodeId2: string): boolean {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);
    if (!node1 || !node2) return false;

    if (!node1.connections.includes(nodeId2)) node1.connections.push(nodeId2);
    if (!node2.connections.includes(nodeId1)) node2.connections.push(nodeId1);
    void this.persist();
    return true;
  }

  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  queryRelated(
    content: string,
    maxResults = 5,
    excludeId?: string,
  ): MemoryNode[] {
    const results: Array<{ node: MemoryNode; relevance: number }> = [];
    for (const node of this.nodes.values()) {
      if (node.id === excludeId) continue;
      const relevance = this.calculateRelevance(content, node.content);
      if (relevance > 0.1) results.push({ node, relevance });
    }
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxResults)
      .map((r) => r.node);
  }

  private calculateRelevance(query: string, content: string): number {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return 0;

    const contentTerms = content
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/);
    if (contentTerms.length === 0) return 0;

    let score = 0;
    for (const term of queryTerms) {
      const termCount = contentTerms.filter((w) => w === term).length;
      if (termCount === 0) continue;
      const tf = termCount / contentTerms.length;
      const docFreq = this.documentFrequencies.get(term) || 0;
      const idf = Math.log(this.totalDocuments / (docFreq + 1)) + 1; // +1 smoothing
      score += tf * idf;
    }
    return score;
  }

  // === SESSIONS ===

  async createSession(goal: string, libraryName?: string): Promise<string> {
    if (libraryName && libraryName !== this.currentLibraryName) {
      const switchResult = await this.switchLibrary(libraryName);
      if (!switchResult.success) {
        console.error(
          `Failed to switch to library ${libraryName}:`,
          switchResult.message,
        );
      }
    }

    const sessionId = `session_${Date.now()}_${shortId()}`;
    this.sessions.set(sessionId, {
      sessionId,
      goal,
      currentFocus: goal,
      confidence: 0.5,
      reasoning_quality: "medium",
      meta_assessment: "Starting new reasoning session",
      active_hypotheses: [],
      working_memory: [],
    });
    await this.persist();
    return sessionId;
  }

  /** Ensure a session exists; create a lightweight one if missing. */
  ensureSession(
    sessionId: string,
    goal = "Ad-hoc reasoning session",
  ): ReasoningContext {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        goal,
        currentFocus: goal,
        confidence: 0.5,
        reasoning_quality: "medium",
        meta_assessment: "Auto-created session",
        active_hypotheses: [],
        working_memory: [],
      };
      this.sessions.set(sessionId, session);
      void this.persist();
    }
    return session;
  }

  updateSession(sessionId: string, updates: Partial<ReasoningContext>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    Object.assign(session, updates);
    void this.persist();
  }

  getSession(sessionId: string): ReasoningContext | undefined {
    return this.sessions.get(sessionId);
  }

  getMemoryStats(): {
    nodes: number;
    sessions: number;
    connections: number;
    totalDocuments: number;
  } {
    let connections = 0;
    for (const node of this.nodes.values())
      connections += node.connections.length;
    return {
      nodes: this.nodes.size,
      sessions: this.sessions.size,
      connections: connections / 2, // each edge counted from both ends
      totalDocuments: this.totalDocuments,
    };
  }
}

// ===== ADVANCED REASONING SERVER =====

interface AdvancedThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  confidence: number;
  reasoning_quality: "low" | "medium" | "high";
  meta_thought: string;
  goal?: string;
  progress?: number;
  hypothesis?: string;
  test_plan?: string;
  test_result?: string;
  evidence?: string[];
  session_id?: string;
  builds_on?: string[];
  challenges?: string[];
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

class AdvancedReasoningServer {
  private thoughtHistory: AdvancedThoughtData[] = [];
  private branches = new Map<string, AdvancedThoughtData[]>();
  private memory = new CognitiveMemory();
  private systemJson = new SystemJSON();
  private disableLogging: boolean;

  constructor() {
    this.disableLogging =
      (process.env.DISABLE_REASONING_LOGGING || "").toLowerCase() === "true";
  }

  /** Resolves once both storage layers have finished loading. */
  async ready(): Promise<void> {
    await Promise.all([this.memory.ready, this.systemJson.ready]);
  }

  private formatAdvancedThought(t: AdvancedThoughtData): string {
    let prefix: string;
    let context = "";
    if (t.isRevision) {
      prefix = chalk.yellow("🔄 Revision");
      context = ` (revising thought ${t.revisesThought})`;
    } else if (t.branchFromThought) {
      prefix = chalk.green("🌿 Branch");
      context = ` (from thought ${t.branchFromThought}, ID: ${t.branchId})`;
    } else {
      prefix = chalk.blue("🧠 Advanced Thought");
    }

    const qualityColor =
      t.reasoning_quality === "high"
        ? chalk.green
        : t.reasoning_quality === "medium"
          ? chalk.yellow
          : chalk.red;
    const confidenceBar = "█".repeat(Math.round(t.confidence * 10));
    const confidenceDisplay = chalk.cyan(
      `[${confidenceBar.padEnd(10)}] ${Math.round(t.confidence * 100)}%`,
    );

    const header = `${prefix} ${t.thoughtNumber}/${t.totalThoughts}${context}`;
    const quality = qualityColor(
      `Quality: ${t.reasoning_quality.toUpperCase()}`,
    );
    const confDisplay = `Confidence: ${confidenceDisplay}`;

    let content = `Main: ${t.thought}`;
    if (t.meta_thought) content += `\nMeta: ${chalk.italic(t.meta_thought)}`;
    if (t.hypothesis) content += `\nHypothesis: ${chalk.magenta(t.hypothesis)}`;

    const border = "─".repeat(Math.max(header.length, content.length) + 4);
    return `
┌${border}┐
│ ${header.padEnd(border.length - 2)} │
│ ${quality} │ ${confDisplay} │
├${border}┤
│ ${content
      .split("\n")
      .map((line) => line.padEnd(border.length - 2))
      .join(" │\n│ ")} │
└${border}┘`;
  }

  processAdvancedThought(data: AdvancedThoughtData): ToolResult {
    try {
      if (data.thoughtNumber > data.totalThoughts) {
        data.totalThoughts = data.thoughtNumber;
      }

      const edgeReport: {
        builds_on: string[];
        challenges: string[];
        missing: string[];
      } = {
        builds_on: [],
        challenges: [],
        missing: [],
      };

      if (data.session_id) {
        this.memory.ensureSession(data.session_id, data.goal);
        const nodeId = this.memory.addNode(data.thought, "thought", {
          confidence: data.confidence,
          reasoning_quality: data.reasoning_quality,
          thoughtNumber: data.thoughtNumber,
          hypothesis: data.hypothesis,
          session_id: data.session_id,
        });

        // Build graph edges from references. Both builds_on and challenges are
        // interpreted as node IDs of prior thoughts.
        for (const targetId of data.builds_on ?? []) {
          if (this.memory.connectNodes(nodeId, targetId))
            edgeReport.builds_on.push(targetId);
          else edgeReport.missing.push(targetId);
        }
        for (const targetId of data.challenges ?? []) {
          if (this.memory.connectNodes(nodeId, targetId))
            edgeReport.challenges.push(targetId);
          else edgeReport.missing.push(targetId);
        }

        this.memory.updateSession(data.session_id, {
          currentFocus: data.thought,
          confidence: data.confidence,
          reasoning_quality: data.reasoning_quality,
          meta_assessment: data.meta_thought,
        });

        this.thoughtHistory.push(data);

        if (data.branchFromThought && data.branchId) {
          if (data.branchId === "__proto__" || data.branchId === "constructor" || data.branchId === "prototype") {
            throw new Error("Invalid branchId");
          }
          let branch = this.branches.get(data.branchId);
          if (!branch) {
            branch = [];
            this.branches.set(data.branchId, branch);
          }
          branch.push(data);
        }

        if (!this.disableLogging)
          console.error(this.formatAdvancedThought(data));

        const relatedMemories = this.memory.queryRelated(
          data.thought,
          3,
          nodeId,
        );
        return jsonResult({
          thoughtNumber: data.thoughtNumber,
          totalThoughts: data.totalThoughts,
          nextThoughtNeeded: data.nextThoughtNeeded,
          confidence: data.confidence,
          reasoning_quality: data.reasoning_quality,
          meta_assessment: data.meta_thought,
          hypothesis: data.hypothesis,
          nodeId,
          edges: edgeReport,
          branches: Array.from(this.branches.keys()),
          thoughtHistoryLength: this.thoughtHistory.length,
          memoryStats: this.memory.getMemoryStats(),
          relatedMemories: relatedMemories.map((m) => ({
            id: m.id,
            content: m.content,
            confidence: m.confidence,
          })),
          suggested_connections: relatedMemories.map((m) => m.id),
          consistency_note:
            relatedMemories.length > 0
              ? "Verify consistency with related thoughts above"
              : undefined,
        });
      }

      // No session: history-only mode (no persistence).
      this.thoughtHistory.push(data);
      if (data.branchFromThought && data.branchId) {
        if (data.branchId === "__proto__" || data.branchId === "constructor" || data.branchId === "prototype") {
          throw new Error("Invalid branchId");
        }
        let branch = this.branches.get(data.branchId);
        if (!branch) {
          branch = [];
          this.branches.set(data.branchId, branch);
        }
        branch.push(data);
      }
      if (!this.disableLogging) console.error(this.formatAdvancedThought(data));

      return jsonResult({
        thoughtNumber: data.thoughtNumber,
        totalThoughts: data.totalThoughts,
        nextThoughtNeeded: data.nextThoughtNeeded,
        confidence: data.confidence,
        reasoning_quality: data.reasoning_quality,
        meta_assessment: data.meta_thought,
        hypothesis: data.hypothesis,
        branches: Array.from(this.branches.keys()),
        thoughtHistoryLength: this.thoughtHistory.length,
        note: "No session_id provided — thought not persisted to memory. Pass session_id to enable memory.",
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async createSession(goal: string, libraryName?: string): Promise<ToolResult> {
    try {
      const sessionId = await this.memory.createSession(goal, libraryName);
      return jsonResult({
        sessionId,
        goal,
        currentLibrary: this.memory.getCurrentLibraryName(),
        message:
          "Reasoning session created. Pass this session_id to advanced_reasoning to persist thoughts.",
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async createLibrary(libraryName: string): Promise<ToolResult> {
    try {
      const result = await this.memory.createLibrary(libraryName);
      return jsonResult(
        {
          libraryName,
          success: result.success,
          message: result.message,
          currentLibrary: this.memory.getCurrentLibraryName(),
        },
        !result.success,
      );
    } catch (error) {
      return errorResult(error);
    }
  }

  async listLibraries(): Promise<ToolResult> {
    try {
      const result = await this.memory.listLibraries();
      return jsonResult({
        currentLibrary: this.memory.getCurrentLibraryName(),
        libraries: result.libraries,
        totalLibraries: result.libraries.length,
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async switchLibrary(libraryName: string): Promise<ToolResult> {
    try {
      const result = await this.memory.switchLibrary(libraryName);
      return jsonResult(
        {
          libraryName,
          success: result.success,
          message: result.message,
          currentLibrary: this.memory.getCurrentLibraryName(),
          memoryStats: this.memory.getMemoryStats(),
        },
        !result.success,
      );
    } catch (error) {
      return errorResult(error);
    }
  }

  getCurrentLibraryInfo(): ToolResult {
    try {
      return jsonResult({
        currentLibrary: this.memory.getCurrentLibraryName(),
        memoryStats: this.memory.getMemoryStats(),
        status: "success",
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  queryMemory(query: string, sessionId?: string): ToolResult {
    try {
      const relatedNodes = this.memory.queryRelated(query, 10);
      const session = sessionId ? this.memory.getSession(sessionId) : undefined;
      return jsonResult({
        query,
        sessionContext: session,
        relatedMemories: relatedNodes.map((node) => ({
          id: node.id,
          content: node.content,
          type: node.type,
          confidence: node.confidence,
          connections: node.connections.length,
        })),
        memoryStats: this.memory.getMemoryStats(),
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async createSystemJSON(
    name: string,
    domain: string,
    description: string,
    data: Record<string, unknown>,
    tags: string[] = [],
  ): Promise<ToolResult> {
    try {
      const result = await this.systemJson.createSystemJSON(
        name,
        domain,
        description,
        data,
        tags,
      );
      return jsonResult(
        {
          name,
          domain,
          description,
          success: result.success,
          message: result.message,
          tags,
          created: Date.now(),
        },
        !result.success,
      );
    } catch (error) {
      return errorResult(error);
    }
  }

  async getSystemJSON(name: string): Promise<ToolResult> {
    try {
      const result = await this.systemJson.getSystemJSON(name);
      return jsonResult(
        {
          name,
          success: result.success,
          message: result.message,
          data: result.data || null,
        },
        !result.success,
      );
    } catch (error) {
      return errorResult(error);
    }
  }

  async searchSystemJSON(query: string): Promise<ToolResult> {
    try {
      const result = await this.systemJson.searchSystemJSON(query);
      return jsonResult({
        query,
        results: result.results.map((r) => ({
          name: r.name,
          score: r.score,
          domain: r.data.domain,
          description: r.data.description,
          tags: r.data.tags,
        })),
        totalResults: result.results.length,
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async listSystemJSON(): Promise<ToolResult> {
    try {
      const result = await this.systemJson.listSystemJSON();
      return jsonResult({
        files: result.files,
        totalFiles: result.files.length,
        status: "success",
      });
    } catch (error) {
      return errorResult(error);
    }
  }
}

// ===== TOOL INPUT SCHEMAS (zod) =====

const advancedReasoningShape = {
  thought: z.string().describe("Your current reasoning step"),
  nextThoughtNeeded: z
    .boolean()
    .describe("Whether another thought step is needed"),
  thoughtNumber: z.number().int().min(1).describe("Current thought number"),
  totalThoughts: z
    .number()
    .int()
    .min(1)
    .describe("Estimated total thoughts needed"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Confidence in this reasoning step (0.0-1.0)"),
  reasoning_quality: z
    .enum(["low", "medium", "high"])
    .default("medium")
    .describe("Assessment of reasoning quality"),
  meta_thought: z
    .string()
    .default("")
    .describe("Meta-cognitive reflection on your reasoning process"),
  goal: z.string().optional().describe("Overall goal or objective"),
  progress: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Progress toward goal (0.0-1.0)"),
  hypothesis: z.string().optional().describe("Current working hypothesis"),
  test_plan: z.string().optional().describe("Plan for testing the hypothesis"),
  test_result: z.string().optional().describe("Result of hypothesis testing"),
  evidence: z
    .array(z.string())
    .optional()
    .describe("Evidence for/against the hypothesis"),
  session_id: z
    .string()
    .optional()
    .describe("Reasoning session id; pass to persist this thought to memory"),
  builds_on: z
    .array(z.string())
    .optional()
    .describe(
      "Node IDs of prior thoughts this builds on (creates graph edges)",
    ),
  challenges: z
    .array(z.string())
    .optional()
    .describe(
      "Node IDs of prior thoughts this challenges/contradicts (creates graph edges)",
    ),
  isRevision: z
    .boolean()
    .optional()
    .describe("Whether this revises previous thinking"),
  revisesThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Which thought is being reconsidered"),
  branchFromThought: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Branching point thought number"),
  branchId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Branch ID must contain only alphanumeric characters, underscores, or hyphens")
    .optional()
    .describe("Branch identifier"),
  needsMoreThoughts: z
    .boolean()
    .optional()
    .describe("If more thoughts are needed"),
};

// ===== SERVER SETUP =====

const reasoningServer = new AdvancedReasoningServer();

const server = new McpServer({
  name: "advanced-reasoning-server",
  version: "1.1.0",
});

server.registerTool(
  "advanced_reasoning",
  {
    title: "Advanced Reasoning",
    description: `Advanced cognitive reasoning that builds on sequential thinking with meta-cognition, hypothesis testing, and integrated graph memory.

Key features: confidence tracking, reasoning-quality assessment, meta-cognitive reflection, hypothesis formulation/testing, evidence tracking, and session-based memory.

Pass session_id (create one with create_reasoning_session, or reuse any string) to persist thoughts to the memory graph. Without session_id, the thought is processed but not stored. Use builds_on / challenges with prior node IDs to wire up the reasoning graph. Use isRevision/revisesThought to revise, and branchFromThought/branchId to explore alternatives.`,
    inputSchema: advancedReasoningShape,
  },
  async (args) =>
    reasoningServer.processAdvancedThought(args as AdvancedThoughtData),
);

server.registerTool(
  "create_reasoning_session",
  {
    title: "Create Reasoning Session",
    description:
      "Create a named reasoning session for a goal and return its session_id. Pass that id to advanced_reasoning to persist a connected chain of thoughts to memory. Optionally switch/target a memory library.",
    inputSchema: {
      goal: z.string().describe("The objective for this reasoning session"),
      library_name: z
        .string()
        .optional()
        .describe("Optional memory library to use for this session"),
    },
  },
  async ({ goal, library_name }) =>
    reasoningServer.createSession(goal, library_name),
);

server.registerTool(
  "query_reasoning_memory",
  {
    title: "Query Reasoning Memory",
    description:
      "Search the integrated memory graph for related insights, hypotheses, and evidence using TF-IDF relevance. session_id is optional and, if given, includes that session's context.",
    inputSchema: {
      query: z.string().describe("What to search for in memory"),
      session_id: z
        .string()
        .optional()
        .describe("Optional session to include context for"),
    },
  },
  async ({ query, session_id }) =>
    reasoningServer.queryMemory(query, session_id),
);

server.registerTool(
  "create_memory_library",
  {
    title: "Create Memory Library",
    description:
      "Create a new named memory library for organized knowledge storage. Names may contain only letters, numbers, underscores, and hyphens.",
    inputSchema: {
      library_name: z.string().describe("Name for the new memory library"),
    },
  },
  async ({ library_name }) => reasoningServer.createLibrary(library_name),
);

server.registerTool(
  "list_memory_libraries",
  {
    title: "List Memory Libraries",
    description:
      "List all available memory libraries with node counts and last-modified dates.",
    inputSchema: {},
  },
  async () => reasoningServer.listLibraries(),
);

server.registerTool(
  "switch_memory_library",
  {
    title: "Switch Memory Library",
    description:
      "Switch to a different memory library. Current state is saved before switching.",
    inputSchema: {
      library_name: z.string().describe("Name of the library to switch to"),
    },
  },
  async ({ library_name }) => reasoningServer.switchLibrary(library_name),
);

server.registerTool(
  "get_current_library_info",
  {
    title: "Get Current Library Info",
    description:
      "Get the active memory library name plus node/session/connection statistics.",
    inputSchema: {},
  },
  async () => reasoningServer.getCurrentLibraryInfo(),
);

server.registerTool(
  "create_system_json",
  {
    title: "Create System JSON",
    description:
      "Create a structured, searchable JSON document for workflows, instructions, or domain data. Name must be alphanumeric/underscore/hyphen only.",
    inputSchema: {
      name: z
        .string()
        .describe(
          "Name for the system JSON file (alphanumeric, underscore, hyphen)",
        ),
      domain: z.string().describe("Domain or category for the data"),
      description: z
        .string()
        .describe("Description of what this system JSON contains"),
      data: z
        .record(z.string(), z.unknown())
        .describe("The structured data to store"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags for searchability"),
    },
  },
  async ({ name, domain, description, data, tags }) =>
    reasoningServer.createSystemJSON(name, domain, description, data, tags),
);

server.registerTool(
  "get_system_json",
  {
    title: "Get System JSON",
    description:
      "Retrieve a system JSON document by name, including metadata and content.",
    inputSchema: {
      name: z.string().describe("Name of the system JSON file to retrieve"),
    },
  },
  async ({ name }) => reasoningServer.getSystemJSON(name),
);

server.registerTool(
  "search_system_json",
  {
    title: "Search System JSON",
    description:
      "Search system JSON documents by query, returning matches with relevance scores.",
    inputSchema: {
      query: z
        .string()
        .describe("Search query to find matching system JSON files"),
    },
  },
  async ({ query }) => reasoningServer.searchSystemJSON(query),
);

server.registerTool(
  "list_system_json",
  {
    title: "List System JSON",
    description:
      "List all system JSON documents with their names, domains, and descriptions.",
    inputSchema: {},
  },
  async () => reasoningServer.listSystemJSON(),
);

// ===== RUN =====

async function runServer(): Promise<void> {
  // Ensure persisted memory/system data is loaded before serving requests.
  await reasoningServer.ready();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Advanced Reasoning MCP Server running on stdio");

  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
