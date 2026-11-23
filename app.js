const express = require("express");
const { initializeDatabase, getPool, getSecretMetadata } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Determine if request is from a web browser expecting interactive HTML
 */
function isBrowserRequest(req) {
  if (req.query.format === "json") return false;
  if (req.query.format === "html") return true;
  const accept = req.headers.accept || "";
  return accept.includes("text/html");
}

/**
 * Generate Presentation HTML for interactive route viewing
 */
function generatePresentationHtml({ activeRoute, title, data, statusCode, errorMsg = null }) {
  const isHealthy = statusCode === 200;
  const statusColor = isHealthy ? "#10b981" : "#ef4444";
  const statusBg = isHealthy ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)";
  const statusBorder = isHealthy ? "#059669" : "#dc2626";
  const statusText = isHealthy ? "ONLINE / CONNECTED" : "OFFLINE / DISCONNECTED";
  const meta = getSecretMetadata();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | AWS Secrets Manager Rotation Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0f1d;
      --card-bg: rgba(18, 24, 38, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, var(--bg-dark) 65%);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
    }
    .container { max-width: 920px; margin: 0 auto; width: 100%; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 0 2rem;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 2rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .logo-area { display: flex; align-items: center; gap: 0.85rem; }
    .logo-icon {
      width: 44px; height: 44px; border-radius: 12px;
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      display: flex; align-items: center; justify-content: center; font-size: 1.35rem;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    }
    .logo-title {
      font-size: 1.25rem; font-weight: 800;
      background: linear-gradient(90deg, #fff, #cbd5e1);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .logo-subtitle { font-size: 0.8rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
    .nav-tabs {
      display: flex; background: rgba(15, 23, 42, 0.6); padding: 4px; border-radius: 10px;
      border: 1px solid var(--card-border); gap: 4px;
    }
    .nav-link {
      color: var(--text-muted); text-decoration: none; padding: 8px 16px; border-radius: 8px;
      font-size: 0.85rem; font-weight: 600; transition: all 0.2s ease;
    }
    .nav-link:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
    .nav-link.active { color: #fff; background: var(--primary); }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 9999px; font-size: 0.8rem;
      font-weight: 700; letter-spacing: 0.03em; border: 1px solid;
    }
    .pulse-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background-color: currentColor; box-shadow: 0 0 10px currentColor;
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.6; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(16px);
      margin-bottom: 1.5rem;
      position: relative;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, #6366f1, #ec4899, #10b981);
    }
    .card-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;
    }
    .route-chip {
      font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;
      padding: 4px 10px; background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3); color: #a5b4fc; border-radius: 6px;
    }
    .rotation-banner {
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.25);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
      font-size: 0.85rem;
    }
    .rotation-id {
      font-family: 'JetBrains Mono', monospace;
      color: #38bdf8;
      font-weight: 600;
    }
    .grid-props {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .prop-box {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.1rem;
    }
    .prop-label {
      font-size: 0.75rem; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; font-weight: 600;
    }
    .prop-val {
      font-size: 1.05rem; font-weight: 700; color: #fff;
      font-family: 'JetBrains Mono', monospace; word-break: break-all;
    }
    .json-section {
      background: #070b14; border-radius: 12px;
      border: 1px solid var(--card-border); padding: 1rem 1.25rem;
      font-family: 'JetBrains Mono', monospace; font-size: 0.85rem;
    }
    .json-header {
      display: flex; justify-content: space-between;
      color: var(--text-muted); font-size: 0.75rem; margin-bottom: 0.5rem; text-transform: uppercase;
    }
    pre { color: #38bdf8; overflow-x: auto; white-space: pre-wrap; }
    .actions-bar {
      display: flex; gap: 0.75rem; margin-top: 1.5rem; flex-wrap: wrap; align-items: center;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--primary); color: #fff; border: none; padding: 10px 20px;
      border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.88rem;
      transition: all 0.2s ease; text-decoration: none;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.07); color: var(--text-main); border: 1px solid var(--card-border);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
    footer { margin-top: auto; text-align: center; padding-top: 2rem; color: var(--text-muted); font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-area">
        <div class="logo-icon">🔐</div>
        <div>
          <div class="logo-title">AWS Secrets Manager Demo</div>
          <div class="logo-subtitle">Secret: ${meta.secretId} &bull; Region: ${meta.region}</div>
        </div>
      </div>
      <nav class="nav-tabs">
        <a href="/" class="nav-link ${activeRoute === '/' ? 'active' : ''}">📊 Overview</a>
        <a href="/health" class="nav-link ${activeRoute === '/health' ? 'active' : ''}">💚 /health</a>
        <a href="/db-info" class="nav-link ${activeRoute === '/db-info' ? 'active' : ''}">🗄️ /db-info</a>
      </nav>
    </header>

    <div class="card">
      <div class="card-header">
        <div>
          <div class="route-chip">${activeRoute} &bull; HTTP ${statusCode}</div>
          <h2 style="font-size: 1.5rem; margin-top: 0.5rem; font-weight: 700;">${title}</h2>
        </div>
        <div class="badge" style="color: ${statusColor}; background: ${statusBg}; border-color: ${statusBorder};">
          <span class="pulse-dot"></span>
          <span>${statusText}</span>
        </div>
      </div>

      <div class="rotation-banner">
        <div>
          <span>Active Secret Version ID: </span>
          <span class="rotation-id">${meta.versionId || "Initial / Resolving..."}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.8rem;">
          Auto-rotation poller: active (every ${meta.refreshIntervalMs / 1000}s)
        </div>
      </div>

      <div class="grid-props">
        ${Object.entries(data).map(([key, val]) => `
          <div class="prop-box">
            <div class="prop-label">${key}</div>
            <div class="prop-val">${val}</div>
          </div>
        `).join('')}
      </div>

      ${errorMsg ? `
        <div style="background: rgba(239,68,68,0.15); border: 1px solid #ef4444; border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem; color: #fca5a5;">
          <strong>Error:</strong> ${errorMsg}
        </div>
      ` : ''}

      <div class="json-section">
        <div class="json-header">
          <span>Raw JSON Response</span>
          <span>HTTP ${statusCode}</span>
        </div>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      </div>

      <div class="actions-bar">
        <button class="btn" onclick="window.location.reload();">🔄 Refresh Page</button>
        <a href="${activeRoute}?format=json" class="btn btn-secondary" target="_blank">📄 View Raw JSON</a>
        <div style="margin-left: auto; font-size: 0.8rem; color: var(--text-muted);">
          Updated: <span id="timeNow"></span>
        </div>
      </div>
    </div>

    <footer>
      Automatic PostgreSQL Credential Rotation Demo &bull; Node.js 22 LTS &bull; AWS SDK v3
    </footer>
  </div>
  <script>
    document.getElementById('timeNow').innerText = new Date().toLocaleTimeString();
  </script>
</body>
</html>`;
}

/**
 * Generate Overview Dashboard HTML
 */
function generateOverviewHtml() {
  const meta = getSecretMetadata();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard | AWS Secrets Manager Rotation Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0f1d;
      --card-bg: rgba(18, 24, 38, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, var(--bg-dark) 65%);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
    }
    .container { max-width: 960px; margin: 0 auto; width: 100%; }
    header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 0 2rem; border-bottom: 1px solid var(--card-border);
      margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem;
    }
    .logo-area { display: flex; align-items: center; gap: 0.85rem; }
    .logo-icon {
      width: 44px; height: 44px; border-radius: 12px;
      background: linear-gradient(135deg, #f59e0b, #ef4444);
      display: flex; align-items: center; justify-content: center; font-size: 1.35rem;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    }
    .logo-title {
      font-size: 1.25rem; font-weight: 800;
      background: linear-gradient(90deg, #fff, #cbd5e1);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .logo-subtitle { font-size: 0.8rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
    .nav-tabs {
      display: flex; background: rgba(15, 23, 42, 0.6); padding: 4px; border-radius: 10px;
      border: 1px solid var(--card-border); gap: 4px;
    }
    .nav-link {
      color: var(--text-muted); text-decoration: none; padding: 8px 16px; border-radius: 8px;
      font-size: 0.85rem; font-weight: 600; transition: all 0.2s ease;
    }
    .nav-link:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
    .nav-link.active { color: #fff; background: var(--primary); }
    .hero-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(236, 72, 153, 0.15));
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 16px;
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .version-tag {
      font-family: 'JetBrains Mono', monospace;
      background: #0f172a;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #38bdf8;
      display: inline-block;
      margin-top: 4px;
    }
    .route-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.75rem;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .card-title {
      font-size: 1.2rem; font-weight: 700;
      display: flex; align-items: center; gap: 8px; margin-bottom: 0.5rem;
    }
    .route-pill {
      font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
      padding: 3px 8px; background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3); color: #a5b4fc;
      border-radius: 6px; display: inline-block; margin-bottom: 1rem;
    }
    .status-preview {
      background: #070b14; border-radius: 10px; padding: 1rem;
      font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;
      color: #38bdf8; min-height: 120px; margin-bottom: 1.5rem; overflow-x: auto;
    }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      background: var(--primary); color: #fff; border: none; padding: 10px 18px;
      border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.88rem;
      text-decoration: none; transition: all 0.2s;
    }
    .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); border: 1px solid var(--card-border); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }
    .btn-group { display: flex; gap: 0.75rem; }
    footer { margin-top: auto; text-align: center; padding-top: 2.5rem; color: var(--text-muted); font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-area">
        <div class="logo-icon">🔐</div>
        <div>
          <div class="logo-title">AWS Secrets Manager Demo</div>
          <div class="logo-subtitle">Secret: ${meta.secretId} &bull; Region: ${meta.region}</div>
        </div>
      </div>
      <nav class="nav-tabs">
        <a href="/" class="nav-link active">📊 Overview</a>
        <a href="/health" class="nav-link">💚 /health</a>
        <a href="/db-info" class="nav-link">🗄️ /db-info</a>
      </nav>
    </header>

    <div class="hero-banner">
      <div>
        <h1 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.3rem;">Automatic Credential Rotation Active</h1>
        <p style="color: var(--text-muted); font-size: 0.88rem;">
          Background polling active every 60s. Active Secret Version:
        </p>
        <span class="version-tag">${meta.versionId || "Detecting..."}</span>
      </div>
      <button class="btn" onclick="refreshBoth()">🔄 Re-test Both Endpoints</button>
    </div>

    <div class="route-grid">
      <!-- Health Card -->
      <div class="card">
        <div>
          <div class="card-title">💚 Application Health</div>
          <span class="route-pill">GET /health</span>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
            Verifies basic node server health and checks live PostgreSQL connection using <code>SELECT 1</code>.
          </p>
          <div class="status-preview" id="healthBox">Loading status...</div>
        </div>
        <div class="btn-group">
          <a href="/health" class="btn" style="flex: 1;">Open /health Page</a>
          <a href="/health?format=json" class="btn btn-secondary" target="_blank">JSON</a>
        </div>
      </div>

      <!-- DB Info Card -->
      <div class="card">
        <div>
          <div class="card-title">🗄️ Database Information</div>
          <span class="route-pill">GET /db-info</span>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
            Executes <code>current_database()</code>, <code>current_user</code>, and <code>version()</code> on PostgreSQL.
          </p>
          <div class="status-preview" id="dbInfoBox">Loading database info...</div>
        </div>
        <div class="btn-group">
          <a href="/db-info" class="btn" style="flex: 1;">Open /db-info Page</a>
          <a href="/db-info?format=json" class="btn btn-secondary" target="_blank">JSON</a>
        </div>
      </div>
    </div>

    <footer>
      Testing automatic PostgreSQL credential rotation via AWS Secrets Manager &amp; EC2 IAM Role
    </footer>
  </div>

  <script>
    async function loadEndpoint(url, elementId) {
      const box = document.getElementById(elementId);
      try {
        const res = await fetch(url + '?format=json');
        const data = await res.json();
        box.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        box.innerText = 'Error fetching: ' + err.message;
      }
    }

    function refreshBoth() {
      loadEndpoint('/health', 'healthBox');
      loadEndpoint('/db-info', 'dbInfoBox');
    }

    refreshBoth();
  </script>
</body>
</html>`;
}

/**
 * GET /
 * Interactive Presentation Dashboard
 */
app.get("/", (req, res) => {
  if (isBrowserRequest(req)) {
    return res.status(200).send(generateOverviewHtml());
  }
  return res.status(200).json({
    message: "AWS Secrets Manager PostgreSQL Demo",
    ...getSecretMetadata(),
    endpoints: ["/health", "/db-info"],
  });
});

/**
 * GET /health
 */
app.get("/health", async (req, res) => {
  try {
    await getPool().query("SELECT 1");

    const data = {
      status: "healthy",
      database: "connected",
    };

    if (isBrowserRequest(req)) {
      return res.status(200).send(generatePresentationHtml({
        activeRoute: "/health",
        title: "Application & Database Health",
        data,
        statusCode: 200,
      }));
    }

    res.json(data);
  } catch (error) {
    const data = {
      status: "unhealthy",
      database: "disconnected",
    };

    if (isBrowserRequest(req)) {
      return res.status(503).send(generatePresentationHtml({
        activeRoute: "/health",
        title: "Application & Database Health",
        data,
        statusCode: 503,
        errorMsg: error.message,
      }));
    }

    res.status(503).json(data);
  }
});

/**
 * GET /db-info
 */
app.get("/db-info", async (req, res) => {
  try {
    const result = await getPool().query(`
      SELECT current_database() AS database,
             current_user AS username,
             version()
    `);

    const data = result.rows[0];

    if (isBrowserRequest(req)) {
      return res.status(200).send(generatePresentationHtml({
        activeRoute: "/db-info",
        title: "Database Connection Information",
        data,
        statusCode: 200,
      }));
    }

    res.json(data);
  } catch (error) {
    const data = { error: "Database query failed" };

    if (isBrowserRequest(req)) {
      return res.status(500).send(generatePresentationHtml({
        activeRoute: "/db-info",
        title: "Database Connection Information",
        data,
        statusCode: 500,
        errorMsg: error.message,
      }));
    }

    res.status(500).json(data);
  }
});

async function startServer() {
  await initializeDatabase();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Closing server and active pool...`);
    server.close(async () => {
      try {
        const pool = getPool();
        await pool.end();
        console.log("[Shutdown] Active PostgreSQL connection pool drained and closed.");
      } catch (err) {
        console.error("[Shutdown Error]", err.message);
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error("[Shutdown] Forced exit timeout.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch((error) => {
  console.error("Application startup failed:", error);
  process.exit(1);
});
