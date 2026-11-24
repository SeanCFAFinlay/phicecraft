// ============================================================================
// CRASH REPORT ENDPOINT  (Vercel serverless function: POST /api/report)
//
// Receives the short report src/telemetry/crashReporter.ts sends and writes
// it to the deployment's runtime logs as one line tagged `[phormation-crash]`.
// Read them in the Vercel dashboard: Project -> Logs, filter on that tag.
//
// Nothing is stored and nothing is forwarded. Fields are whitelisted and
// trimmed so a malformed or hostile request cannot flood the logs.
// ============================================================================

const LIMITS = {
  message: 500,
  stack: 4000,
  source: 20,
  path: 200,
  build: 120,
  userAgent: 300,
  viewport: 40,
  renderer: 40,
  at: 40,
};

const MAX_BODY = 16 * 1024;

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(JSON.parse(req.body));
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export function sanitizeReport(input) {
  if (!input || typeof input !== 'object') return null;
  const report = {};
  for (const [field, limit] of Object.entries(LIMITS)) {
    const value = input[field];
    report[field] = typeof value === 'string' ? value.slice(0, limit) : '';
  }
  if (!report.message) return null;
  return report;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.status(400).end();
    return;
  }
  const report = sanitizeReport(body);
  if (!report) {
    res.status(400).end();
    return;
  }
  console.error('[phormation-crash]', JSON.stringify(report));
  res.status(204).end();
}
