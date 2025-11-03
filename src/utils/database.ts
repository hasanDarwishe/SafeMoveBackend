import mysql2 from "mysql2";

const pool = mysql2.createPool({
  user: "if0_40324273",
  password: "hasandarwish",
  database: "if0_40324273_safe_move",
  charset: "utf8mb4",
  host: "sql100.infinityfree.com",
  connectTimeout: 10_000,
  multipleStatements: true
})

// connection.connect((err) => {
//   if(err) {
//     console.error("Error connecting to database;", err);
//   }
//   else {
//     console.log("Connected to database successfully! Thread ID:", connection.threadId);
//   }
// });

pool.on('connection', (connection) => {
  console.log('New database connection established! thread ID:', connection.threadId);
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

const db = pool;

export default db;