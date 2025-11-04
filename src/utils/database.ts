// import mysql2 from "mysql2";

// const pool = mysql2.createPool({
//   user: "root",
//   password: "",
//   database: "safeMove",
//   charset: "utf8mb4",
//   host: "localhost",
//   connectTimeout: 10_000,
//   multipleStatements: true
// });


import { Pool } from 'pg'

// Direct PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING + "&sslmode=no-verify",
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: false }
});

pool.on("connect", (client) => {
  console.log(client);
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Test connection on startup (optional but recommended)
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    console.log('✅ Connected to Supabase PostgreSQL successfully!');
    console.log('PostgreSQL version:', result.rows[0].version);
    client.release();
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
  }
};

testConnection();

export default pool;