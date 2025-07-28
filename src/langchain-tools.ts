import {
  BaseLanguageModel,
  BaseLanguageModelInput,
} from "@langchain/core/language_models/base";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { modelInfo } from "./model-info.js";
import { Tool } from "./mcp.js";

export const LIST_LANGCHAIN_MODELS_TOOL: Tool = {
  name: "list_langchain_models",
  description: "List available models from a specified provider.",
  inputSchema: {
    type: "object",
    properties: {
      provider: {
        type: "string",
        description: "The provider to list models for (e.g., 'openai', 'anthropic').",
      },
    },
    required: ["provider"],
  },
};

export const GENERATE_LANGCHAIN_TEXT_TOOL: Tool = {
  name: "generate_langchain_text",
  description: "Generate text using a specified model and prompt.",
  inputSchema: {
    type: "object",
    properties: {
      provider: {
        type: "string",
        description: "The provider of the model to use.",
      },
      modelName: {
        type: "string",
        description: "The name of the model to use.",
      },
      prompt: {
        type: "string",
        description: "The prompt to generate text from.",
      },
      systemMessage: {
        type: "string",
        description: "An optional system message to set the context.",
      },
      apiKey: {
        type: "string",
        description: "The API key for the provider.",
      },
    },
    required: ["provider", "modelName", "prompt", "apiKey"],
  },
};

export class LangChainTools {
  private modelProviders: Record<string, new (options: any) => BaseLanguageModel> = {};

  constructor() {
    this.registerProvider("anthropic", "anthropic", "ChatAnthropic");
    this.registerProvider("openai", "openai", "ChatOpenAI");
    this.registerProvider("google", "google", "ChatGoogleGenerativeAI");
  }

  private async registerProvider(providerName: string, moduleName: string, modelClassName: string) {
    try {
      const module = await import(`@langchain/community/chat_models/${moduleName}`);
      this.modelProviders[providerName] = module[modelClassName];
      console.log(`Successfully registered provider: ${providerName}`);
    } catch (error) {
      console.error(`Failed to register provider: ${providerName}`, error);
    }
  }

  // A function to get the available models for a provider
  async listModels(provider: string): Promise<string[]> {
    if (!this.modelProviders[provider]) {
      throw new Error(`Provider '${provider}' is not supported.`);
    }
    return Promise.resolve(modelInfo[provider] || []);
  }

  // A function to get the available providers
  async getProviders(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.modelProviders));
  }

  // A function to generate text using a specified model
  async generateText(
    provider: string,
    modelName: string,
    prompt: string,
    systemMessage?: string,
    apiKey?: string
  ): Promise<string> {
    if (!this.modelProviders[provider]) {
      throw new Error(`Provider '${provider}' is not supported.`);
    }

    const modelClass = this.modelProviders[provider];
    const model = new modelClass({ modelName, apiKey });

    const messages = [];
    if (systemMessage) {
      messages.push(new SystemMessage(systemMessage));
    }
    messages.push(new HumanMessage(prompt));

    const result = await model.invoke(messages);
    return result.content as string;
  }
}
