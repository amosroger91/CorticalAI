import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const HEALTH_ENDPOINT = '/api/v1/health';
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000; // 2 seconds

async function verifyServer() {
  console.log(`Attempting to connect to ${BASE_URL}${HEALTH_ENDPOINT}...`);
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${BASE_URL}${HEALTH_ENDPOINT}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Server is up and running! Health status: ${data.status}`);
        return true;
      } else {
        console.log(`Attempt ${i + 1}/${MAX_RETRIES}: Server responded with status ${response.status}. Retrying...`);
      }
    } catch (error) {
      console.log(`Attempt ${i + 1}/${MAX_RETRIES}: Connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  }
  console.error(`❌ Failed to connect to the server after ${MAX_RETRIES} attempts.`);
  return false;
}

verifyServer().then(success => {
  if (!success) {
    process.exit(1);
  }
});
