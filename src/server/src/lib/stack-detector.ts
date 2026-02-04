export type StackType =
    | "node"
    | "deno"
    | "rust"
    | "python"
    | "go"
    | "java"
    | "php"
    | "unknown";

export function detectStack(files: string[]): StackType {
    const fileSet = new Set(files.map(f => f.toLowerCase()));

    if (fileSet.has("package.json")) return "node";
    if (fileSet.has("deno.json") || fileSet.has("deno.jsonc")) return "deno";
    if (fileSet.has("cargo.toml")) return "rust";
    if (fileSet.has("pyproject.toml") || fileSet.has("requirements.txt")) return "python";
    if (fileSet.has("go.mod")) return "go";
    if (fileSet.has("pom.xml") || fileSet.has("build.gradle")) return "java";
    if (fileSet.has("composer.json")) return "php";

    return "unknown";
}
