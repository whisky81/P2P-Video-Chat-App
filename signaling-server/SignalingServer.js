import http from "http";
import { type } from "os";
import { WebSocketServer, WebSocket } from "ws";

class SignalingServer {
    #host
    #port;
    #signalingTypes;
    #connectionList;
    #nextID;
    #websocketServer;
    #httpServer;

    constructor(host, port, signalingTypes) {
        if (!this.#validateInputArgs(host, port, signalingTypes)) {
            throw new Error("Illegal arguments");
        }
        this.#host = host.trim();
        this.#port = port;
        this.#signalingTypes = signalingTypes;
        this.#connectionList = [];
        this.#nextID = Date.now();
    }

    start() {
        try {
            this.#setUpHTTPServer();
            this.#websocketServer = new WebSocketServer({ server: this.#httpServer });
            this.#setUpConnectionHandler();
        } catch (error) {
            throw error;
        }
    }

    host() {
        return this.#host;
    }

    port() {
        return this.#port;
    }

    httpServer() {
        return this.#httpServer;
    }

    static log(text) {
        const time = new Date();
        console.log(`[${time.toLocaleTimeString()}] ${text}`);
    }

    #validateInputArgs(host, port, signalingTypes) {
        const octet = host.trim().split(".");
        if (octet.length !== 4) return false;
        for (let num of octet) {
            num = Number(num);
            if (num < 0 || num > 255) return false;
        }
        return port >= 1024 && port < 65536 && signalingTypes && signalingTypes.length > 0;
    }

    #setUpHTTPServer() {
        this.#httpServer = http.createServer();
        this.#httpServer.listen({
            host: this.host(),
            port: this.port()
        }, () => {
            SignalingServer.log(`Server is listening on http://${this.host()}:${this.port()}`);
        });
    }

    #setUpConnectionHandler() {
        this.#websocketServer.on("connection", (websocket, request) => {
            SignalingServer.log(`New connection from ${request.socket.remoteAddress}:${request.socket.remotePort}`);
            this.#generateClientID(websocket, request);
            this.#onmessage(websocket, request);
            this.#onclose(websocket, request);
            this.#onerror(websocket, request);
            this.#sendUserListToAll();
        });
    }

    #onmessage(websocket, request) {
        websocket.on("message", (data) => {
            const addr = request?.socket?.remoteAddress ?? "unknown";
            const port = request?.socket?.remotePort ?? "unknown";
            try {
                let message;
                try {
                    message = JSON.parse(data.toString());
                    if (message.hasOwnProperty("type") === false) {
                        throw new Error("Message missing 'type' property");
                    }
                } catch (error) {
                    SignalingServer.log(`Error parsing message from ${addr}:${port} with id ${websocket.id}: ${error}`);
                    return;
                }
                if (this.#signalingTypes.includes(message.type)) {
                    this.#relaySignalingMessage(websocket, request, message);
                } else if (message.type === "set-username") {
                    this.#setUsername(websocket, request, message);
                } else if (message.type === "metadata-file") {
                    // {
                    //     type: "metadata-file",
                    //     to: "",
                    //     metadata: {}
                    // }
                    this.#relayMessage(websocket, message);
                } else {
                    websocket.send(JSON.stringify({
                        type: "unknow-type"
                    }));
                }
            } catch (error) {
                SignalingServer.log(
                    `Unexpected error while handling message from ${addr}:${port} (id=${websocket.id}): ${error.message}\n${error.stack}`
                );
            }
        });
    }

    #onclose(websocket, request) {
        websocket.on("close", () => {
            this.#connectionList = this.#connectionList.filter((conn) => conn.readyState === WebSocket.OPEN);
            this.#sendUserListToAll();
            SignalingServer.log(`Connection from ${request.socket.remoteAddress}:${request.socket.remotePort} with id ${websocket.clientID} closed`);
        });
    }

    #onerror(websocket, request) {
        websocket.on('error', (err) => {
            const addr = request?.socket?.remoteAddress ?? "unknown";
            const port = request?.socket?.remotePort ?? "unknown";
            SignalingServer.log(
                `Got an error from connection ${websocket.username || websocket.clientID}-${addr}:${port}: ${err}`
            );
        });
    }

    #relaySignalingMessage(websocket, request, message) {
        if (
            !message.hasOwnProperty("to") &&
            !message.hasOwnProperty("data")) {
            throw new Error(`Message must have this layout {
                type: 'offer' | 'answer' | 'new-ice-candidate',
                to: string // username of the taget user
                data: sdp | ice-candiate // the actual signaling data (SDP or ICE candidate)
            }`)
        }
        this.#relayMessage(websocket, message);
    }

    #relayMessage(websocket, message) {
        message.from = websocket.username || websocket.clientID;
        const target = message.to;
        const targetConnection = this.#connectionList.find((conn) => (conn.username === target || conn.clientID == target) && conn.readyState === WebSocket.OPEN);
        if (!targetConnection) {
            throw new Error("Invalid remote user");
        }
        targetConnection.send(JSON.stringify(message));
        SignalingServer.log(`Relayed ${message.type} message from ${message.from} to ${target}`);
    }

    /**  
     * @param {Object} message 
     * @param {string} message.type - should be "set-username"
     * @param {string} message.username
     */
    #setUsername(websocket, request, message) {
        const addr = request?.socket?.remoteAddress ?? "unknown";
        const port = request?.socket?.remotePort ?? "unknown";
        if (!message.hasOwnProperty("username")) {
            throw new Error("Invalid message: missing 'username'");
        }
        const originalUsername = message.username ? message.username.trim().toLowerCase() : "peer";
        if (originalUsername.length === 0) {
            throw new Error("Invalid message: username cannot be empty");
        }
        let desiredUsername = originalUsername;
        let suffix = 1;
        while (!this.#isUsernameUnique(desiredUsername)) {
            desiredUsername = `${originalUsername}${suffix++}`;
        }
        websocket.username = desiredUsername;
        websocket.send(JSON.stringify({
            type: "username-accepted",
            username: desiredUsername
        }));
        SignalingServer.log(`Set username for connection from ${addr}:${port} with id ${websocket.clientID} to ${desiredUsername}`);
        this.#sendUserListToAll();
    }

    #isUsernameUnique(username) {
        return !this.#connectionList.some((conn) => conn.username === username);
    }

    #generateClientID(websocket, request) {
        const addr = request?.socket?.remoteAddress ?? "unknown";
        const port = request?.socket?.remotePort ?? "unknown";
        if (websocket.readyState !== WebSocket.OPEN) {
            SignalingServer.log(`Cannot send id to ${addr}:${port}, websocket not open`);
            return;
        }
        websocket.clientID = this.#nextID++;
        this.#connectionList.push(websocket);
        websocket.send(JSON.stringify({ type: "id", id: websocket.clientID }));
        SignalingServer.log(`Assigned ID ${websocket.clientID} to connection from ${addr}:${port}`);
    }

    #sendUserListToAll() {
        const userListMessage = JSON.stringify({
            type: "user-list",
            users: this.#connectionList.map((conn) => conn.username || conn.clientID),
        });
        for (const conn of this.#connectionList) {
            try {
                if (conn.readyState === WebSocket.OPEN) {
                    conn.send(userListMessage);
                }
            } catch (error) {
                SignalingServer.log(`
                    Got an error while sending message to ${conn.username || conn.clientID}: ${error.message}`
                );
            }
        }
    }
}

export default SignalingServer;