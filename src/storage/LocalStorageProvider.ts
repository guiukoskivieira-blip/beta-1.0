import type { AnalysisRecordSummary, StoredProductionProfile, UsageRecord } from '../domain/beta';

export interface StorageProvider {
  saveAnalysis(analysis: AnalysisRecordSummary): Promise<void>;
  getAnalysis(id: string): Promise<AnalysisRecordSummary | null>;
  listAnalyses(): Promise<AnalysisRecordSummary[]>;
  deleteAnalysis(id: string): Promise<void>;
  getUsage(period: string): Promise<UsageRecord>;
  incrementUsage(period: string, bytesUploaded: number): Promise<UsageRecord>;
}

export class LocalStorageProvider implements StorageProvider {
  private analysesKey = 'artecheck_analyses_history';
  private usageKey = 'artecheck_usage_tracking';
  private inMemoryAnalyses: Map<string, AnalysisRecordSummary> = new Map();
  private inMemoryUsage: Map<string, UsageRecord> = new Map();

  private hasLocalStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  async saveAnalysis(analysis: AnalysisRecordSummary): Promise<void> {
    this.inMemoryAnalyses.set(analysis.id, analysis);
    if (this.hasLocalStorage()) {
      try {
        const list = await this.listAnalyses();
        const filtered = list.filter((a) => a.id !== analysis.id);
        filtered.unshift(analysis);
        localStorage.setItem(this.analysesKey, JSON.stringify(filtered.slice(0, 100)));
      } catch {}
    }
  }

  async getAnalysis(id: string): Promise<AnalysisRecordSummary | null> {
    if (this.inMemoryAnalyses.has(id)) {
      return this.inMemoryAnalyses.get(id) || null;
    }
    if (this.hasLocalStorage()) {
      try {
        const list = await this.listAnalyses();
        return list.find((a) => a.id === id) || null;
      } catch {}
    }
    return null;
  }

  async listAnalyses(): Promise<AnalysisRecordSummary[]> {
    if (this.hasLocalStorage()) {
      try {
        const raw = localStorage.getItem(this.analysesKey);
        return raw ? JSON.parse(raw) : [];
      } catch {}
    }
    return Array.from(this.inMemoryAnalyses.values());
  }

  async deleteAnalysis(id: string): Promise<void> {
    this.inMemoryAnalyses.delete(id);
    if (this.hasLocalStorage()) {
      try {
        const list = await this.listAnalyses();
        const filtered = list.filter((a) => a.id !== id);
        localStorage.setItem(this.analysesKey, JSON.stringify(filtered));
      } catch {}
    }
  }

  async getUsage(period: string): Promise<UsageRecord> {
    if (this.inMemoryUsage.has(period)) {
      return this.inMemoryUsage.get(period)!;
    }
    if (this.hasLocalStorage()) {
      try {
        const raw = localStorage.getItem(`${this.usageKey}_${period}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return { period, analyses: 0, bytesUploaded: 0 };
  }

  async incrementUsage(period: string, bytesUploaded: number): Promise<UsageRecord> {
    const current = await this.getUsage(period);
    const updated: UsageRecord = {
      period,
      analyses: current.analyses + 1,
      bytesUploaded: current.bytesUploaded + bytesUploaded,
    };
    this.inMemoryUsage.set(period, updated);
    if (this.hasLocalStorage()) {
      try {
        localStorage.setItem(`${this.usageKey}_${period}`, JSON.stringify(updated));
      } catch {}
    }
    return updated;
  }
}
