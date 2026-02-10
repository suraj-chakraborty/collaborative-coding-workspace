
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

// Load root .env
dotenv.config({ path: path.join(__dirname, "../../../.env") });

console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Defined" : "Undefined");

const prisma = new PrismaClient();

async function main() {
    console.log("Verifying Prisma Client...");

    try {
        // 1. Check if we can count users (basic check)
        const userCount = await prisma.user.count();
        console.log(`User count: ${userCount}`);

        // 2. Check if we can access the apiKey property
        // @ts-ignore
        if (!prisma.apiKey) {
            console.error("❌ prisma.apiKey is undefined! You need to run 'prisma generate'.");
            process.exit(1);
        }
        console.log("✅ prisma.apiKey exists.");

        // 3. Try to create a dummy user and api key if possible, or just list keys
        // We'll just check if we can count keys
        // @ts-ignore
        const keyCount = await prisma.apiKey.count();
        console.log(`ApiKey count: ${keyCount}`);

    } catch (e) {
        console.error("❌ Error during verification:", e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
