import { UploadResponse, HealthResponse, AiAssistantResponse, AiGroundingContext } from '../types';
import { auth } from '../auth';
import { apiUrl } from '../config/api';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const session = await auth.getSession();
    if (session?.accessToken) {
      return { Authorization: `Bearer ${session.accessToken}` };
    }
  } catch {
    // Silently ignore auth header retrieval errors
  }
  return {};
}

export async function checkBackendHealth(): Promise<HealthResponse> {
  const res = await fetch(apiUrl('/api/health'));
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export const checkHealth = checkBackendHealth;

export async function uploadPdfFile(file: File, signal?: AbortSignal): Promise<UploadResponse> {
  const uploadUrl = apiUrl('/api/upload');
  const requestId = `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = performance.now();

  console.log(`[UPLOAD:${requestId}] URL: ${uploadUrl}`);
  console.log(`[UPLOAD:${requestId}] request started`);
  console.log(`[UPLOAD:${requestId}] file name: ${file.name}`);
  console.log(`[UPLOAD:${requestId}] file size: ${file.size} bytes`);
  console.log(`[UPLOAD:${requestId}] file type: ${file.type || 'unknown'}`);

  const formData = new FormData();
  formData.append('file', file);

  const authHeader = await getAuthHeader();

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      signal,
      headers: {
        'X-Request-ID': requestId,
        ...authHeader,
      },
      cache: 'no-store',
    });
  } catch (err: any) {
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    console.log(`[UPLOAD:${requestId}] fetch error after ${elapsedMs}ms`);
    console.log(`[UPLOAD:${requestId}] fetch error name: ${err?.name || 'Error'}`);
    console.log(`[UPLOAD:${requestId}] fetch error message: ${err?.message || String(err)}`);
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: 'O envio do arquivo foi cancelado antes da resposta do servidor.',
      };
    }
    return {
      success: false,
      error: `Falha de conexão com o servidor de pré-impressão (${err?.message || 'servidor indisponível'}).`,
    };
  }

  const elapsedToHeadersMs = Number((performance.now() - startedAt).toFixed(2));
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - response.url: ${res.url}`);
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - response.redirected: ${res.redirected}`);
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - status: ${res.status}`);
  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - content-type: ${res.headers.get('content-type') || 'unknown'}`);
  console.log(`[UPLOAD:${requestId}] server request id: ${res.headers.get('x-request-id') || 'not-provided'}`);

  let data: any;
  let rawText: string;
  try {
    rawText = await res.text();
  } catch (err: any) {
    return {
      success: false,
      error: `A resposta do servidor foi iniciada, mas não pôde ser lida (${err?.message || 'erro de transporte'}).`,
    };
  }

  console.log(`[UPLOAD:${requestId}] DIAGNOSTIC - body preview (first 300 chars): ${rawText.slice(0, 300)}`);
  console.log(`[UPLOAD:${requestId}] response text length: ${rawText.length}`);
  try {
    data = JSON.parse(rawText);
  } catch {
    const errorSummary = rawText.slice(0, 200);
    console.log(`[UPLOAD:${requestId}] non-JSON response preview: ${errorSummary}`);
    return {
      success: false,
      error: `Erro HTTP ${res.status}: Resposta não interpretável do servidor.`,
    };
  }

  if (!res.ok) {
    const errorSummary = JSON.stringify(data).slice(0, 200);
    console.log(`[UPLOAD:${requestId}] error response preview: ${errorSummary}`);
    return {
      success: false,
      error: data?.error || `Erro HTTP ${res.status}: Falha no processamento do arquivo.`,
    };
  }

  console.log(`[UPLOAD:${requestId}] completed in ${Number((performance.now() - startedAt).toFixed(2))}ms`);
  return data;
}

export const uploadPdfForAnalysis = uploadPdfFile;
export const uploadPdfForExtraction = uploadPdfFile;

export async function diagnosePdf(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const authHeader = await getAuthHeader();

  const res = await fetch(apiUrl('/api/diagnose'), {
    method: 'POST',
    body: formData,
    headers: {
      ...authHeader,
    },
  });

  return res.json();
}

export async function askPreflightAssistant(
  question: string,
  context: AiGroundingContext
): Promise<AiAssistantResponse> {
  const authHeader = await getAuthHeader();
  const res = await fetch(apiUrl('/api/assistant'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({ question, context }),
  });

  const data = await res.json();
  if (!res.ok && !data.error) {
    return {
      success: false,
      error: `Erro HTTP ${res.status} ao consultar assistente.`,
    };
  }
  return data;
}

export const askAiAssistant = askPreflightAssistant;

export interface TrimBleedFixApiResponse {
  success: boolean;
  eligible?: boolean;
  eligibility?: any;
  fixedPdfBase64?: string;
  fixedPdfSize?: number;
  audit?: any;
  structuralValidation?: {
    valid: boolean;
    checks: { header: boolean; eof: boolean; xrefOrTrailer: boolean; reparseable: boolean };
    message: string;
  };
  revalidation?: {
    ruleStatus: 'approved' | 'error' | 'warning' | 'undetermined';
    validated: boolean;
    message: string;
  };
  backendVersion?: string;
  serializationMode?: string;
  error?: string;
}

export async function applyTrimBleedFixViaApi(
  file: File,
  profileId: string
): Promise<TrimBleedFixApiResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('profileId', profileId);

  const authHeader = await getAuthHeader();

  const res = await fetch(apiUrl('/api/fix-trim-bleed'), {
    method: 'POST',
    body: formData,
    headers: {
      ...authHeader,
    },
  });

  const data = await res.json();
  return data as TrimBleedFixApiResponse;
}
