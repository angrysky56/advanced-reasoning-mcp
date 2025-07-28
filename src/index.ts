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
import {
  LangChainTools,
  LIST_LANGCHAIN_MODELS_TOOL,
  GENERATE_LANGCHAIN_TEXT_TOOL,
} from "./langchain-tools.js";

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

// ===== SYSTEM JSON STORAGE =====
// SystemJSON provides structured data storage for workflows, instructions, and domain-specific data
// Storage: memory_data/system_json/{name}.json

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

class SystemJSON {
  private systemJsonPath: string;

  constructor() {
    const projectDir = path.dirname(new URL(import.meta.url).pathname);
    this.systemJsonPath = path.join(projectDir, '..', 'memory_data', 'system_json');
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.systemJsonPath, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize system JSON storage:', error);
    }
  }

  async createSystemJSON(
    name: string,
    domain: string,
    description: string,
    data: Record<string, unknown>,
    tags: string[] = []
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate name (alphanumeric, underscore, hyphen only)
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { success: false, message: 'Name must contain only letters, numbers, underscores, and hyphens' };
      }

      const fileName = `${name}.json`;
      const filePath = path.join(this.systemJsonPath, fileName);

      // Check if file already exists
      try {
        await fs.access(filePath);
        return { success: false, message: `System JSON "${name}" already exists` };
      } catch {
        // File doesn't exist, which is what we want
      }

      // Create searchable content from data
      const searchable_content = this.createSearchableContent(data, description, tags);

      const systemData: SystemJSONData = {
        name,
        domain,
        description,
        data,
        searchable_content,
        tags,
        created: Date.now(),
        modified: Date.now()
      };

      // Atomic write
      const tempPath = path.join(this.systemJsonPath, `${fileName}.tmp`);
      const jsonContent = JSON.stringify(systemData, null, 2);
      await fs.writeFile(tempPath, jsonContent, 'utf-8');

      // Validate JSON before committing
      try {
        JSON.parse(jsonContent);
        await fs.rename(tempPath, filePath);
      } catch (parseError) {
        await fs.unlink(tempPath).catch(() => {});
        throw new Error(`JSON validation failed: ${parseError}`);
      }

      return { success: true, message: `Created system JSON: ${name}` };
    } catch (error) {
      return { success: false, message: `Failed to create system JSON: ${error}` };
    }
  }

  async getSystemJSON(name: string): Promise<{ success: boolean; data?: SystemJSONData; message: string }> {
    try {
      const fileName = `${name}.json`;
      const filePath = path.join(this.systemJsonPath, fileName);

      const jsonContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(jsonContent) as SystemJSONData;

      return { success: true, data, message: `Retrieved system JSON: ${name}` };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: false, message: `System JSON "${name}" not found` };
      }
      return { success: false, message: `Failed to retrieve system JSON: ${error}` };
    }
  }

  async searchSystemJSON(query: string): Promise<{ results: Array<{ name: string; score: number; data: SystemJSONData }> }> {
    try {
      const files = await fs.readdir(this.systemJsonPath);
      const results: Array<{ name: string; score: number; data: SystemJSONData }> = [];

      for (const file of files) {
        if (file.endsWith('.json') && !file.endsWith('.tmp')) {
          try {
            const filePath = path.join(this.systemJsonPath, file);
            const jsonContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(jsonContent) as SystemJSONData;

            const score = this.calculateSearchScore(query, data);
            if (score > 0.1) {
              results.push({ name: data.name, score, data });
            }
          } catch (error) {
            // Skip corrupted files
            console.error(`Skipping corrupted system JSON file: ${file}`, error);
          }
        }
      }

      return { results: results.sort((a, b) => b.score - a.score) };
    } catch (error) {
      console.error('Failed to search system JSON:', error);
      return { results: [] };
    }
  }

  async listSystemJSON(): Promise<{ files: Array<{ name: string; domain: string; description: string }> }> {
    try {
      const files = await fs.readdir(this.systemJsonPath);
      const systemFiles = [];

      for (const file of files) {
        if (file.endsWith('.json') && !file.endsWith('.tmp')) {
          try {
            const filePath = path.join(this.systemJsonPath, file);
            const jsonContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(jsonContent) as SystemJSONData;

            systemFiles.push({
              name: data.name,
              domain: data.domain,
              description: data.description
            });
          } catch (error) {
            // Skip corrupted files
            console.error(`Skipping corrupted system JSON file: ${file}`, error);
          }
        }
      }

      return { files: systemFiles.sort((a, b) => a.name.localeCompare(b.name)) };
    } catch (error) {
      console.error('Failed to list system JSON files:', error);
      return { files: [] };
    }
  }

  private createSearchableContent(data: Record<string, unknown>, description: string, tags: string[]): string {
    const dataString = JSON.stringify(data, null, 2);
    return `${description} ${tags.join(' ')} ${dataString}`.toLowerCase();
  }

  private calculateSearchScore(query: string, data: SystemJSONData): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = data.searchable_content.split(/\s+/);
    const commonWords = queryWords.filter(word => contentWords.includes(word));
    return commonWords.length / Math.max(queryWords.length, 1);
  }
}

