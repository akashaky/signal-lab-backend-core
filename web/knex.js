import knex from "knex";
import dotenv from "dotenv";
dotenv.config();

const KnexClient = knex({
  client: "mysql2",
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ?? 3306,
  },
  pool: { min: 0, max: 10 },
  // debug: true, // optional
});

export default KnexClient;
