export type StackType =
    | "node"
    | "nextjs"
    | "deno"
    | "rust"
    | "python"
    | "go"
    | "java"
    | "php"
    | "unknown";

export function detectStack(files: string[]): StackType {
    const fileSet = new Set(files.map(f => f.toLowerCase()));

    // Precise matches for root files first
    if (fileSet.has("next.config.js") || fileSet.has("next.config.mjs")) return "nextjs";
    if (fileSet.has("package.json")) return "node";
    if (fileSet.has("deno.json") || fileSet.has("deno.jsonc")) return "deno";
    if (fileSet.has("cargo.toml")) return "rust";
    if (fileSet.has("pyproject.toml") || fileSet.has("requirements.txt")) return "python";
    if (fileSet.has("go.mod")) return "go";
    if (fileSet.has("pom.xml") || fileSet.has("build.gradle")) return "java";
    if (fileSet.has("composer.json")) return "php";

    // Recursive matches (if not at root)
    if (files.some(f => f.toLowerCase().endsWith("next.config.js") || f.toLowerCase().endsWith("next.config.mjs"))) return "nextjs";
    if (files.some(f => f.toLowerCase().endsWith("package.json"))) return "node";
    if (files.some(f => f.toLowerCase().endsWith("cargo.toml"))) return "rust";
    if (files.some(f => f.toLowerCase().endsWith("requirements.txt"))) return "python";

    return "unknown";
}
