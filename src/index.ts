#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

// ===== TYPES =====

interface MemoryNode {
  id: string;
  content: string;
  type: 'thought' | 'hypothesis' | 'evidence' | 'conclusion';
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
  reasoning_quality: 'low' | 'medium' | 'high';
  meta_assessment: string;
  active_hypotheses: string[];
  working_memory: string[];
}

interface AdvancedThoughtData {
  // Core sequential thinking fields
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  
  // Advanced cognitive fields
  confidence: number;
  reasoning_quality: 'low' | 'medium' | 'high';
  meta_thought: string;
  goal?: string;
  progress?: number;
  
  // Hypothesis testing
  hypothesis?: string;
  test_plan?: string;
  test_result?: string;
  evidence?: string[];
  
  // Memory and context
  session_id?: string;
  builds_on?: string[];
  challenges?: string[];
  
  // Branching (inherited from sequential thinking)
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

// ===== INTEGRATED GRAPH MEMORY WITH PERSISTENCE =====
// Memory data is stored in: {project}/memory_data/cognitive_memory.json
// Automatically saves on node/session creation and loads on startup

class CognitiveMemory {
  private nodes: Map<string, MemoryNode> = new Map();
  private sessions: Map<string, ReasoningContext> = new Map();
  private memoryDataPath: string;

  constructor() {
    // Store memory data relative to the project directory, not cwd
    const projectDir = path.dirname(new URL(import.meta.url).pathname);
    this.memoryDataPath = path.join(projectDir, '..', 'memory_data');
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.memoryDataPath, { recursive: true });
      await this.loadFromFile();
    } catch (error) {
      console.error('Failed to initialize memory storage:', error);
    }
  }

  private async saveToFile(): Promise<void> {
    try {
      const memoryState = {
        nodes: Array.from(this.nodes.entries()),
        sessions: Array.from(this.sessions.entries()),
        timestamp: Date.now()
      };
      
      const filePath = path.join(this.memoryDataPath, 'cognitive_memory.json');
      await fs.writeFile(filePath, JSON.stringify(memoryState, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save memory to file:', error);
    }
  }

  private async loadFromFile(): Promise<void> {
    try {
      const filePath = path.join(this.memoryDataPath, 'cognitive_memory.json');
      const data = await fs.readFile(filePath, 'utf-8');
      const memoryState = JSON.parse(data);
      
      this.nodes = new Map(memoryState.nodes);
      this.sessions = new Map(memoryState.sessions);
      
      console.error(`Loaded ${this.nodes.size} memory nodes and ${this.sessions.size} sessions from persistence`);
    } catch (error) {
      // File doesn't exist or is corrupted - start with empty memory
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to load memory from file:', error);
      }
    }
  }

  addNode(content: string, type: MemoryNode['type'], metadata: Record<string, unknown> = {}): string {
    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const node: MemoryNode = {
      id,
      content,
      type,
      metadata,
      connections: [],
      timestamp: Date.now(),
      confidence: metadata.confidence as number || 0.5
    };
    this.nodes.set(id, node);
    
    // Auto-save to persistence
    this.saveToFile().catch(error => 
      console.error('Failed to auto-save memory node:', error)
    );
    
    return id;
  }

  connectNodes(nodeId1: string, nodeId2: string): void {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);
    
    if (node1 && node2) {
      if (!node1.connections.includes(nodeId2)) {
        node1.connections.push(nodeId2);
      }
      if (!node2.connections.includes(nodeId1)) {
        node2.connections.push(nodeId1);
      }
    }
  }

  queryRelated(content: string, maxResults: number = 5): MemoryNode[] {
    const results: Array<{ node: MemoryNode; relevance: number }> = [];
    
    for (const node of this.nodes.values()) {
      const relevance = this.calculateRelevance(content, node.content);
      if (relevance > 0.1) {
        results.push({ node, relevance });
      }
    }
    
    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxResults)
      .map(r => r.node);
  }

  private calculateRelevance(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    const commonWords = queryWords.filter(word => contentWords.includes(word));
    return commonWords.length / Math.max(queryWords.length, contentWords.length);
  }

  createSession(goal: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const context: ReasoningContext = {
      sessionId,
      goal,
      currentFocus: goal,
      confidence: 0.5,
      reasoning_quality: 'medium',
      meta_assessment: 'Starting new reasoning session',
      active_hypotheses: [],
      working_memory: []
    };
    this.sessions.set(sessionId, context);
    
    // Auto-save to persistence
    this.saveToFile().catch(error => 
      console.error('Failed to auto-save session:', error)
    );
    
    return sessionId;
  }

  updateSession(sessionId: string, updates: Partial<ReasoningContext>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      
      // Auto-save to persistence
      this.saveToFile().catch(error => 
        console.error('Failed to auto-save session update:', error)
      );
    }
  }

  getSession(sessionId: string): ReasoningContext | undefined {
    return this.sessions.get(sessionId);
  }

  getMemoryStats(): { nodes: number; sessions: number; connections: number } {
    let connections = 0;
    for (const node of this.nodes.values()) {
      connections += node.connections.length;
    }
    return {
      nodes: this.nodes.size,
      sessions: this.sessions.size,
      connections: connections / 2 // Each connection is counted twice
    };
  }
}

