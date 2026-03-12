# Advanced Reasoning MCP Server

An elegant, self-contained MCP server that builds on the sequential thinking pattern with advanced cognitive capabilities including meta-reasoning, hypothesis testing, integrated memory libraries, and structured data storage.

## 🧠 Features

- **Meta-Cognitive Assessment**: Confidence tracking and reasoning quality evaluation
- **Hypothesis Testing**: Systematic formulation, testing, and validation of hypotheses
- **Integrated Memory Libraries**: Graph-based memory with named library management for different contexts
- **SystemJSON Storage**: Structured data storage for workflows, instructions, and domain-specific knowledge
- **Enhanced Visualization**: Rich console output with confidence bars and quality indicators

## 🚀 Quick Start

### Installation

```bash
cd /advanced-reasoning-mcp
npm install
npm run build
```

### Usage

### MCP Client Integration

Add to your MCP client configuration:
For Claude replace command: node with your path ie /home/<your-username>/.nvm/versions/node/<your-version>/bin/node`:

```json
{
  "mcpServers": {
    "advanced-reasoning": {
      "command": "node",
      "args": ["/path-to/advanced-reasoning-mcp/build/index.js"]
    }
  }
}
```

## 🔧 Tools

### Core Reasoning

#### `advanced_reasoning`

Enhanced reasoning with cognitive features:

- All sequential thinking capabilities (branching, revisions, dynamic thought counts)
- **Confidence tracking** (0.0-1.0)
- **Reasoning quality assessment** (low/medium/high)
- **Meta-cognitive reflection**
- **Hypothesis formulation and testing**
- **Evidence tracking and validation**
- **Memory integration** with session context

#### `query_reasoning_memory`

Search integrated memory:

- Find related insights and hypotheses
- Discover connections between ideas
- Build on previous reasoning sessions
- Context-aware memory retrieval

### Memory Library Management

#### `create_memory_library`

Create named memory libraries for organized knowledge:

- Separate libraries for different projects/domains
- Clean architectural separation
- Library name validation

#### `list_memory_libraries`

List all available memory libraries:

- Shows library metadata (name, size, last modified)
- Organized, searchable library information

#### `switch_memory_library`

Switch between different memory libraries:

- Maintains session state during switches
- Context-aware library management

#### `get_current_library_info`

Get information about currently active library:

- Current library name and statistics
- Node count and session information

### SystemJSON Structured Storage

#### `create_system_json`

Create structured data storage for workflows and instructions:

- Domain categorization
- Searchable content with tags
- JSON-serializable data storage
- Atomic write operations with validation

#### `get_system_json`

Retrieve structured data by name:

- Complete data retrieval with metadata
- Timestamp and modification tracking

#### `search_system_json`

Search through structured data:

- Relevance scoring and ranking
- Multi-field search capability

#### `list_system_json`

List all available structured data files:

- Organized by domain and description
- Complete metadata overview

## 📝 Example Usage

### Basic Advanced Reasoning

```typescript
// Create a new memory library for this project
const library = await callTool("create_memory_library", {
  library_name: "database_optimization",
});

// Advanced reasoning with meta-cognition (no session creation needed)
const result = await callTool("advanced_reasoning", {
  thought: "I need to analyze the query execution plan first",
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true,
  confidence: 0.8,
  reasoning_quality: "high",
  meta_thought: "This is a logical first step, high confidence approach",
  goal: "Optimize database query performance",
});
```

### Hypothesis Testing

```typescript
const result = await callTool("advanced_reasoning", {
  thought: "The bottleneck appears to be in the JOIN operations",
  thoughtNumber: 2,
  totalThoughts: 5,
  nextThoughtNeeded: true,
  confidence: 0.6,
  reasoning_quality: "medium",
  meta_thought: "Need to verify this with actual data",
  hypothesis: "JOIN operations are causing 80% of query time",
  test_plan: "Run EXPLAIN ANALYZE and check execution times",
});
```

### Memory Integration

```typescript
// Query related memories (no session_id needed)
const memories = await callTool("query_reasoning_memory", {
  query: "database optimization techniques",
});
```

### SystemJSON Usage

```typescript
// Store a workflow for reuse
const workflow = await callTool("create_system_json", {
  name: "api_testing_workflow",
  domain: "software_development",
  description: "Complete API testing methodology",
  data: {
    phases: ["setup", "unit_tests", "integration_tests", "performance_tests"],
    tools: ["jest", "supertest", "newman"],
    checklist: ["auth validation", "error handling", "rate limiting"],
  },
  tags: ["testing", "api", "workflow"],
});

