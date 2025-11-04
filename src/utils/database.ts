// import mysql2 from "mysql2";
// import { createClient } from '@supabase/supabase-js'

// const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

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
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 10_000,
  ssl: { rejectUnauthorized: false }
});

pool.on("connect", (client) => {
  console.log(client);
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export default pool;