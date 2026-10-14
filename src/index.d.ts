export type Model = "default" | "deepseek/deepseek-v4.1-flash";
export type Format = "step" | "dxf" | "skp" | "glb" | "dae" | "obj" | "stl" | "3mf" | "png";
export interface RequestOptions { signal?: AbortSignal }
export interface OperationOptions extends RequestOptions { idempotencyKey: string }
export interface PollOptions extends RequestOptions { intervalMs?: number; timeoutMs?: number }
export interface GenerationInput { prompt: string; model?: Model; imageFileIds?: string[]; cadFileIds?: string[]; unitSystem?: "metric" | "imperial"; executionMode?: "autonomous" | "interactive" }
export interface Generation { id: string; model: Model; status: "accepted" | "running" | "awaiting_input" | "paused" | "completed" | "failed" | "cancelled"; revision: number; usage: { billedCredits: number; toolCalls: number }; pauseReason: string | null; error: { code: string; message: string } | null; files: string[]; output: string; questions: unknown[]; planReviews: unknown[]; assumptions: unknown[] }
export interface Artifact { id: string; format: Format; status: "completed" | "failed"; filename: string; mimeType: string; bytes: number; error?: string | null; downloadUrl: string | null }
export interface ExportResult { id: string; generationId: string; revision: number; status: "accepted" | "running" | "completed" | "failed" | "expired"; expiresAt: number; artifacts: Artifact[]; error?: string | null }
export interface Upload { id: string; bytes: number; [key: string]: unknown }
export class Prompt2CADError extends Error { status: number; code?: string; requestId?: string | null; retryAfter: string | null }
export class Prompt2CAD {
  constructor(options: { apiKey: string; baseUrl?: string; fetch?: typeof fetch });
  getUsage(options?: RequestOptions): Promise<{ balanceCredits: number; consumedCredits: number; creditedCredits: number; limits: Record<string, number> }>;
  createProject(input: { name?: string }, options: OperationOptions): Promise<{ id: string; name: string }>;
  getProject(projectId: string, options?: RequestOptions): Promise<{ id: string; name: string; createdAt: string; generations: unknown[] }>;
  deleteProject(projectId: string, options?: RequestOptions): Promise<void>;
  generate(projectId: string, input: GenerationInput, options: OperationOptions): Promise<Generation>;
  getGeneration(projectId: string, generationId: string, options?: RequestOptions): Promise<Generation>;
  cancelGeneration(projectId: string, generationId: string, options?: RequestOptions): Promise<Generation>;
  resumeGeneration(projectId: string, generationId: string, options: OperationOptions): Promise<Generation>;
  answerQuestions(projectId: string, generationId: string, input: { toolCallId: string; answers: Array<{ id: string; value: string | number | boolean }> }, options?: RequestOptions): Promise<Generation>;
  approvePlan(projectId: string, generationId: string, input: { toolCallId: string; approved: boolean; feedback?: string }, options?: RequestOptions): Promise<Generation>;
  uploadCadFile(bytes: Uint8Array | ArrayBuffer | Blob, options: RequestOptions & { fileName: string; units?: "mm" | "cm" | "m" | "in" | "ft" }): Promise<Upload>;
  uploadImage(bytes: Uint8Array | ArrayBuffer | Blob, options: RequestOptions & { mimeType: "image/jpeg" | "image/png" | "image/webp" }): Promise<Upload>;
  exportModel(projectId: string, input: { generationId: string; formats: Format[]; fileId?: string }, options: OperationOptions): Promise<ExportResult>;
  getExport(projectId: string, exportId: string, options?: RequestOptions): Promise<ExportResult>;
  waitForGeneration(projectId: string, generationId: string, options?: PollOptions): Promise<Generation>;
  waitForExport(projectId: string, exportId: string, options?: PollOptions): Promise<ExportResult>;
  downloadArtifact(downloadUrl: string, options?: RequestOptions): Promise<Uint8Array>;
}
