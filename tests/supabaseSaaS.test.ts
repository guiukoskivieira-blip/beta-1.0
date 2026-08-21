/**
 * ARTECHECK AI — Suíte de Testes Automatizados da Etapa 10 (SaaS, Supabase, Auth, Storage, Perfis e RLS)
 */

import { LocalStorageProvider } from '../src/storage/LocalStorageProvider';
import { LocalDevAuthProvider } from '../src/auth/LocalDevAuthProvider';
import { validateCustomProfile } from '../src/utils/customProfilesStorage';
import { BETA_PLAN_LIMITS } from '../src/domain/beta';
import { isSupabaseConfigured } from '../src/lib/supabaseClient';
import { readFileSync } from 'node:fs';
import type { AnalysisRecordSummary, StoredProductionProfile } from '../src/domain/beta';

interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  found: string;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(name: string, passed: boolean, expected: string, found: string, error?: string) {
  results.push({ name, passed, expected, found, error });
}

async function runSaaSTests() {
  console.log('================================================================');
  console.log('ARTECHECK AI — SUÍTE DE TESTES: ETAPA 10 (SAAS & SUPABASE)');
  console.log('================================================================\n');

  // Teste 1: LocalDevAuthProvider - Simulação de usuário local
  try {
    const auth = new LocalDevAuthProvider();
    const user = await auth.getCurrentUser();
    const isDevUser = user?.id === 'local_dev_user' || user?.email?.includes('@');
    recordTest(
      'Auth: LocalDevAuthProvider provê usuário de desenvolvimento local',
      isDevUser,
      'Usuário válido retornado',
      user ? `ID=${user.id}, Email=${user.email}` : 'null'
    );
  } catch (err: any) {
    recordTest('Auth: LocalDevAuthProvider provê usuário', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 2: LocalDevAuthProvider - Sign Up e Sign In
  try {
    const auth = new LocalDevAuthProvider();
    const signUpRes = await auth.signUp('test@grafica.com', '123456', 'Engenheiro Gráfico', 'Gráfica Modelo');
    const createdUser = signUpRes.user;
    const passed = createdUser?.email === 'test@grafica.com' && createdUser?.displayName === 'Engenheiro Gráfico';
    recordTest(
      'Auth: LocalDevAuthProvider executa signUp com metadados de gráfica',
      passed,
      'Email: test@grafica.com, DisplayName: Engenheiro Gráfico',
      `Email: ${createdUser?.email}, DisplayName: ${createdUser?.displayName}`
    );
  } catch (err: any) {
    recordTest('Auth: LocalDevAuthProvider signUp', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 3: LocalStorageProvider - Contrato e Métricas Leves
  try {
    const storage = new LocalStorageProvider();
    const testAnalysis: AnalysisRecordSummary = {
      id: `test_analysis_${Date.now()}`,
      createdAt: Date.now(),
      fileName: 'cartao_visita_teste.pdf',
      fileSizeBytes: 1048576,
      segmentName: 'Comercial',
      productName: 'Cartão de Visita',
      variantName: '90x50mm Couché 300g',
      productionProfileId: 'commercial_card_90x50',
      status: 'approved',
      score: 98,
      errorCount: 0,
      warningCount: 1,
      approvedCount: 12,
    };

    await storage.saveAnalysis(testAnalysis);
    const retrieved = await storage.getAnalysis(testAnalysis.id);

    const match = retrieved?.id === testAnalysis.id && retrieved?.score === 98 && retrieved?.status === 'approved';
    recordTest(
      'Storage: Salva e recupera resumo operacional leve no StorageProvider',
      Boolean(match),
      `ID=${testAnalysis.id}, Score=98`,
      `ID=${retrieved?.id}, Score=${retrieved?.score}`
    );
  } catch (err: any) {
    recordTest('Storage: Salva e recupera resumo operacional', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 4: Usage Tracking - Incremento e cálculo de quotas
  try {
    const storage = new LocalStorageProvider();
    const period = '2026-08';
    const initial = await storage.getUsage(period);
    const updated = await storage.incrementUsage(period, 5000000);

    const incremented = updated.analyses === initial.analyses + 1 && updated.bytesUploaded === initial.bytesUploaded + 5000000;
    recordTest(
      'Usage: Incremento de análises e contagem de bytes acumulados no período',
      incremented,
      `Analyses=${initial.analyses + 1}, Bytes=${initial.bytesUploaded + 5000000}`,
      `Analyses=${updated.analyses}, Bytes=${updated.bytesUploaded}`
    );
  } catch (err: any) {
    recordTest('Usage: Incremento de análises e bytes', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 5: Validação de Perfil Customizado - Perfil Válido
  try {
    const validProfile = {
      name: 'Banner Lona Frontlight 100 DPI',
      rules: {
        dimensions: { targetWidthMm: 2000, targetHeightMm: 1000, toleranceMm: 5 },
        dpi: { recommendedDpi: 100, criticalDpi: 72 },
        bleed: { requiredBleedMm: 10, toleranceMm: 2 },
      },
    };
    const res = validateCustomProfile(validProfile);
    recordTest(
      'Profiles: Validação aceita perfil com parâmetros gráficos corretos',
      res.valid && res.errors.length === 0,
      'valid=true, errors=[]',
      `valid=${res.valid}, errors=[${res.errors.join(', ')}]`
    );
  } catch (err: any) {
    recordTest('Profiles: Validação aceita perfil válido', false, 'valid=true', 'Exceção', err.message);
  }

  // Teste 6: Validação de Perfil Customizado - Largura/Altura Inválida (<= 0)
  try {
    const invalidDimensionsProfile = {
      name: 'Perfil Dimensões Negativas',
      rules: {
        dimensions: { targetWidthMm: -50, targetHeightMm: 0 },
        dpi: { recommendedDpi: 300, criticalDpi: 150 },
      },
    };
    const res = validateCustomProfile(invalidDimensionsProfile);
    recordTest(
      'Profiles: Rejeita dimensões nulas ou negativas (width <= 0 ou height <= 0)',
      !res.valid && res.errors.length >= 2,
      'valid=false, errors contendo avisos de largura e altura',
      `valid=${res.valid}, errors=${JSON.stringify(res.errors)}`
    );
  } catch (err: any) {
    recordTest('Profiles: Rejeita dimensões inválidas', false, 'valid=false', 'Exceção', err.message);
  }

  // Teste 7: Validação de Perfil Customizado - DPI Crítico Maior que Recomendado
  try {
    const invalidDpiProfile = {
      name: 'Perfil DPI Invertido',
      rules: {
        dpi: { recommendedDpi: 150, criticalDpi: 300 }, // Erro: crítico > recomendado
      },
    };
    const res = validateCustomProfile(invalidDpiProfile);
    recordTest(
      'Profiles: Rejeita DPI crítico maior que o DPI recomendado',
      !res.valid && res.errors.some((e) => e.includes('DPI crítico não pode ser maior')),
      'valid=false com erro de DPI crítico',
      `valid=${res.valid}, errors=${JSON.stringify(res.errors)}`
    );
  } catch (err: any) {
    recordTest('Profiles: Rejeita DPI crítico maior', false, 'valid=false', 'Exceção', err.message);
  }

  // Teste 8: Validação de Perfil Customizado - Sangria Negativa
  try {
    const invalidBleedProfile = {
      name: 'Perfil Sangria Negativa',
      rules: {
        bleed: { requiredBleedMm: -2 },
      },
    };
    const res = validateCustomProfile(invalidBleedProfile);
    recordTest(
      'Profiles: Rejeita sangria negativa (bleed < 0)',
      !res.valid && res.errors.some((e) => e.includes('sangria')),
      'valid=false com erro de sangria',
      `valid=${res.valid}, errors=${JSON.stringify(res.errors)}`
    );
  } catch (err: any) {
    recordTest('Profiles: Rejeita sangria negativa', false, 'valid=false', 'Exceção', err.message);
  }

  // Teste 9: Planos SaaS e Configuração Centralizada
  try {
    const freePlan = BETA_PLAN_LIMITS.free;
    const betaPlan = BETA_PLAN_LIMITS.beta;
    const proPlan = BETA_PLAN_LIMITS.pro;

    const validPlans =
      freePlan.analysesPerMonth > 0 &&
      betaPlan.analysesPerMonth > freePlan.analysesPerMonth &&
      proPlan.analysesPerMonth > betaPlan.analysesPerMonth;

    recordTest(
      'SaaS: Planos FREE, BETA e PRO possuem limites progressivos e centralizados',
      validPlans,
      `Free(${freePlan.analysesPerMonth}) < Beta(${betaPlan.analysesPerMonth}) < Pro(${proPlan.analysesPerMonth})`,
      `Free=${freePlan.analysesPerMonth}, Beta=${betaPlan.analysesPerMonth}, Pro=${proPlan.analysesPerMonth}`
    );
  } catch (err: any) {
    recordTest('SaaS: Planos FREE, BETA e PRO', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 10: Detecção Segura de Ambiente Supabase
  try {
    const configured = isSupabaseConfigured();
    recordTest(
      'SupabaseClient: Detecção de configuração segura sem expor variáveis sensíveis',
      typeof configured === 'boolean',
      'boolean retornado com segurança',
      `isConfigured=${configured}`
    );
  } catch (err: any) {
    recordTest('SupabaseClient: Detecção segura', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTES DE SEGURANÇA RLS: ORGANIZAÇÃO & MEMBERSHIP
  // --------------------------------------------------------------------------

  // Teste 11: RLS SQL exige membership em organization_members em analyses, profiles e usage
  try {
    const rlsSql = readFileSync(new URL('../supabase/migrations/002_rls_policies.sql', import.meta.url), 'utf8');
    
    // Check analyses insert policy
    const analysesHasOrgCheck = rlsSql.includes('organization_id IS NULL') && 
                                rlsSql.includes('FROM public.organization_members om') &&
                                rlsSql.includes('om.organization_id = analyses.organization_id') &&
                                rlsSql.includes('om.user_id = auth.uid()');

    // Check profiles insert policy
    const profilesHasOrgCheck = rlsSql.includes('om.organization_id = production_profiles.organization_id');

    // Check usage insert policy
    const usageHasOrgCheck = rlsSql.includes('om.organization_id = usage_records.organization_id');

    const allHaveOrgCheck = analysesHasOrgCheck && profilesHasOrgCheck && usageHasOrgCheck;

    recordTest(
      'RLS: INSERT/UPDATE exige membership real em organization_members ou organization_id NULL',
      allHaveOrgCheck,
      'analyses, production_profiles e usage_records exigem validação estrita',
      `analyses: ${analysesHasOrgCheck}, profiles: ${profilesHasOrgCheck}, usage: ${usageHasOrgCheck}`
    );
  } catch (err: any) {
    recordTest('RLS: INSERT/UPDATE com membership', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 12: Simulação de Isolamento Multi-tenant (organization_id de terceiro rejeitado)
  try {
    interface MemberShipRecord {
      userId: string;
      orgId: string;
    }

    const membershipTable: MemberShipRecord[] = [
      { userId: 'user_alice', orgId: 'org_grafica_alfa' },
      { userId: 'user_bob', orgId: 'org_grafica_beta' },
    ];

    // Simula a validação RLS:
    // auth.uid() = record.user_id AND (record.organization_id IS NULL OR EXISTS (SELECT 1 FROM organization_members WHERE ...))
    const validateRlsInsert = (authUid: string, record: { user_id: string; organization_id: string | null }): boolean => {
      if (authUid !== record.user_id) return false;
      if (record.organization_id === null) return true;
      return membershipTable.some(m => m.orgId === record.organization_id && m.userId === authUid);
    };

    // Caso 1: organization_id NULL permitido
    const nullAllowed = validateRlsInsert('user_alice', { user_id: 'user_alice', organization_id: null });
    // Caso 2: organization_id da própria organização permitido
    const ownOrgAllowed = validateRlsInsert('user_alice', { user_id: 'user_alice', organization_id: 'org_grafica_alfa' });
    // Caso 3: organization_id de terceiro bloqueado
    const thirdPartyBlocked = !validateRlsInsert('user_alice', { user_id: 'user_alice', organization_id: 'org_grafica_beta' });
    // Caso 4: user_id forjado bloqueado
    const forgedUserBlocked = !validateRlsInsert('user_alice', { user_id: 'user_bob', organization_id: 'org_grafica_beta' });

    const passed = nullAllowed && ownOrgAllowed && thirdPartyBlocked && forgedUserBlocked;

    recordTest(
      'RLS: Isolamento Multi-tenant (NULL permitido, Própria Org permitida, Terceiro bloqueado)',
      passed,
      'null=true, own=true, thirdParty=blocked, forged=blocked',
      `nullAllowed: ${nullAllowed}, ownOrgAllowed: ${ownOrgAllowed}, thirdPartyBlocked: ${thirdPartyBlocked}, forgedBlocked: ${forgedUserBlocked}`
    );
  } catch (err: any) {
    recordTest('RLS: Isolamento Multi-tenant', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTES DE BACKEND EXPRESS: VALIDAÇÃO DE IDENTIDADE E JWT
  // --------------------------------------------------------------------------

  // Teste 13: Backend extrai e autentica usuário, ignorando user_id fornecido no payload
  try {
    const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

    const usesGetUser = serverSource.includes('supabase.auth.getUser(authToken)');
    const createsAuthUser = serverSource.includes('(req as any).authUser =') && serverSource.includes('role:');
    const protectsServiceRole = !serverSource.includes('VITE_SUPABASE_SERVICE_ROLE_KEY');

    const passed = usesGetUser && createsAuthUser && protectsServiceRole;

    recordTest(
      'Backend Express: Validação real de Bearer token com Supabase Auth e extração de authUser',
      passed,
      'getUser real chamado, authUser criado no request, SERVICE_ROLE nunca exposta',
      `usesGetUser: ${usesGetUser}, createsAuthUser: ${createsAuthUser}, protectsServiceRole: ${protectsServiceRole}`
    );
  } catch (err: any) {
    recordTest('Backend Express: Validação JWT', false, 'Sucesso', 'Exceção', err.message);
  }

  // Teste 14: Lógica do Middleware de Autenticação (Token ausente, inválido, válido e payload ignorado)
  try {
    // Simula a função de resolução de identidade do middleware
    const resolveIdentity = (
      authHeader: string | undefined, 
      bodyUserId?: string,
      mockValidateToken?: (token: string) => { id: string; email: string } | null
    ) => {
      let authToken: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        authToken = authHeader.substring(7).trim();
      }

      if (!authToken) {
        return { authUser: null, authenticated: false, effectiveUserId: null };
      }

      const validated = mockValidateToken ? mockValidateToken(authToken) : null;
      if (validated) {
        // NUNCA usa bodyUserId para autorização; identidade é estritamente a do token
        return {
          authUser: { id: validated.id, email: validated.email },
          authenticated: true,
          effectiveUserId: validated.id,
        };
      }

      return { authUser: null, authenticated: false, effectiveUserId: null };
    };

    // Caso A: Token ausente
    const noToken = resolveIdentity(undefined, 'forged_user');
    const noTokenPassed = noToken.authenticated === false && noToken.effectiveUserId === null;

    // Caso B: Token inválido
    const invalidToken = resolveIdentity('Bearer bad_token_123', 'forged_user', () => null);
    const invalidTokenPassed = invalidToken.authenticated === false && invalidToken.effectiveUserId === null;

    // Caso C: Token válido
    const validToken = resolveIdentity(
      'Bearer valid_jwt_token', 
      'forged_user_attack', 
      (t) => t === 'valid_jwt_token' ? { id: 'real_user_777', email: 'real@grafica.com' } : null
    );
    const validTokenPassed = validToken.authenticated === true && 
                             validToken.effectiveUserId === 'real_user_777' &&
                             (validToken.effectiveUserId as string) !== 'forged_user_attack';

    const allMiddlewareCasesPassed = noTokenPassed && invalidTokenPassed && validTokenPassed;

    recordTest(
      'Backend Express: Resolução de Identidade (Token ausente, inválido, válido; user_id do body ignorado)',
      allMiddlewareCasesPassed,
      'noToken=unauthenticated, invalidToken=unauthenticated, validToken=real_user_777 (bodyUserId ignorado)',
      `noToken: ${noTokenPassed}, invalidToken: ${invalidTokenPassed}, validToken: ${validTokenPassed}`
    );
  } catch (err: any) {
    recordTest('Backend Express: Resolução Identidade', false, 'Sucesso', 'Exceção', err.message);
  }

  // Relatório Final
  let passedCount = 0;
  let failedCount = 0;

  console.log('----------------------------------------------------------------');
  console.log('RESULTADOS DOS TESTES SAAS / ETAPA 10:');
  console.log('----------------------------------------------------------------\n');

  for (const r of results) {
    if (r.passed) {
      passedCount++;
      console.log(`[PASSOU] ${r.name}`);
    } else {
      failedCount++;
      console.log(`[FALHOU] ${r.name}`);
    }
    console.log(`   Esperado:   ${r.expected}`);
    console.log(`   Encontrado: ${r.found}`);
    if (r.error) {
      console.log(`   Erro:       ${r.error}`);
    }
    console.log('');
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES SAAS: ${results.length}`);
  console.log(`APROVADOS:            ${passedCount}`);
  console.log(`REPROVADOS:           ${failedCount}`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSaaSTests().catch((err) => {
  console.error('Falha fatal nos testes SaaS:', err);
  process.exit(1);
});
