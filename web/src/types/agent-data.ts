export interface SourceFile {
  name: string;
  content: string;
}

export interface AgentVersion {
  id: string;
  loc: number;
  sourceFiles: SourceFile[];
}

export interface DocContent {
  version: string;
  locale: "zh" | "en";
  title: string;
  content: string;
}

export interface VersionIndex {
  versions: AgentVersion[];
}

export type SimStepType =
  | "user_message"
  | "assistant_text"
  | "tool_call"
  | "tool_result"
  | "system_event";

export interface SimStep {
  type: SimStepType;
  content: string;
  toolName?: string;
  toolInput?: string;
}

export interface Scenario {
  version: string;
  description: string;
  steps: SimStep[];
}

export interface ReferencePoint {
  concept: string;
  ourFile: string;
  ourLines: string;
  claudeCodeFile: string;
  claudeCodeConcept: string;
  difference: string;
  whyProduction: string;
}

export interface ReferenceMapping {
  title: string;
  points: ReferencePoint[];
}
