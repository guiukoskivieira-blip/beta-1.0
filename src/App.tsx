import React, { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UploadZone } from './components/UploadZone';
import { FileSelected } from './components/FileSelected';
import { ProcessingState } from './components/ProcessingState';
import { OperationalSummary } from './components/OperationalSummary';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { AiAssistant } from './components/AiAssistant';
import { AuthModal } from './components/AuthModal';
import { CustomProfilesModal } from './components/CustomProfilesModal';
import { HistoryModal } from './components/HistoryModal';
import { AboutBetaModal } from './components/AboutBetaModal';
import { PlansModal } from './components/PlansModal';
import { Footer } from './components/Footer';
import { JobCheckForm, EMPTY_SPEC } from './components/JobCheckForm';
import { JobCheckResults } from './components/JobCheckResults';
import { VisualPreview } from './components/VisualPreview';
import { FixEnginePanel } from './components/FixEnginePanel';
import { TrimBleedFixPanel } from './components/TrimBleedFixPanel';

import { STANDARD_PROFILES, COMMERCIAL_PRINT_300DPI_PROFILE, ProductionProfile } from './utils/productionProfiles';
import { runDeterministicRuleEngine } from './utils/ruleEngine';
import { runJobCheck, type JobCheckSpec, type JobCheckResult } from './services/jobCheck';
import { LocalStorageProvider } from './storage/LocalStorageProvider';
import type { BetaUser, StoredProductionProfile } from './domain/beta';
import type { PreflightAnalysis, PdfDocumentStructure } from './types';
import { uploadPdfForExtraction } from './services/api';

