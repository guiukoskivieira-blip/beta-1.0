import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * ARTECHECK AI — Camada Isolada de Cliente Supabase (Etapa 10)
 * 
 * Responsabilidades:
 * - Inicializar o cliente com as credenciais públicas (Anon Key);
 * - Validar a disponibilidade de configuração;
 * - Manter total isolamento do Core Preflight.
 */

const getEnvVar = (key: string): string => {
  try {
    const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
    if (metaEnv) {
      if (key === 'VITE_SUPABASE_URL' && metaEnv.VITE_SUPABASE_URL) {
        return metaEnv.VITE_SUPABASE_URL;
      }
      if (key === 'VITE_SUPABASE_ANON_KEY' && metaEnv.VITE_SUPABASE_ANON_KEY) {
        return metaEnv.VITE_SUPABASE_ANON_KEY;
      }
      if (metaEnv[key]) {
        return metaEnv[key];
      }
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || '';
    }
  } catch {
    // Ignore environment resolution errors
  }
  return '';
};

const rawUrl = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL');
const rawKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_ANON_KEY');

const sanitizeSupabaseUrl = (url: string): string => {
  let cleaned = url.replace(/^[=\s]+/, '').trim();
  // Se o usuário colou com /rest/v1 ou barra final, ajusta para a raiz da API Supabase
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned;
};

const supabaseUrl = sanitizeSupabaseUrl(rawUrl);
const supabaseAnonKey = rawKey.replace(/^[=\s]+/, '').trim();

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl.trim() !== '' && 
    supabaseAnonKey.trim() !== '' &&
    supabaseUrl.startsWith('http')
  );
};

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return clientInstance;
}

export const supabase = getSupabaseClient();
