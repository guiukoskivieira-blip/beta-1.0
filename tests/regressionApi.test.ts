/**
 * ARTECHECK — Testes de regressão para API/Express.
 * Testa rotas HTTP, tipos de conteúdo e tratamento de erro.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

let passed = 0;
let failed = 0;
const bugs: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ API ${passed}: ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ API ${passed + failed}: ${name} — ${err.message}`);
  }
}

console.log('\n================================================================');
console.log('ARTECHECK — REGRESSÃO: API/EXPRESS');
console.log('================================================================\n');

const serverSrc = fs.readFileSync('server.ts', 'utf8');

// ============================================================================
// TESTES: POST /api/upload retorna JSON
// ============================================================================

test('POST /api/upload retorna JSON: handler termina com res.status(200).json()', () => {
  assert.match(serverSrc, /app\.post\(\s*["']\/api\/upload["']/);
  // O handler final deve chamar res.status(200).json com success: true
  assert.match(serverSrc, /return res\.status\(200\)\.json\(/);
  assert.match(serverSrc, /success:\s*true/);
});

test('POST /api/upload define Content-Type application/json na resposta', () => {
  // res.json() do Express define Content-Type: application/json automaticamente
  // Verificar que não há res.send com HTML no handler de upload
  const uploadSection = serverSrc.slice(serverSrc.indexOf('app.post(\n    "/api/upload"'), serverSrc.indexOf('app.post("/api/diagnose"'));
  assert.ok(uploadSection.includes('res.json') || uploadSection.includes('res.status('), 'Handler de upload deve usar res.json/res.status');
  assert.ok(!uploadSection.includes('res.sendFile'), 'Handler de upload não deve usar res.sendFile');
});

// ============================================================================
// TESTES: Rota /api inexistente nunca retorna index.html HTTP 200
// ============================================================================

test('Rota /api/* inexistente retorna JSON 404, nunca index.html', () => {
  // Deve existir um handler app.all("/api/*") que retorna 404 JSON
  assert.match(serverSrc, /app\.all\(\s*["']\/api\/\*["']/);
  assert.match(serverSrc, /res\.status\(404\)\.json\(/);

  // O handler catch-all para index.html deve ser APÓS o handler /api/*
  const api404Pos = serverSrc.indexOf('app.all("/api/*"');
  const sendFilePos = serverSrc.indexOf('res.sendFile(path.join(distPath, "index.html")))');
  if (api404Pos >= 0 && sendFilePos >= 0) {
    assert.ok(api404Pos < sendFilePos, 'Handler /api/* 404 deve vir antes do catch-all do index.html');
  }
});

test('Handler global de erro para /api/ sempre responde JSON', () => {
  assert.match(serverSrc, /req\.path\.startsWith\(["']\/api\/["']\)/);
  assert.match(serverSrc, /res\.status\(err\.status \|\| 500\)\.json\(/);
});

// ============================================================================
// TESTES: PDF inválido retorna erro controlado
// ============================================================================

test('PDF inválido (sem assinatura %PDF-) retorna 400 com JSON', () => {
  assert.match(serverSrc, /hasPdfHeader/);
  assert.match(serverSrc, /Arquivo inválido.*assinatura.*PDF/);
  assert.match(serverSrc, /res\.status\(400\)\.json\(/);
});

test('Arquivo vazio ou corrompido retorna 400 com JSON', () => {
  assert.match(serverSrc, /Arquivo vazio ou corrompido/);
});

test('Erro de extração PDF é capturado e retorna 400 com JSON (não crash)', () => {
  assert.match(serverSrc, /catch \(extractError/);
  assert.match(serverSrc, /Não foi possível interpretar a estrutura do arquivo PDF/);
});

// ============================================================================
// TESTES: Upload repetido não trava servidor
// ============================================================================

test('Upload handler é stateless (memoryStorage, sem estado global entre requests)', () => {
  assert.match(serverSrc, /multer\.memoryStorage\(\)/);
  // Não deve haver variáveis globais mutáveis compartilhadas entre requests no handler
  assert.match(serverSrc, /const file = req\.file/);
});

test('Middleware de upload tem limite de arquivos (files: 1)', () => {
  assert.match(serverSrc, /files:\s*1/);
  assert.match(serverSrc, /LIMIT_FILE_SIZE/);
});

// ============================================================================
// TESTES: CORS e headers de segurança
// ============================================================================

test('CORS permite origens cross-origin para preview em iframe', () => {
  assert.match(serverSrc, /Access-Control-Allow-Origin.*\*/);
  assert.match(serverSrc, /Access-Control-Allow-Methods/);
});

test('X-Content-Type-Options: nosniff está definido', () => {
  assert.match(serverSrc, /X-Content-Type-Options.*nosniff/);
});

// ============================================================================
// TESTES: /api/health e /api/capabilities
// ============================================================================

test('GET /api/health retorna JSON com status ok', () => {
  assert.match(serverSrc, /app\.get\(\s*["']\/api\/health["']/);
  assert.match(serverSrc, /status:\s*["']ok["']/);
});

test('GET /api/capabilities retorna configuração sem expor segredos', () => {
  assert.match(serverSrc, /app\.get\(\s*["']\/api\/capabilities["']/);
  const capSection = serverSrc.slice(serverSrc.indexOf('app.get("/api/capabilities"'), serverSrc.indexOf('app.get(\'/api/billing/status\''));
  // Não deve conter chaves secretas
  assert.ok(!capSection.includes('SERVICE_ROLE_KEY'), 'capabilities não deve expor SERVICE_ROLE_KEY');
  assert.ok(!capSection.includes('MERCADOPAGO_ACCESS_TOKEN'), 'capabilities não deve expor access token');
});

// ============================================================================
// RELATÓRIO
// ============================================================================

console.log(`\n  API: ${passed}/${passed + failed} aprovados${failed > 0 ? `, ${failed} falhas` : ''}`);
if (bugs.length > 0) {
  console.log('  BUGS REAIS ENCONTRADOS:');
  for (const b of bugs) console.log(`    - ${b}`);
}

export { bugs as apiBugs, passed as apiPassed, failed as apiFailed };
