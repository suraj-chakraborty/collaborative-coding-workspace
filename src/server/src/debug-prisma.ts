
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
console.log("Keys on prisma:", Object.keys(prisma));
console.log("prisma.apiKey type:", typeof (prisma as any).apiKey);
