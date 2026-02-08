#!/usr/bin/env node
import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import { ConfigManager } from "./config-manager";
import { startAgent } from "./index";

const program = new Command();

program
    .name("collab-agent")
    .description("Local agent for the Collaborative Coding Workspace")
    .version("1.0.0");

program
    .command("start")
    .description("Start the local agent")
    .option("-s, --server <url>", "Server URL")
    .option("-u, --user <id>", "User ID")
    .option("-t, --token <key>", "Agent Key / Token")
    .action(async (options) => {
        console.log(chalk.blue.bold("\n🚀 Collab Cloud Local Agent 🚀\n"));

        const config = await ConfigManager.getMergedConfig();

        const finalConfig = {
            serverUrl: options.server || config.serverUrl,
            userId: options.user || config.userId,
            authToken: options.token || config.authToken
        };

        if (!finalConfig.userId) {
            console.log(chalk.yellow("⚠️  No User ID found. Running configuration wizard...\n"));
            await runConfigWizard();
            return;
        }

        await startAgent(finalConfig);
    });

program
    .command("config")
    .description("Configure the agent settings")
    .action(async () => {
        await runConfigWizard();
    });

async function runConfigWizard() {
    const existingConfig = await ConfigManager.loadConfig();

    console.log(chalk.blue.bold("\n🛠️  Agent Configuration Wizard 🛠️\n"));

    const answers = await inquirer.prompt([
        {
            type: "input",
            name: "serverUrl",
            message: "What is the Cloud Backend URL?",
            default: existingConfig?.serverUrl || "https://collaborative-coding-workspace-1.onrender.com"
        },
        {
            type: "input",
            name: "userId",
            message: "What is your User ID? (Copy from Dashboard)",
            default: existingConfig?.userId,
            validate: (input) => input.trim() ? true : "User ID is required"
        },
        {
            type: "input",
            name: "authToken",
            message: "What is your Agent Key / Auth Token?",
            default: existingConfig?.authToken || "dev-agent-key"
        }
    ]);

    await ConfigManager.saveConfig(answers);
    console.log(chalk.green.bold("\n✅ Configuration saved to ~/.collab-cloud/config.json\n"));
    console.log("Run " + chalk.cyan("collab-agent start") + " to begin.");
}

program.parse(process.argv);

// If no arguments, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
