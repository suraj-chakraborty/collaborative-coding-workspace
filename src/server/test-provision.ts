import { DockerService } from "./src/services/docker";
import { prisma } from "./src/lib/prisma";

async function test() {
    const workspaceId = "cml6vtv4n0000e8x5zhd470mz";
    console.log(`Testing startContainer for ${workspaceId}...`);
    try {
        const result = await DockerService.startContainer(workspaceId);
        console.log("Start Result:", result);
    } catch (e: any) {
        console.error("Test Error:", e);
        if (e.cause) console.error("Error Cause:", JSON.stringify(e.cause, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

test();
