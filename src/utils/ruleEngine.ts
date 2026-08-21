import {
  PdfDocumentStructure,
  RuleEvaluationResult,
  RuleEngineSummary,
  RuleReference,
} from '../types';
import {
  ProductionProfile,
  COMMERCIAL_PRINT_300DPI_PROFILE,
} from './productionProfiles';
import { calculateComplianceScore } from './scoreEngine';

export function runDeterministicRuleEngine(
  doc: PdfDocumentStructure,
  profile: ProductionProfile = COMMERCIAL_PRINT_300DPI_PROFILE
): RuleEngineSummary {
  const universalRules: RuleEvaluationResult[] = [];
  const profileRules: RuleEvaluationResult[] = [];

  // ==========================================================================
  // REGRAS UNIVERSAIS (5 REGRAS)
  // ==========================================================================

  // 1. RULE-STRUCT-001: Integridade Estrutural
  if (!doc || doc.pageCount === 0 || !Array.isArray(doc.pages) || doc.pages.length === 0) {
    universalRules.push({
      ruleId: 'RULE-STRUCT-001',
      title: 'Integridade Estrutural do Documento',
      category: 'universal',
      status: 'error',
      evidence: 'Documento vazio ou com 0 páginas legíveis na árvore de objetos.',
      explanation: 'O PDF não pôde ser interpretado ou não contém páginas válidas.',
      recommendation: 'Verifique se o arquivo foi corrompido durante a exportação ou transferência.',
      references: [{ objectType: 'structure', details: 'Árvore de páginas inexistente' }],
    });
  } else {
    universalRules.push({
      ruleId: 'RULE-STRUCT-001',
      title: 'Integridade Estrutural do Documento',
      category: 'universal',
      status: 'approved',
      evidence: `Estrutura válida com ${doc.pageCount} página(s) processada(s) com sucesso.`,
      explanation: 'A sintaxe do documento e o catálogo de objetos estão íntegros.',
      recommendation: 'Nenhuma ação necessária.',
      references: [{ objectType: 'structure', details: `${doc.pageCount} página(s) válidas` }],
    });
  }

  // 2. RULE-GEOM-001: Uniformidade Dimensional
  if (doc.pages && doc.pages.length > 1) {
    const firstPage = doc.pages[0];
    const differingPages = doc.pages.filter(
      (p) =>
        Math.abs(p.widthMm - firstPage.widthMm) > 0.8 ||
        Math.abs(p.heightMm - firstPage.heightMm) > 0.8
    );

    if (differingPages.length > 0) {
      universalRules.push({
        ruleId: 'RULE-GEOM-001',
        title: 'Uniformidade Dimensional das Páginas',
        category: 'universal',
        status: 'warning',
        evidence: `Páginas possuem dimensões heterogêneas (ex: Pág 1: ${firstPage.widthMm.toFixed(1)}x${firstPage.heightMm.toFixed(1)} mm vs outras páginas).`,
        explanation: 'Documentos impressos padronizados geralmente exigem que todas as páginas compartilhem do mesmo formato.',
        recommendation: 'Confirme se a variação de formato entre as páginas é intencional.',
        references: doc.pages.map((p) => ({
          page: p.page,
          objectType: 'page',
          details: `${p.widthMm.toFixed(1)} × ${p.heightMm.toFixed(1)} mm`,
        })),
      });
    } else {
      universalRules.push({
        ruleId: 'RULE-GEOM-001',
        title: 'Uniformidade Dimensional das Páginas',
        category: 'universal',
        status: 'approved',
        evidence: `Todas as ${doc.pages.length} páginas possuem dimensões uniformes (${firstPage.widthMm.toFixed(1)} × ${firstPage.heightMm.toFixed(1)} mm).`,
        explanation: 'Dimensões consistentes em todo o arquivo.',
        recommendation: 'Nenhuma ação necessária.',
      });
    }
  } else {
    universalRules.push({
      ruleId: 'RULE-GEOM-001',
      title: 'Uniformidade Dimensional das Páginas',
      category: 'universal',
      status: 'approved',
      evidence: doc.pages?.[0]
        ? `Página única com dimensões ${doc.pages[0].widthMm.toFixed(1)} × ${doc.pages[0].heightMm.toFixed(1)} mm.`
        : 'Página única.',
      explanation: 'Documento de página única.',
      recommendation: 'Nenhuma ação necessária.',
    });
  }

  // 3. RULE-FONT-001: Incorporação de Tipografia
  const fonts = doc.fonts || [];
  const usedFonts = fonts.filter((f) => f.isUsedInContent === true);
  const declaredUnusedFonts = fonts.filter((f) => f.isUsedInContent === false);
  const unembeddedUsed = usedFonts.filter(
    (f) => f.isEmbedded === 'no' || (f as any).isEmbedded === false
  );
  const undeterminedUsed = usedFonts.filter((f) => f.isEmbedded === 'undetermined');

  if (unembeddedUsed.length > 0) {
    universalRules.push({
      ruleId: 'RULE-FONT-001',
      title: 'Incorporação de Tipografia',
      category: 'universal',
      status: 'error',
      evidence: `Detectada(s) ${unembeddedUsed.length} fonte(s) utilizada(s) sem incorporação no arquivo: ${unembeddedUsed.map((f) => f.cleanFontName || f.baseFont || (f as any).fontName).join(', ')}.`,
      explanation: 'Fontes não incorporadas podem ser substituídas pelo RIP durante a impressão gerando refluxo de texto.',
      recommendation: 'Incorpore todas as fontes no momento da geração do PDF ou converta os textos em curvas/vetores.',
      references: unembeddedUsed.map((f) => {
        const pagesList = Array.isArray(f.usedPages)
          ? f.usedPages
          : Array.isArray((f as any).declaredPages)
          ? (f as any).declaredPages
          : [];
        const pagesText = pagesList.length > 0 ? pagesList.join(', ') : 'Todas';
        return {
          objectType: 'font',
          objectId: f.cleanFontName || f.baseFont || (f as any).fontName,
          details: `Subtype: ${f.subtype || 'Desconhecido'}, Páginas: ${pagesText}`,
        };
      }),
    });
  } else if (undeterminedUsed.length > 0) {
    universalRules.push({
      ruleId: 'RULE-FONT-001',
      title: 'Incorporação de Tipografia',
      category: 'universal',
      status: 'undetermined',
      evidence: `Não foi possível determinar com certeza a incorporação de ${undeterminedUsed.length} fonte(s) utilizada(s).`,
      explanation: 'Dicionários de fontes incompletos impedem a validação determinística de incorporação.',
      recommendation: 'Confirme as configurações de exportação de fontes no software gráfico.',
      references: undeterminedUsed.map((f) => ({
        objectType: 'font',
        objectId: f.cleanFontName || f.baseFont || (f as any).fontName,
        details: `Subtype: ${f.subtype || 'Desconhecido'}`,
      })),
    });
  } else {
    let approvedEvidence = '';
    if (usedFonts.length > 0) {
      approvedEvidence = `Todas as ${usedFonts.length} fonte(s) utilizadas estão 100% incorporadas ou em subconjunto (subset).`;
      if (declaredUnusedFonts.length > 0) {
        approvedEvidence += ` (${declaredUnusedFonts.length} recurso(s) de fonte declarado(s), mas não utilizado(s)).`;
      }
    } else if (declaredUnusedFonts.length > 0) {
      approvedEvidence = `Nenhum texto ativo utilizando fontes declaradas (${declaredUnusedFonts.length} recurso(s) de fonte declarado(s), mas não utilizado(s)).`;
    } else {
      approvedEvidence = 'Nenhum elemento tipográfico externo declarado ou fontes convertidas em curvas.';
    }

    universalRules.push({
      ruleId: 'RULE-FONT-001',
      title: 'Incorporação de Tipografia',
      category: 'universal',
      status: 'approved',
      evidence: approvedEvidence,
      explanation: 'Tipografia segura para reprodução gráfica.',
      recommendation: 'Nenhuma ação necessária.',
    });
  }

  // 4. RULE-DATA-001: Determinabilidade de Informações
  let hasIndeterminateData = false;
  if (doc.pages) {
    for (const p of doc.pages) {
      if (Number.isNaN(p.widthPt) || Number.isNaN(p.heightPt) || (p.widthMm === 0 && p.heightMm === 0)) {
        hasIndeterminateData = true;
        break;
      }
    }
  }

  if (hasIndeterminateData) {
    universalRules.push({
      ruleId: 'RULE-DATA-001',
      title: 'Determinabilidade de Informações Estruturais',
      category: 'universal',
      status: 'undetermined',
      evidence: 'Dimensões ou dados estruturais essenciais retornaram valores indefinidos ou indeterminados (NaN).',
      explanation: 'Não foi possível extrair com precisão matemática os limites de corte de uma ou mais páginas.',
      recommendation: 'Exporte o PDF novamente através de software gráfico padrão.',
    });
  } else {
    universalRules.push({
      ruleId: 'RULE-DATA-001',
      title: 'Determinabilidade de Informações Estruturais',
      category: 'universal',
      status: 'approved',
      evidence: 'Todas as grandezas geométricas, objetos e metadados foram extraídos de forma determinística.',
      explanation: 'Integridade numérica confirmada.',
      recommendation: 'Nenhuma ação necessária.',
    });
  }

  // 5. RULE-PDFX-001: Declaração PDF/X
  const pdfx = doc.pdfxInfo;
  const recommendsPdfX =
    profile.recommendsPdfX !== undefined
      ? profile.recommendsPdfX
      : profile.category === 'commercial_print' || profile.category === 'reference';

  if (pdfx && pdfx.isDeclaredPdfX) {
    const std = pdfx.declaredVersion || pdfx.declaredConformance || pdfx.recognizedStandard || 'PDF/X';
    universalRules.push({
      ruleId: 'RULE-PDFX-001',
      title: 'Declaração de Padrão Gráfico PDF/X',
      category: 'universal',
      status: 'approved',
      evidence: `O documento declara conformidade com a norma ${std}. Nota: A declaração indica a intenção do emissor e não constitui certificação ou validação normativa isolada.`,
      explanation: `Metadados identificam a intenção de pré-impressão ${std}.`,
      recommendation: 'Mantenha os padrões de fechamento com perfil ICC de intenção de saída.',
    });
  } else if (recommendsPdfX) {
    universalRules.push({
      ruleId: 'RULE-PDFX-001',
      title: 'Declaração de Padrão Gráfico PDF/X',
      category: 'universal',
      status: 'warning',
      evidence: 'O arquivo não possui declaração explícita de padrão PDF/X (GTS_PDFXVersion / GTS_PDFXConformance).',
      explanation: 'A ausência de PDF/X não impede a impressão, mas indica que o arquivo não passou por pré-fechamento normatizado.',
      recommendation: 'Recomenda-se exportar no formato PDF/X-1a:2001 ou PDF/X-4 para maior segurança na gráfica.',
    });
  } else {
    universalRules.push({
      ruleId: 'RULE-PDFX-001',
      title: 'Declaração de Padrão Gráfico PDF/X',
      category: 'universal',
      status: 'approved',
      evidence: 'Declaração PDF/X não exigida para este perfil de produção.',
      explanation: 'A ausência de declaração PDF/X é esperada e aceita neste segmento.',
      recommendation: 'Nenhuma ação necessária.',
    });
  }

  // ==========================================================================
  // REGRAS DO PERFIL DE PRODUÇÃO (4 REGRAS)
  // ==========================================================================

  // 6. RULE-PROF-DIM-001: Dimensões do Perfil
  if (
    profile.expectedWidthMm === undefined ||
    profile.expectedHeightMm === undefined ||
    Number.isNaN(profile.expectedWidthMm)
  ) {
    profileRules.push({
      ruleId: 'RULE-PROF-DIM-001',
      title: 'Dimensões Nominais do Perfil',
      category: 'profile_conditioned',
      status: 'approved',
      evidence: `O perfil "${profile.name}" permite dimensões livres. Nenhuma restrição dimensional imposta.`,
      explanation: 'Formato livre.',
      recommendation: 'Nenhuma ação necessária.',
    });
  } else {
    const expW = profile.expectedWidthMm;
    const expH = profile.expectedHeightMm;
    const tol = 1.5; // tolerância em mm

    const invalidPages = (doc.pages || []).filter((p) => {
      // Prioritize explicit TrimBox for finished format, fallback to page dimensions
      const tb = p.trimBox && p.trimBox.status === 'explicit' ? p.trimBox : null;
      const w = tb && typeof tb.widthMm === 'number' ? tb.widthMm : p.widthMm;
      const h = tb && typeof tb.heightMm === 'number' ? tb.heightMm : p.heightMm;
      const matchNormal = Math.abs(w - expW) <= tol && Math.abs(h - expH) <= tol;
      const matchRotated = Math.abs(w - expH) <= tol && Math.abs(h - expW) <= tol;
      return !matchNormal && !matchRotated;
    });

    if (invalidPages.length > 0) {
      profileRules.push({
        ruleId: 'RULE-PROF-DIM-001',
        title: 'Dimensões Nominais do Perfil',
        category: 'profile_conditioned',
        status: 'error',
        evidence: `Página(s) divergem das dimensões esperadas (${expW} × ${expH} mm). Encontrado: ${invalidPages.map((p) => `Pág ${p.page}: ${p.widthMm.toFixed(1)} × ${p.heightMm.toFixed(1)} mm`).join(', ')}.`,
        explanation: `O perfil "${profile.name}" exige o formato nominal de ${expW} × ${expH} mm.`,
        recommendation: `Ajuste o tamanho da prancheta para ${expW} × ${expH} mm antes de exportar.`,
        references: invalidPages.map((p) => ({
          page: p.page,
          objectType: 'page',
          details: `${p.widthMm.toFixed(1)} × ${p.heightMm.toFixed(1)} mm (Esperado: ${expW} × ${expH} mm)`,
        })),
      });
    } else {
      profileRules.push({
        ruleId: 'RULE-PROF-DIM-001',
        title: 'Dimensões Nominais do Perfil',
        category: 'profile_conditioned',
        status: 'approved',
        evidence: `Dimensões em total conformidade com o formato nominal de ${expW} × ${expH} mm.`,
        explanation: 'Dimensões validadas.',
        recommendation: 'Nenhuma ação necessária.',
      });
    }
  }

  // 7. RULE-PROF-DPI-001: Resolução Efetiva DPI
  const allImageOccurrences = (doc.pages || []).flatMap((p) => p.imageOccurrences || []);
  let hasCriticalDpi = false;
  let hasWarningDpi = false;
  const criticalOccurrences: RuleReference[] = [];
  const warningOccurrences: RuleReference[] = [];

  for (const occ of allImageOccurrences) {
    const dpiX = typeof occ.effectiveDpiX === 'number' ? occ.effectiveDpiX : 300;
    const dpiY = typeof occ.effectiveDpiY === 'number' ? occ.effectiveDpiY : 300;
    const minDpi = Math.min(dpiX, dpiY);

    if (minDpi < profile.warningDpiThreshold) {
      hasCriticalDpi = true;
      criticalOccurrences.push({
        page: occ.page,
        objectType: 'image',
        objectId: occ.id,
        details: `DPI Efetivo: ${minDpi.toFixed(1)} DPI (Mínimo exigido: ${profile.minEffectiveDpi} DPI, Limite crítico: ${profile.warningDpiThreshold} DPI)`,
      });
    } else if (minDpi < profile.minEffectiveDpi) {
      hasWarningDpi = true;
      warningOccurrences.push({
        page: occ.page,
        objectType: 'image',
        objectId: occ.id,
        details: `DPI Efetivo: ${minDpi.toFixed(1)} DPI (Recomendado: ${profile.minEffectiveDpi} DPI, Limite crítico: ${profile.warningDpiThreshold} DPI)`,
      });
    }
  }

  if (hasCriticalDpi) {
    profileRules.push({
      ruleId: 'RULE-PROF-DPI-001',
      title: 'Resolução Efetiva de Imagens (DPI)',
      category: 'profile_conditioned',
      status: 'error',
      evidence: `Detectada(s) imagem(ns) com resolução abaixo do limite crítico (< ${profile.warningDpiThreshold} DPI).`,
      explanation: `O perfil "${profile.name}" requer no mínimo ${profile.minEffectiveDpi} DPI. Resoluções abaixo de ${profile.warningDpiThreshold} DPI resultarão em pixelização visível na impressão.`,
      recommendation: 'Substitua as imagens em baixa resolução por arquivos originais em alta definição ou reduza o tamanho aplicado.',
      references: [...criticalOccurrences, ...warningOccurrences],
    });
  } else if (hasWarningDpi) {
    profileRules.push({
      ruleId: 'RULE-PROF-DPI-001',
      title: 'Resolução Efetiva de Imagens (DPI)',
      category: 'profile_conditioned',
      status: 'warning',
      evidence: `Imagens com resolução intermediária (entre ${profile.warningDpiThreshold} e ${profile.minEffectiveDpi} DPI).`,
      explanation: `O perfil "${profile.name}" recomenda resolução ideal de ${profile.minEffectiveDpi} DPI.`,
      recommendation: 'Avalie se a nitidez das imagens atende aos requisitos do cliente.',
      references: warningOccurrences,
    });
  } else {
    profileRules.push({
      ruleId: 'RULE-PROF-DPI-001',
      title: 'Resolução Efetiva de Imagens (DPI)',
      category: 'profile_conditioned',
      status: 'approved',
      evidence:
        allImageOccurrences.length > 0
          ? `Todas as ${allImageOccurrences.length} ocorrência(s) de imagens atendem ao mínimo de ${profile.minEffectiveDpi} DPI.`
          : 'Documento 100% vetorial / sem imagens raster aplicadas.',
      explanation: 'Resolução adequada.',
      recommendation: 'Nenhuma ação necessária.',
    });
  }

  // 8. RULE-PROF-CLR-001: Espaços de Cores Permitidos
  const colorSummary = doc.colorSummary || {
    hasRgb: false,
    hasCmyk: true,
    hasSpotColors: false,
    familiesDetected: [],
  };

  if (colorSummary.hasRgb) {
    if (profile.rgbPolicy === 'error') {
      const rgbRefs: RuleReference[] = [];
      for (const p of doc.pages || []) {
        const rgbOccs = (p.colorOccurrences || []).filter((c) => c.family === 'DeviceRGB');
        if (rgbOccs.length > 0) {
          rgbRefs.push({
            page: p.page,
            objectType: 'color',
            details: `${rgbOccs.length} objeto(s) em DeviceRGB`,
          });
        }
      }
      profileRules.push({
        ruleId: 'RULE-PROF-CLR-001',
        title: 'Espaços de Cores da Produção',
        category: 'profile_conditioned',
        status: 'error',
        evidence: 'Ocorrência de elementos em DeviceRGB detectada em perfil estritamente CMYK.',
        explanation: `O perfil "${profile.name}" não aceita RGB em processo comercial direto de 4 cores. Cores RGB serão convertidas no RIP podendo alterar saturação e contraste.`,
        recommendation: 'Converta todos os objetos e imagens para CMYK (ex: ISO Coated v2 / FOGRA39) antes de enviar.',
        references: rgbRefs.length > 0 ? rgbRefs : [{ objectType: 'color', details: 'Elementos RGB' }],
      });
    } else if (profile.rgbPolicy === 'warning') {
      profileRules.push({
        ruleId: 'RULE-PROF-CLR-001',
        title: 'Espaços de Cores da Produção',
        category: 'profile_conditioned',
        status: 'warning',
        evidence: 'Elementos em DeviceRGB detectados. O perfil aceita RGB com conversão automática no RIP.',
        explanation: `Para "${profile.name}", o RIP fará a gestão de cores para o gamut estendido da impressora.`,
        recommendation: 'Verifique se as cores RGB impressas atendem à fidelidade visual desejada.',
      });
    } else {
      profileRules.push({
        ruleId: 'RULE-PROF-CLR-001',
        title: 'Espaços de Cores da Produção',
        category: 'profile_conditioned',
        status: 'approved',
        evidence: 'Espaço de cores permitido pelo perfil de produção.',
        explanation: 'Cores compatíveis.',
        recommendation: 'Nenhuma ação necessária.',
      });
    }
  } else {
    profileRules.push({
      ruleId: 'RULE-PROF-CLR-001',
      title: 'Espaços de Cores da Produção',
      category: 'profile_conditioned',
      status: 'approved',
      evidence: 'Cores exclusivamente em CMYK, Tons de Cinza ou Cores Especiais (Spot/Separation/DeviceN).',
      explanation: 'Totalmente compatível com processo gráfico.',
      recommendation: 'Nenhuma ação necessária.',
    });
  }

  // 9. RULE-PROF-BLD-001: Sangria e Linhas de Corte
  if (profile.expectedBleedMm === undefined || profile.expectedBleedMm <= 0) {
    profileRules.push({
      ruleId: 'RULE-PROF-BLD-001',
      title: 'Sangria e Linhas de Corte',
      category: 'profile_conditioned',
      status: 'approved',
      evidence: `O perfil "${profile.name}" não requer sangria estrutural obrigatória.`,
      explanation: 'Sangria não exigida.',
      recommendation: 'Nenhuma ação necessária.',
    });
  } else {
    const requiredBleedMm = profile.expectedBleedMm;
    let hasMissingTrimBox = false;
    let insufficientBleedPages: RuleReference[] = [];

    for (const p of doc.pages || []) {
      if (!p.trimBox || p.trimBox.status !== 'explicit') {
        hasMissingTrimBox = true;
      } else {
        const tb = p.trimBox as any;
        const bb = p.bleedBox?.status === 'explicit' ? (p.bleedBox as any) : (p.mediaBox as any);

        if (bb && tb) {
          const leftBleedMm = (tb.xMm ?? 0) - (bb.xMm ?? 0);
          const bottomBleedMm = (tb.yMm ?? 0) - (bb.yMm ?? 0);
          const rightBleedMm = ((bb.xMm ?? 0) + (bb.widthMm ?? 0)) - ((tb.xMm ?? 0) + (tb.widthMm ?? 0));
          const topBleedMm = ((bb.yMm ?? 0) + (bb.heightMm ?? 0)) - ((tb.yMm ?? 0) + (tb.heightMm ?? 0));

          const minBleed = Math.min(leftBleedMm, bottomBleedMm, rightBleedMm, topBleedMm);
          if (minBleed < requiredBleedMm - 0.5) {
            insufficientBleedPages.push({
              page: p.page,
              objectType: 'bleed',
              details: `Sangria detectada: ${minBleed.toFixed(1)} mm (Exigido pelo perfil: ${requiredBleedMm.toFixed(1)} mm)`,
            });
          }
        }
      }
    }

    if (hasMissingTrimBox) {
      profileRules.push({
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria e Linhas de Corte',
        category: 'profile_conditioned',
        status: 'undetermined',
        evidence: 'O arquivo não possui caixas de corte (/TrimBox) explicitamente declaradas para aferição determinística da sangria.',
        explanation: 'Sem a /TrimBox, a sangria não pode ser calculada matematicamente sem inferência arbitrária.',
        recommendation: `Este perfil exige ${requiredBleedMm} mm de sangria. Exporte o PDF incluindo a caixa de corte (/TrimBox) e sangria de ${requiredBleedMm} mm nas opções de saída.`,
      });
    } else if (insufficientBleedPages.length > 0) {
      profileRules.push({
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria e Linhas de Corte',
        category: 'profile_conditioned',
        status: 'error',
        evidence: `Sangria insuficiente detectada em relação aos ${requiredBleedMm} mm exigidos pelo perfil.`,
        explanation: 'A ausência de sangria adequada pode ocasionar bordas brancas (filetes) após o corte na guilhotina.',
        recommendation: `Este perfil exige ${requiredBleedMm} mm de sangria. Estenda o fundo da arte em pelo menos ${requiredBleedMm} mm além da linha de corte (/TrimBox).`,
        references: insufficientBleedPages,
      });
    } else {
      profileRules.push({
        ruleId: 'RULE-PROF-BLD-001',
        title: 'Sangria e Linhas de Corte',
        category: 'profile_conditioned',
        status: 'approved',
        evidence: `Sangria de ${requiredBleedMm} mm devidamente configurada em todas as bordas (/TrimBox e /BleedBox).`,
        explanation: 'Sangria aprovada.',
        recommendation: 'Nenhuma ação necessária.',
      });
    }
  }

  // ==========================================================================
  // CONSOLIDAÇÃO DOS RESULTADOS
  // ==========================================================================
  const allResults = [...universalRules, ...profileRules];

  const approved = allResults.filter((r) => r.status === 'approved');
  const warning = allResults.filter((r) => r.status === 'warning');
  const error = allResults.filter((r) => r.status === 'error');
  const undetermined = allResults.filter((r) => r.status === 'undetermined');

  const scoreSummary = calculateComplianceScore(allResults);

  return {
    profileUsed: {
      id: profile.id,
      name: profile.name,
    },
    totalRules: allResults.length,
    approvedCount: approved.length,
    warningCount: warning.length,
    errorCount: error.length,
    undeterminedCount: undetermined.length,
    universalRules,
    profileRules,
    results: allResults,
    scoreSummary,
    grouped: {
      approved,
      warning,
      error,
      undetermined,
    },
  };
}
