const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { Pool } = require("pg");

const SECRET_ID = process.env.SECRET_ID || process.env.SECRET_NAME || "test/rds-postgres";
const REGION = process.env.AWS_REGION || "us-east-1";
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL, 10) || 60 * 1000; // 1 minute

const client = new SecretsManagerClient({
  region: REGION,
});

let activePool = null;
let currentVersionId = null;
let refreshing = false;

async function getCurrentSecret() {
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: SECRET_ID,
      VersionStage: "AWSCURRENT",
    })
  );

  return {
    versionId: response.VersionId,
    credentials: JSON.parse(response.SecretString),
  };
}

function createPool(credentials) {
  const pool = new Pool({
    host: credentials.host,
    port: Number(credentials.port) || 5432,
    database: credentials.dbname,
    user: credentials.username,
    password: credentials.password,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on("error", (err) => {
    console.error("[PostgreSQL Pool Error]", err.message);
  });

  return pool;
}

async function refreshDatabaseCredentials() {
  if (refreshing) return;

  refreshing = true;

  try {
    const secret = await getCurrentSecret();

    // No new version: nothing to change.
    if (secret.versionId === currentVersionId) {
      return;
    }

    console.log(`[Rotation] New database secret version detected: ${secret.versionId}`);

    // Create a new pool using the latest credentials.
    const newPool = createPool(secret.credentials);

    // Test the new connection before switching.
    await newPool.query("SELECT 1");

    const oldPool = activePool;

    // Switch application traffic to the new pool.
    activePool = newPool;
    currentVersionId = secret.versionId;

    console.log("[Rotation] Database credentials refreshed successfully. Traffic switched to new pool.");

    // Gracefully close the old pool.
    if (oldPool) {
      await oldPool.end();
      console.log("[Rotation] Old database connection pool gracefully closed.");
    }
  } catch (error) {
    console.error("[Rotation Error] Credential refresh failed:", error.message);
    // Keep the existing pool if refresh fails.
  } finally {
    refreshing = false;
  }
}

async function initializeDatabase() {
  await refreshDatabaseCredentials();

  const intervalId = setInterval(
    refreshDatabaseCredentials,
    REFRESH_INTERVAL
  );

  // Allow process to exit cleanly without waiting for interval timer
  if (intervalId.unref) {
    intervalId.unref();
  }
}

function getPool() {
  if (!activePool) {
    throw new Error("Database is not initialized");
  }

  return activePool;
}

function getSecretMetadata() {
  return {
    secretId: SECRET_ID,
    region: REGION,
    versionId: currentVersionId,
    refreshIntervalMs: REFRESH_INTERVAL,
  };
}

module.exports = {
  initializeDatabase,
  getPool,
  getSecretMetadata,
  refreshDatabaseCredentials,
};
