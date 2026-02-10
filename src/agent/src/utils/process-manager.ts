import fs from 'fs';
import path from 'path';
import os from 'os';

const PID_DIR = path.join(os.homedir(), '.ccw');
const PID_FILE = path.join(PID_DIR, 'agent.pid');

export class ProcessManager {
    static savePid() {
        try {
            // Ensure directory exists
            if (!fs.existsSync(PID_DIR)) {
                fs.mkdirSync(PID_DIR, { recursive: true });
            }

            // Write current process PID
            fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
        } catch (error) {
            console.error('Failed to save PID:', error);
        }
    }

    static getPid(): number | null {
        try {
            if (fs.existsSync(PID_FILE)) {
                const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
                return isNaN(pid) ? null : pid;
            }
        } catch (error) {
            console.error('Failed to read PID:', error);
        }
        return null;
    }

    static removePid() {
        try {
            if (fs.existsSync(PID_FILE)) {
                fs.unlinkSync(PID_FILE);
            }
        } catch (error) {
            console.error('Failed to remove PID:', error);
        }
    }

    static isProcessRunning(pid: number): boolean {
        try {
            // Sending signal 0 checks if process exists without killing it
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }

    static stopProcess(pid: number): boolean {
        try {
            process.kill(pid, 'SIGTERM');
            return true;
        } catch (error) {
            console.error('Failed to stop process:', error);
            return false;
        }
    }
}
