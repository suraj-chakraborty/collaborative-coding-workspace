import path from "path";

export const CONFIG = {
    // Current working directory is src/server
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || path.join(process.cwd(), "workspaces"),
    DOCKER_IMAGE: "codercom/code-server:latest",
    CONTAINER_PORT: 8080,
    MEMORY_LIMIT: 1024 * 1024 * 512, // 512MB
    CPU_QUOTA: 50000, // 50% of one core
    STACK_IMAGES: {
        node: "linuxserver/code-server:latest",
        rust: "linuxserver/code-server:latest",
        python: "linuxserver/code-server:latest",
        go: "linuxserver/code-server:latest",
        java: "linuxserver/code-server:latest",
        php: "linuxserver/code-server:latest",
        unknown: "linuxserver/code-server:latest"
    } as Record<string, string>,
    AWS: {
        REGION: process.env.AWS_REGION || "us-east-1",
        ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
        SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
        ECS_CLUSTER: process.env.AWS_ECS_CLUSTER || "default",
        ECS_TASK_DEFINITION: process.env.AWS_ECS_TASK_DEFINITION || "code-server-task",
        VPC_SUBNETS: (process.env.AWS_VPC_SUBNETS || "").split(",").filter(Boolean),
        SECURITY_GROUPS: (process.env.AWS_SECURITY_GROUPS || "").split(",").filter(Boolean)
    }
};
