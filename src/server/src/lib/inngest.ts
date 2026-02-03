import { Inngest } from "inngest";

// Define the event types for the app
export type InngestEvents = {
    "workspace/setup": {
        data: {
            workspaceId: string;
        };
    };
};

export const inngest = new Inngest({
    id: "collab-cloud-server",
    // Only use the event key if it's provided and looks like a real key (not 'local')
    eventKey: (process.env.INNGEST_EVENT_KEY && process.env.INNGEST_EVENT_KEY !== 'local')
        ? process.env.INNGEST_EVENT_KEY
        : undefined,
});
