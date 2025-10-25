import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

const TESTS = [
  {
    description: 'Health check endpoint should return 200 OK and status: "ok"',
    path: '/api/v1/health',
    expectStatus: 200,
    expectBody: (body) => body.status === 'ok',
  },
  {
    description: 'Config endpoint should return 200 OK and a config object',
    path: '/api/v1/config',
    expectStatus: 200,
    expectBody: (body) => body.success === true && typeof body.config === 'object',
  },
  {
    description: 'Functions endpoint should return 200 OK and a list of functions',
    path: '/api/v1/functions',
    expectStatus: 200,
    expectBody: (body) => Array.isArray(body.functions),
  },
  {
    description: 'Examples endpoint should return 200 OK and a list of examples',
    path: '/examples',
    expectStatus: 200,
    expectBody: (body) => body.success === true && Array.isArray(body.examples),
  },
];

async function runTests() {
  console.log('🚀 Starting E2E tests...');
  let failed = false;

  for (const test of TESTS) {
    try {
      const response = await fetch(`${BASE_URL}${test.path}`);
      const body = await response.json();

      if (response.status !== test.expectStatus) {
        throw new Error(`Expected status ${test.expectStatus}, but got ${response.status}`);
      }

      if (!test.expectBody(body)) {
        throw new Error('Response body did not match expectations');
      }

      console.log(`✅ PASSED: ${test.description}`);
    } catch (error) {
      console.error(`❌ FAILED: ${test.description}`);
      console.error(error);
      failed = true;
    }
  }

  if (failed) {
    console.error('\n🔥 Some E2E tests failed.');
    process.exit(1);
  } else {
    console.log('\n🎉 All E2E tests passed!');
    process.exit(0);
  }
}

runTests();
