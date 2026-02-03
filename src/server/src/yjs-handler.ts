
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { WebSocket } from "ws";

const docs = new Map<string, WSSharedDoc>();

const updateHandler = (update: Uint8Array, origin: any, doc: Y.Doc) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    (doc as WSSharedDoc).conns.forEach((_, conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
            conn.send(message);
        }
    });
};

class WSSharedDoc extends Y.Doc {
    conns: Map<WebSocket, Set<number>>;
    awareness: awarenessProtocol.Awareness;

    constructor(name: string) {
        super({ gc: true });
        this.conns = new Map();
        this.awareness = new awarenessProtocol.Awareness(this);
        this.awareness.setLocalState(null);

        this.awareness.on("update", ({ added, updated, removed }: any, conn: any) => {
            const changedClients = added.concat(updated).concat(removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1); // messageAwareness
            const buff = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients);
            encoding.writeVarUint8Array(encoder, buff);
            const message = encoding.toUint8Array(encoder);

            (this as WSSharedDoc).conns.forEach((_, c) => {
                if (c.readyState === WebSocket.OPEN) {
                    c.send(message);
                }
            });
        });

        this.on("update", updateHandler);
    }
}

const getYDoc = (docname: string, gc: boolean = true) => {
    let doc = docs.get(docname);
    if (doc === undefined) {
        doc = new WSSharedDoc(docname);
        doc.gc = gc;
        docs.set(docname, doc);
    }
    return doc;
};

export const setupWSConnection = (conn: WebSocket, req: any) => {
    conn.binaryType = "arraybuffer";
    const docname = req.url.slice(1).split("?")[0]; // Remove leading slash
    const doc = getYDoc(docname);
    doc.conns.set(conn, new Set());

    // Listen to ping
    conn.on("message", (message: ArrayBuffer) => {
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
            case 0: // Sync
                encoding.writeVarUint(encoder, 0);
                syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
                if (encoding.length(encoder) > 1) {
                    conn.send(encoding.toUint8Array(encoder));
                }
                break;
            case 1: // Awareness
                awarenessProtocol.applyAwarenessUpdate(
                    doc.awareness,
                    decoding.readVarUint8Array(decoder),
                    conn
                );
                break;
        }
    });

    conn.on("close", () => {
        closeConn(doc, conn);
    });

    // Send initial sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, doc);
    conn.send(encoding.toUint8Array(encoder));

    // Send awareness
    if (doc.awareness.getStates().size > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1);
        const buff = awarenessProtocol.encodeAwarenessUpdate(
            doc.awareness,
            Array.from(doc.awareness.getStates().keys())
        );
        encoding.writeVarUint8Array(encoder, buff);
        conn.send(encoding.toUint8Array(encoder));
    }
};

const closeConn = (doc: WSSharedDoc, conn: WebSocket) => {
    if (doc.conns.has(conn)) {
        const controlledIds = doc.conns.get(conn);
        doc.conns.delete(conn);
        if (controlledIds) {
            awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
        }
    }
    conn.close();
};