// ===== ADVANCED REASONING SERVER =====

class AdvancedReasoningServer {
  private thoughtHistory: AdvancedThoughtData[] = [];
  private branches: Record<string, AdvancedThoughtData[]> = {};
  private memory: CognitiveMemory = new CognitiveMemory();
  private disableLogging: boolean;

  constructor() {
    this.disableLogging = (process.env.DISABLE_REASONING_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): AdvancedThoughtData {
    const data = input as Record<string, unknown>;

    // Validate core fields
    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    // Validate advanced fields with defaults
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5;
    const reasoning_quality = ['low', 'medium', 'high'].includes(data.reasoning_quality as string) 
      ? data.reasoning_quality as 'low' | 'medium' | 'high'
      : 'medium';

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      confidence,
      reasoning_quality,
      meta_thought: data.meta_thought as string || '',
      goal: data.goal as string,
      progress: data.progress as number,
      hypothesis: data.hypothesis as string,
      test_plan: data.test_plan as string,
      test_result: data.test_result as string,
      evidence: data.evidence as string[],
      session_id: data.session_id as string,
      builds_on: data.builds_on as string[],
      challenges: data.challenges as string[],
      isRevision: data.isRevision as boolean,
      revisesThought: data.revisesThought as number,
      branchFromThought: data.branchFromThought as number,
      branchId: data.branchId as string,
      needsMoreThoughts: data.needsMoreThoughts as boolean,
    };
  }

  private formatAdvancedThought(thoughtData: AdvancedThoughtData): string {
    const { 
      thoughtNumber, 
      totalThoughts, 
      thought, 
      confidence, 
      reasoning_quality, 
      meta_thought,
      hypothesis,
      isRevision, 
      revisesThought, 
      branchFromThought, 
      branchId 
    } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('🧠 Advanced Thought');
      context = '';
    }

    // Quality and confidence indicators
    const qualityColor = reasoning_quality === 'high' ? chalk.green : 
                        reasoning_quality === 'medium' ? chalk.yellow : chalk.red;
    const confidenceBar = '█'.repeat(Math.round(confidence * 10));
    const confidenceDisplay = chalk.cyan(`[${confidenceBar.padEnd(10)}] ${Math.round(confidence * 100)}%`);

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const quality = qualityColor(`Quality: ${reasoning_quality.toUpperCase()}`);
    const confDisplay = `Confidence: ${confidenceDisplay}`;
    
    let content = `Main: ${thought}`;
    if (meta_thought) {
      content += `\nMeta: ${chalk.italic(meta_thought)}`;
    }
    if (hypothesis) {
      content += `\nHypothesis: ${chalk.magenta(hypothesis)}`;
    }

    const border = '─'.repeat(Math.max(header.length, content.length) + 4);

