import chalk from 'chalk';

export interface AgentStatus {
    connected: boolean;
    agentId?: string;
    uptime: number;
    containersRunning: number;
    requestsProxied: number;
    serverUrl: string;
}

export class StatusDisplay {
    private status: AgentStatus;
    private startTime: number;
    private updateInterval?: NodeJS.Timeout;

    constructor(serverUrl: string) {
        this.status = {
            connected: false,
            uptime: 0,
            containersRunning: 0,
            requestsProxied: 0,
            serverUrl
        };
        this.startTime = Date.now();
    }

    start() {
        this.updateInterval = setInterval(() => {
            this.status.uptime = Math.floor((Date.now() - this.startTime) / 1000);
            this.render();
        }, 1000);
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    updateConnection(connected: boolean, agentId?: string) {
        this.status.connected = connected;
        if (agentId) {
            this.status.agentId = agentId;
        }
        this.render();
    }

    incrementContainers() {
        this.status.containersRunning++;
        this.render();
    }

    decrementContainers() {
        this.status.containersRunning = Math.max(0, this.status.containersRunning - 1);
        this.render();
    }

    incrementRequests() {
        this.status.requestsProxied++;
    }

    private render() {
        // Clear previous lines (move cursor up and clear)
        if (this.status.uptime > 0) {
            process.stdout.write('\x1b[8A\x1b[J');
        }

        const statusIcon = this.status.connected ? chalk.green('✓') : chalk.red('✗');
        const statusText = this.status.connected ? chalk.green('Connected') : chalk.red('Disconnected');

        console.log(chalk.gray('━'.repeat(50)));
        console.log(`${statusIcon} Status: ${statusText}`);
        if (this.status.agentId) {
            console.log(chalk.cyan(`🆔 Agent ID: ${this.status.agentId}`));
        }
        console.log(chalk.yellow(`⏱️  Uptime: ${this.formatUptime(this.status.uptime)}`));
        console.log(chalk.blue(`🐳 Containers: ${this.status.containersRunning} running`));
        console.log(chalk.magenta(`📦 Requests proxied: ${this.status.requestsProxied}`));
        console.log(chalk.gray('━'.repeat(50)));
        console.log(chalk.dim(`Press Ctrl+C or run 'CCW stop' to exit`));
    }

    private formatUptime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
}