// Retrieve the workflow later
const storedWorkflow = await callTool("get_system_json", {
  name: "api_testing_workflow",
});
```

## 🏗️ Architecture

Built on proven sequential thinking with dual storage systems:

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Interface                            │
├─────────────────────────────────────────────────────────────┤
│                Advanced Reasoning Server                    │
│                                                             │
│  ┌──────────────────┐              ┌──────────────────┐     │
│  │   CognitiveMemory │              │    SystemJSON    │     │
│  │   (Graph-Based)   │              │ (Document-Based) │     │
│  │                  │              │                  │     │
│  │ • Named Libraries │              │ • Domain-Indexed │     │
│  │ • Session Context │              │ • Searchable     │     │
│  │ • Node Relations  │              │ • Tagged Content │     │
│  │ • Hypothesis      │              │ • Workflows      │     │
│  │   Tracking        │              │ • Instructions   │     │
│  └──────────────────┘              └──────────────────┘     │
│           │                                  │               │
│  ┌──────────────────┐              ┌──────────────────┐     │
│  │  Meta-Cognitive  │              │   Enhanced       │     │
│  │   Assessment     │              │  Sequential      │     │
│  │                  │              │   Thinking       │     │
│  │ • Confidence     │              │                  │     │
│  │ • Quality Rating │              │ • Branching      │     │
│  │ • Evidence       │              │ • Revisions      │     │
│  │ • Hypothesis     │              │ • Dynamic Counts │     │
│  │   Testing        │              │ • Meta-Thoughts  │     │
│  └──────────────────┘              └──────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Advanced Features

### Meta-Cognitive Assessment

- **Confidence Tracking**: Self-assessment of reasoning certainty (0.0-1.0)
- **Quality Evaluation**: Low/medium/high reasoning quality indicators
- **Meta-Thoughts**: Reflection on the reasoning process itself
- **Evidence Integration**: Systematic collection and validation

### Hypothesis Testing Framework

- **Hypothesis Formulation**: Explicit statement of working theories
- **Test Planning**: Define validation/refutation strategies
- **Evidence Tracking**: Collect supporting/contradicting evidence
- **Result Integration**: Incorporate test outcomes into reasoning

### Dual Storage Architecture

#### CognitiveMemory (Graph-Based)

- **Named Libraries**: Separate contexts for different projects
- **Graph Storage**: Connected thoughts, hypotheses, evidence
- **Session Management**: Persistent reasoning contexts
- **Memory Queries**: Find relevant insights across sessions
- **Storage**: `memory_data/{library_name}.json`

#### SystemJSON (Document-Based)

- **Structured Storage**: JSON-serializable workflows and instructions
- **Domain Organization**: Categorized by domain/purpose
- **Search & Discovery**: Full-text search with relevance scoring
- **Tag System**: Flexible content organization
- **Storage**: `memory_data/system_json/{name}.json`

### Enhanced Visualization

- **Confidence Bars**: Visual certainty representation
- **Quality Indicators**: Color-coded reasoning assessment
- **Rich Formatting**: Clear structure for complex reasoning
- **Meta-Information**: Display confidence, quality, connections

## 🔄 Compatibility

Fully compatible with sequential thinking patterns:

- All branching and revision capabilities preserved
- Dynamic thought count adjustment supported
- Familiar parameter structure with optional enhancements
- Backward compatible with existing sequential thinking workflows

## 📊 Benefits Over Sequential Thinking

- **Self-Awareness**: Track confidence and reasoning quality
- **Systematic Validation**: Explicit hypothesis testing framework
- **Organized Memory**: Named libraries for different contexts
- **Structured Storage**: Workflows and instructions as searchable data
- **Enhanced Clarity**: Rich visualization of reasoning process
- **Progress Tracking**: Monitor advancement toward defined goals
- **Evidence-Based**: Systematic collection and evaluation of evidence

## 🗂️ File Structure

```
memory_data/
├── cognitive_memory.json      # Default reasoning library
├── {library_name}.json        # Named reasoning libraries
└── system_json/              # Structured data storage
    ├── {workflow_name}.json  # Workflow definitions
    ├── {instruction_set}.json # Instruction sets
    └── {domain_data}.json    # Domain-specific data
```

## 📚 Use Cases

### Memory Libraries

- **Project-specific reasoning**: Separate libraries per project
- **Domain expertise**: Different libraries for different knowledge domains
- **Context switching**: Clean separation between reasoning contexts

### SystemJSON Storage

- **Workflow documentation**: Store reusable process definitions
- **Instruction sets**: Step-by-step procedures and guidelines
- **Domain knowledge**: Structured information for specific fields
- **Configuration data**: Settings and parameters for different scenarios

This server transforms sequential thinking into a sophisticated dual-storage cognitive reasoning system, providing both graph-based memory for reasoning sessions and structured document storage for workflows and instructions, while maintaining the elegant simplicity that made the original sequential thinking pattern so effective.

Made by angrysky56 (Ty Hall) and Claude

License- MIT