    return `
┌${border}┐
│ ${header.padEnd(border.length - 2)} │
│ ${quality} │ ${confDisplay} │
├${border}┤
│ ${content.split('\n').map(line => line.padEnd(border.length - 2)).join(' │\n│ ')} │
└${border}┘`;
  }

  public processAdvancedThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

      // Auto-adjust total thoughts if needed
      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      // Store in memory if session provided
      if (validatedInput.session_id) {
        const nodeId = this.memory.addNode(
          validatedInput.thought, 
          'thought', 
          {
            confidence: validatedInput.confidence,
            reasoning_quality: validatedInput.reasoning_quality,
            thoughtNumber: validatedInput.thoughtNumber,
            hypothesis: validatedInput.hypothesis
          }
        );

        // Update session context
        this.memory.updateSession(validatedInput.session_id, {
          currentFocus: validatedInput.thought,
          confidence: validatedInput.confidence,
          reasoning_quality: validatedInput.reasoning_quality,
          meta_assessment: validatedInput.meta_thought
        });
      }

      // Add to history
      this.thoughtHistory.push(validatedInput);

      // Handle branching
      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      // Format and log
      if (!this.disableLogging) {
        const formattedThought = this.formatAdvancedThought(validatedInput);
        console.error(formattedThought);
      }

      // Generate related memories if session provided
      let relatedMemories: MemoryNode[] = [];
      if (validatedInput.session_id) {
        relatedMemories = this.memory.queryRelated(validatedInput.thought, 3);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber: validatedInput.thoughtNumber,
            totalThoughts: validatedInput.totalThoughts,
            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
            confidence: validatedInput.confidence,
            reasoning_quality: validatedInput.reasoning_quality,
            meta_assessment: validatedInput.meta_thought,
            hypothesis: validatedInput.hypothesis,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length,
            memoryStats: this.memory.getMemoryStats(),
            relatedMemories: relatedMemories.map(m => ({ content: m.content, confidence: m.confidence }))
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public createReasoningSession(goal: string): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const sessionId = this.memory.createSession(goal);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sessionId,
            goal,
            status: 'created',
            message: 'Reasoning session created successfully'
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  public queryMemory(sessionId: string, query: string): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const relatedNodes = this.memory.queryRelated(query, 10);
      const session = this.memory.getSession(sessionId);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            sessionContext: session,
            relatedMemories: relatedNodes.map(node => ({
              content: node.content,
              type: node.type,
              confidence: node.confidence,
              connections: node.connections.length
            })),
            memoryStats: this.memory.getMemoryStats()
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}

// ===== TOOLS DEFINITION =====

const ADVANCED_REASONING_TOOL: Tool = {
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

const CREATE_SESSION_TOOL: Tool = {
  name: "create_reasoning_session",
  description: `Create a new reasoning session for focused problem-solving with integrated memory tracking.

Sessions provide:
- Persistent context across multiple reasoning steps
- Memory integration for building on previous insights
- Goal tracking and progress monitoring
- Confidence and quality assessment over time

Parameters:
- goal: The main objective or problem to solve (required)

Returns a session ID for use in advanced_reasoning calls.`,
  inputSchema: {
    type: "object",
    properties: {
      goal: { type: "string", description: "The main goal or problem to solve" }
    },
    required: ["goal"]
  }
};

const QUERY_MEMORY_TOOL: Tool = {
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

// ===== SERVER SETUP =====

const server = new Server(
  {
    name: "advanced-reasoning-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const reasoningServer = new AdvancedReasoningServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [ADVANCED_REASONING_TOOL, CREATE_SESSION_TOOL, QUERY_MEMORY_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "advanced_reasoning":
      return reasoningServer.processAdvancedThought(args);
    
    case "create_reasoning_session":
      return reasoningServer.createReasoningSession((args as { goal: string }).goal);
    
    case "query_reasoning_memory":
      const { session_id, query } = args as { session_id: string; query: string };
      return reasoningServer.queryMemory(session_id, query);
    
    default:
      return {
        content: [{
          type: "text",
          text: `Unknown tool: ${name}`
        }],
        isError: true
      };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Advanced Reasoning MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