export const App: React.FC = () => {
  const [selectedProfile, setSelectedProfile] = useState<ProductionProfile>(COMMERCIAL_PRINT_300DPI_PROFILE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'uploading' | 'extracting' | 'analyzing' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<PreflightAnalysis | null>(null);

  // Job Check state
  const [jobCheckEnabled, setJobCheckEnabled] = useState(false);
  const [jobCheckSpec, setJobCheckSpec] = useState<JobCheckSpec>(EMPTY_SPEC);
  const [jobCheckResult, setJobCheckResult] = useState<JobCheckResult | null>(null);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfilesOpen, setIsProfilesOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPlansOpen, setIsPlansOpen] = useState(false);

  // User state
  const [currentUser, setCurrentUser] = useState<BetaUser | null>({
    id: 'local_dev_user',
    email: 'dev@artecheck.local',
    displayName: 'Engenheiro Gráfico',
    companyName: 'Gráfica Modelo',
    role: 'developer',
  });

  const storage = new LocalStorageProvider();

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setCurrentAnalysis(null);
    setJobCheckResult(null);
    setProcessingStatus('idle');
    setErrorMessage(null);
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) return;

    setProcessingStatus('uploading');
    setErrorMessage(null);

    try {
      // 1. Upload & Deterministic Structure Extraction on backend
      const result = await uploadPdfForExtraction(selectedFile);
      if (!result.success || !result.document) {
        throw new Error(result.error || 'Falha na extração dos dados estruturais do PDF.');
      }

      setProcessingStatus('analyzing');

      // 2. Evaluate deterministic preflight rules
      const ruleResults = runDeterministicRuleEngine(result.document, selectedProfile);

      const analysis: PreflightAnalysis = {
        id: result.analysisId || `analysis_${Date.now()}`,
        createdAt: Date.now(),
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        document: result.document,
        ruleResults,
        profileId: selectedProfile.id,
        diagnosticInfo: {
          extractionDurationMs: 40,
          evaluationDurationMs: 15,
        },
      };

      // 3. Save to lightweight local storage
      await storage.saveAnalysis({
        id: analysis.id,
        createdAt: analysis.createdAt,
        fileName: analysis.fileName,
        fileSizeBytes: analysis.fileSizeBytes,
        segmentName: selectedProfile.category,
        productName: selectedProfile.name,
        variantName: 'Padrão',
        productionProfileId: selectedProfile.id,
        status: ruleResults.scoreSummary.classification,
        score: ruleResults.scoreSummary.score,
        errorCount: ruleResults.errorCount,
        warningCount: ruleResults.warningCount,
        approvedCount: ruleResults.approvedCount,
      });

      setCurrentAnalysis(analysis);

      // Run Job Check if enabled with spec data
      if (jobCheckEnabled) {
        const jcResult = runJobCheck(jobCheckSpec, analysis);
        setJobCheckResult(jcResult);
      } else {
        setJobCheckResult(null);
      }

      setProcessingStatus('idle');
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setProcessingStatus('error');
      setErrorMessage(err.message || 'Erro inesperado ao analisar o documento.');
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setCurrentAnalysis(null);
    setJobCheckResult(null);
    setProcessingStatus('idle');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1018] text-[#F3F4F6]">
      <Header
        onReset={handleReset}
        canReset={Boolean(selectedFile || currentAnalysis)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onSignOut={() => setCurrentUser(null)}
        onOpenProfiles={() => setIsProfilesOpen(true)}
        onOpenPlans={() => setIsPlansOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <Sidebar
            selectedProfile={selectedProfile}
            onSelectProfile={(p) => {
              setSelectedProfile(p);
              if (currentAnalysis && currentAnalysis.document) {
                const updatedRules = runDeterministicRuleEngine(currentAnalysis.document, p);
                setCurrentAnalysis({
                  ...currentAnalysis,
                  profileId: p.id,
                  ruleResults: updatedRules,
                });
              }
            }}
          />

          <div className="flex-1 min-w-0">
            {processingStatus !== 'idle' ? (
              <ProcessingState
                status={processingStatus}
                errorMessage={errorMessage || undefined}
                onRetry={handleStartAnalysis}
              />
            ) : currentAnalysis ? (
              <div>
                <OperationalSummary analysis={currentAnalysis} />
                <VisualPreview analysis={currentAnalysis} profile={selectedProfile} />
                {jobCheckResult && (
                  <JobCheckResults
                    result={jobCheckResult}
                    spec={jobCheckSpec}
                    analysis={currentAnalysis}
                  />
                )}
                <FixEnginePanel analysis={currentAnalysis} />
                <TrimBleedFixPanel analysis={currentAnalysis} profile={selectedProfile} originalFile={selectedFile} />
                <DiagnosticPanel ruleResults={currentAnalysis.ruleResults} />
                <AiAssistant analysis={currentAnalysis} />
              </div>
            ) : selectedFile ? (
              <div>
                <JobCheckForm
                  enabled={jobCheckEnabled}
                  onToggle={setJobCheckEnabled}
                  spec={jobCheckSpec}
                  onSpecChange={setJobCheckSpec}
                />
                <FileSelected
                  file={selectedFile}
                  onClear={handleReset}
                  onAnalyze={handleStartAnalysis}
                />
              </div>
            ) : (
              <UploadZone onFileSelected={handleFileSelected} />
            )}
          </div>
        </div>
      </main>

      <Footer />

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => setCurrentUser(user)}
      />
      <CustomProfilesModal
        isOpen={isProfilesOpen}
        onClose={() => setIsProfilesOpen(false)}
        onSelectProfile={(p) => {
          const converted: ProductionProfile = {
            id: p.id,
            name: p.name,
            category: 'custom',
            description: 'Perfil personalizado configurado pelo usuário.',
            expectedWidthMm: p.rules.dimensions?.targetWidthMm,
            expectedHeightMm: p.rules.dimensions?.targetHeightMm,
            expectedBleedMm: p.rules.bleed?.requiredBleedMm,
            minEffectiveDpi: p.rules.dpi?.recommendedDpi || 300,
            warningDpiThreshold: p.rules.dpi?.criticalDpi || 200,
            rgbPolicy: p.rules.colors?.rgbPolicy || 'error',
          };
          setSelectedProfile(converted);
        }}
      />
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
      <AboutBetaModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
      <PlansModal
        isOpen={isPlansOpen}
        onClose={() => setIsPlansOpen(false)}
      />
    </div>
  );
};
export default App;