// ===== INTEGRATED GRAPH MEMORY WITH PERSISTENCE =====
// Memory data is stored in: {project}/memory_data/{library_name}.json
// Automatically saves on node/session creation and loads on startup

class CognitiveMemory {
  private nodes: Map<string, MemoryNode> = new Map();
  private sessions: Map<string, ReasoningContext> = new Map();
  private memoryDataPath: string;
  private currentLibraryName: string = 'cognitive_memory'; // Default library name

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
        timestamp: Date.now(),
        libraryName: this.currentLibraryName
      };
      
      const fileName = `${this.currentLibraryName}.json`;
      const filePath = path.join(this.memoryDataPath, fileName);
      const tempPath = path.join(this.memoryDataPath, `${fileName}.tmp`);
      
      // Atomic write: write to temp file first, then rename
      const jsonContent = JSON.stringify(memoryState, null, 2);
      await fs.writeFile(tempPath, jsonContent, 'utf-8');
      
      // Validate JSON before committing
      try {
        JSON.parse(jsonContent);
        await fs.rename(tempPath, filePath);
      } catch (parseError) {
        await fs.unlink(tempPath).catch(() => {}); // Clean up temp file
        throw new Error(`JSON validation failed: ${parseError}`);
      }
    } catch (error) {
      console.error('Failed to save memory to file:', error);
    }
  }

  private async loadFromFile(libraryName?: string): Promise<void> {
    try {
      const targetLibrary = libraryName || this.currentLibraryName;
      const fileName = `${targetLibrary}.json`;
      const filePath = path.join(this.memoryDataPath, fileName);
      
      const data = await fs.readFile(filePath, 'utf-8');
      
      // Validate JSON before parsing
      let memoryState;
      try {
        memoryState = JSON.parse(data);
      } catch (parseError) {
        throw new Error(`Invalid JSON in library ${targetLibrary}: ${parseError}`);
      }
      
      this.nodes = new Map(memoryState.nodes);
      this.sessions = new Map(memoryState.sessions);
      this.currentLibraryName = targetLibrary;
      
      console.error(`Loaded ${this.nodes.size} memory nodes and ${this.sessions.size} sessions from library: ${targetLibrary}`);
    } catch (error) {
      // File doesn't exist or is corrupted - start with empty memory
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to load memory from file:', error);
      }
    }
  }

  // === LIBRARY MANAGEMENT METHODS ===
  
  async createLibrary(libraryName: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate library name (alphanumeric, underscore, hyphen only)
      if (!/^[a-zA-Z0-9_-]+$/.test(libraryName)) {
        return { success: false, message: 'Library name must contain only letters, numbers, underscores, and hyphens' };
      }
      
      const fileName = `${libraryName}.json`;
      const filePath = path.join(this.memoryDataPath, fileName);
      
      // Check if library already exists
      try {
        await fs.access(filePath);
        return { success: false, message: `Library "${libraryName}" already exists` };
      } catch {
        // Library doesn't exist, which is what we want
      }
      
      // Save current state if we have data
      if (this.nodes.size > 0 || this.sessions.size > 0) {
        await this.saveToFile();
      }
      
      // Clear current memory and create new library
      this.nodes.clear();
      this.sessions.clear();
      this.currentLibraryName = libraryName;
      
      // Save empty library
      await this.saveToFile();
      
      return { success: true, message: `Created library: ${libraryName}` };
    } catch (error) {
      return { success: false, message: `Failed to create library: ${error}` };
    }
  }
  
  async listLibraries(): Promise<{ libraries: Array<{ name: string; size: number; lastModified: Date }> }> {
    try {
      const files = await fs.readdir(this.memoryDataPath);
      const libraries = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && !file.endsWith('.tmp')) {
          const filePath = path.join(this.memoryDataPath, file);
          const stats = await fs.stat(filePath);
          const libraryName = file.replace('.json', '');
          
          // Get library size (node count) by reading the file
          try {
            const data = await fs.readFile(filePath, 'utf-8');
            const memoryState = JSON.parse(data);
            const nodeCount = memoryState.nodes ? memoryState.nodes.length : 0;
            
            libraries.push({
              name: libraryName,
              size: nodeCount,
              lastModified: stats.mtime
            });
          } catch (error) {
            // Skip corrupted files
            console.error(`Skipping corrupted library file: ${file}`, error);
          }
        }
      }
      
      return { libraries: libraries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()) };
    } catch (error) {
      console.error('Failed to list libraries:', error);
      return { libraries: [] };
    }
  }
  
  async switchLibrary(libraryName: string): Promise<{ success: boolean; message: string }> {
    try {
      const fileName = `${libraryName}.json`;
      const filePath = path.join(this.memoryDataPath, fileName);
      
      // Check if library exists
      try {
        await fs.access(filePath);
      } catch {
        return { success: false, message: `Library "${libraryName}" does not exist` };
      }
      
      // Save current state if we have unsaved changes
      if (this.nodes.size > 0 || this.sessions.size > 0) {
        await this.saveToFile();
      }
      
      // Load the new library
      await this.loadFromFile(libraryName);
      
      return { success: true, message: `Switched to library: ${libraryName}` };
    } catch (error) {
      return { success: false, message: `Failed to switch library: ${error}` };
    }
  }
  
  getCurrentLibraryName(): string {
    return this.currentLibraryName;
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

  async createSession(goal: string, libraryName?: string): Promise<string> {
    // Switch to specified library if provided (now properly awaited)
    if (libraryName && libraryName !== this.currentLibraryName) {
      const switchResult = await this.switchLibrary(libraryName);
      if (!switchResult.success) {
        console.error(`Failed to switch to library ${libraryName}:`, switchResult.message);
        // Continue with current library rather than failing
      }
    }
    
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
    await this.saveToFile();
    
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
  private systemJson: SystemJSON = new SystemJSON();
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

  public async createLibrary(libraryName: string): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.memory.createLibrary(libraryName);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            libraryName,
            success: result.success,
            message: result.message,
            currentLibrary: this.memory.getCurrentLibraryName()
          }, null, 2)
        }],
        isError: !result.success
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

  public async listLibraries(): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.memory.listLibraries();
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            currentLibrary: this.memory.getCurrentLibraryName(),
            libraries: result.libraries,
            totalLibraries: result.libraries.length
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

  public async switchLibrary(libraryName: string): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.memory.switchLibrary(libraryName);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            libraryName,
            success: result.success,
            message: result.message,
            currentLibrary: this.memory.getCurrentLibraryName(),
            memoryStats: this.memory.getMemoryStats()
          }, null, 2)
        }],
        isError: !result.success
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

  public getCurrentLibraryInfo(): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            currentLibrary: this.memory.getCurrentLibraryName(),
            memoryStats: this.memory.getMemoryStats(),
            status: 'success'
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

  public async createSystemJSON(
    name: string,
    domain: string,
    description: string,
    data: Record<string, unknown>,
    tags: string[] = []
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.systemJson.createSystemJSON(name, domain, description, data, tags);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name,
            domain,
            description,
            success: result.success,
            message: result.message,
            tags,
            created: Date.now()
          }, null, 2)
        }],
        isError: !result.success
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

  public async getSystemJSON(name: string): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.systemJson.getSystemJSON(name);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name,
            success: result.success,
            message: result.message,
            data: result.data || null
          }, null, 2)
        }],
        isError: !result.success
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

  public async searchSystemJSON(query: string): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.systemJson.searchSystemJSON(query);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            results: result.results.map(r => ({
              name: r.name,
              score: r.score,
              domain: r.data.domain,
              description: r.data.description,
              tags: r.data.tags
            })),
            totalResults: result.results.length
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

  public async listSystemJSON(): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const result = await this.systemJson.listSystemJSON();
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            files: result.files,
            totalFiles: result.files.length,
            status: 'success'
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

