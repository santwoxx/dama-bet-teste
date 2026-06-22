import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

export let pool: pg.Pool | null = null;
export const isPostgresActive = !!databaseUrl;

if (isPostgresActive) {
  console.log('Connecting to PostgreSQL using DATABASE_URL...');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  // Verify connection
  pool.connect((err, client, release) => {
    if (err) {
      console.error('Failed to connect to PostgreSQL database:', err.message);
    } else {
      console.log('Successfully connected to PostgreSQL database!');
      release();
      // Initialize tables
      initializePostgresTables();
    }
  });
} else {
  console.warn('WARNING: DATABASE_URL is not configured. Running in fallback mode with local JSON databases.');
}

async function initializePostgresTables() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    console.log('Initializing database tables if they do not exist...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        password_salt VARCHAR(255),
        avatar VARCHAR(255),
        balance NUMERIC(15, 2) DEFAULT 100.00,
        locked_balance NUMERIC(15, 2) DEFAULT 0.00,
        bot_games_played INT DEFAULT 0,
        bonus_balance NUMERIC(15, 2) DEFAULT 0.00,
        rollover_required NUMERIC(15, 2) DEFAULT 0.00,
        rollover_wagered NUMERIC(15, 2) DEFAULT 0.00
      );
    `);

    // Migrate existing DB schemas if locked_balance was missing
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_balance NUMERIC(15, 2) DEFAULT 0.00;
    `);
 
    await client.query(`
      CREATE TABLE IF NOT EXISTS deposits (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
        mp_payment_id VARCHAR(255) UNIQUE,
        amount NUMERIC(15, 2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP WITH TIME ZONE,
        expiration_at TIMESTAMP WITH TIME ZONE
      );
    `);
 
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
        amount NUMERIC(15, 2) NOT NULL,
        pix_key VARCHAR(255) NOT NULL,
        pix_key_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP WITH TIME ZONE
      );
    `);
 
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id VARCHAR(255) PRIMARY KEY,
        mp_payment_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('PostgreSQL tables checked/created successfully.');
  } catch (err: any) {
    console.error('Error creating database tables:', err.message);
  } finally {
    client.release();
  }
}
