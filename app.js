const express = require('express');
const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const app = express();
const port = process.env.PORT || 3000;
const secretName = process.env.SECRET_NAME || 'test/rds-postgres';
const region = process.env.AWS_REGION || 'us-east-1';

let pool;

/**
 * Fetch database credentials from AWS Secrets Manager using the EC2 IAM role
 */
async function getDbCredentials() {
  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretName });

  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error('SecretString not found in AWS Secrets Manager response');
  }

  const credentials = JSON.parse(response.SecretString);

  if (!credentials.host || !credentials.username || !credentials.password || !credentials.dbname) {
    throw new Error('Invalid secret format: missing required database connection fields');
  }

  return credentials;
}

/**
 * Initialize PostgreSQL connection pool with retrieved credentials
 */
async function initializeDatabase() {
  console.log(`[Startup] Fetching database credentials for secret: "${secretName}" in region: "${region}"...`);
  const credentials = await getDbCredentials();

  pool = new Pool({
    host: credentials.host,
    user: credentials.username,
    password: credentials.password,
    database: credentials.dbname,
    port: Number(credentials.port) || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL Pool Error]', err.message);
  });

  // Verify initial connectivity
  await pool.query('SELECT 1');
  console.log('[Startup] Successfully connected to PostgreSQL database.');
}

/**
 * GET /health
 * Check PostgreSQL connectivity using SELECT 1
 */
app.get('/health', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        status: 'unhealthy',
        application: 'running',
        database: 'disconnected',
      });
    }

    await pool.query('SELECT 1');
    return res.status(200).json({
      status: 'healthy',
      application: 'running',
      database: 'connected',
    });
  } catch (error) {
    console.error('[Health Check Failed]', error.message);
    return res.status(503).json({
      status: 'unhealthy',
      application: 'running',
      database: 'disconnected',
    });
  }
});

/**
 * GET /db-info
 * Retrieve current database, current user, and PostgreSQL version
 */
app.get('/db-info', async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: 'Database connection pool is not initialized',
        connection: 'disconnected',
      });
    }

    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS username, version() AS version;'
    );

    const row = result.rows[0];
    return res.status(200).json({
      database: row.database,
      username: row.username,
      version: row.version,
      connection: 'connected',
    });
  } catch (error) {
    console.error('[DB Info Query Failed]', error.message);
    return res.status(500).json({
      error: 'Failed to retrieve database information',
      connection: 'disconnected',
    });
  }
});

/**
 * Start server and manage graceful shutdown
 */
async function startServer() {
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('[Startup Error] Failed to initialize database from AWS Secrets Manager:', error.message);
    console.error('[Startup Warning] Server will start, but database endpoints will report disconnected status.');
  }

  const server = app.listen(port, () => {
    console.log(`[Server] Express server listening on port ${port}`);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Closing server and database pool...`);
    server.close(async () => {
      console.log('[Shutdown] HTTP server closed.');
      if (pool) {
        try {
          await pool.end();
          console.log('[Shutdown] PostgreSQL connection pool drained and closed.');
        } catch (err) {
          console.error('[Shutdown Error] Error while closing pool:', err.message);
        }
      }
      process.exit(0);
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error('[Shutdown] Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
