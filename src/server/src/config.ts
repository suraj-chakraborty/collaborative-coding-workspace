import path from "path";

export const CONFIG = {
    // Current working directory is src/server
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || path.join(process.cwd(), "workspaces"),
    DOCKER_IMAGE: "codercom/code-server:latest",
    CONTAINER_PORT: 8080,
    MEMORY_LIMIT: 1024 * 1024 * 512, // 512MB
    CPU_QUOTA: 50000, // 50% of one core
};
