import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

console.log("Prisma initialized with Prisma 7 adapter in shared lib.");