const CREATE_LIBRARY_TOOL: Tool = {
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

const LIST_LIBRARIES_TOOL: Tool = {
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

const SWITCH_LIBRARY_TOOL: Tool = {
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

const GET_LIBRARY_INFO_TOOL: Tool = {
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

const CREATE_SYSTEM_JSON_TOOL: Tool = {
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

const GET_SYSTEM_JSON_TOOL: Tool = {
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

const SEARCH_SYSTEM_JSON_TOOL: Tool = {
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

const LIST_SYSTEM_JSON_TOOL: Tool = {
  name: "list_system_json",
  description: `List all available system JSON files.

Returns list of all system JSON files with their names, domains, and descriptions.`,
  inputSchema: {
    type: "object",
    properties: {},
    required: []
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

const langChainTools = new LangChainTools();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "advanced_reasoning":
      return reasoningServer.processAdvancedThought(args);
    
    case "query_reasoning_memory":
      const { session_id, query } = args as { session_id: string; query: string };
      return reasoningServer.queryMemory(session_id, query);
    
    case "create_memory_library":
      const { library_name: createLibName } = args as { library_name: string };
      return await reasoningServer.createLibrary(createLibName);
    
    case "list_memory_libraries":
      return await reasoningServer.listLibraries();
    
    case "switch_memory_library":
      const { library_name: switchLibName } = args as { library_name: string };
      return await reasoningServer.switchLibrary(switchLibName);
    
    case "get_current_library_info":
      return reasoningServer.getCurrentLibraryInfo();
    
    case "create_system_json":
      const { name: sysJsonName, domain, description, data, tags } = args as { 
        name: string; 
        domain: string; 
        description: string; 
        data: Record<string, unknown>; 
        tags?: string[] 
      };
      return await reasoningServer.createSystemJSON(sysJsonName, domain, description, data, tags);
    
    case "get_system_json":
      const { name: getSysJsonName } = args as { name: string };
      return await reasoningServer.getSystemJSON(getSysJsonName);
    
    case "search_system_json":
      const { query: searchQuery } = args as { query: string };
      return await reasoningServer.searchSystemJSON(searchQuery);
    
    case "list_system_json":
      return await reasoningServer.listSystemJSON();
    
    case "list_langchain_models":
      const { provider: listProvider } = args as { provider: string };
      const models = await langChainTools.listModels(listProvider);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(models, null, 2),
        }],
      };

    case "generate_langchain_text":
      const { provider: genProvider, modelName, prompt, systemMessage, apiKey } = args as {
        provider: string;
        modelName: string;
        prompt: string;
        systemMessage?: string;
        apiKey?: string;
      };
      const text = await langChainTools.generateText(
        genProvider,
        modelName,
        prompt,
        systemMessage,
        apiKey
      );
      return {
        content: [{
          type: "text",
          text,
        }],
      };

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
