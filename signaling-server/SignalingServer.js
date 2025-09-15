import http from "http";
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
        try {
            // TODO: check port, signalingTypes
            this.#host = host;
            this.#port = port;
            this.#signalingTypes = signalingTypes;
            this.#connectionList = [];
            this.#nextID = Date.now();
        } catch (error) {
            // TODO 
        }

    }

    start() {
        try {
            this.#setUpHTTPServer();
            this.#websocketServer = new WebSocketServer({ server: this.#httpServer });
            this.#setUp();
        } catch (error) {
            // TODO
        }
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

    #generateClientID(websocket, request) {
        websocket.clientID = this.#nextID++;
        this.#connectionList.push(websocket);
        websocket.send(JSON.stringify({ type: "id", id: websocket.clientID }));
        SignalingServer.log(`Assigned ID ${websocket.clientID} to connection from ${request.socket.remoteAddress}:${request.socket.remotePort}`);
    }

    #sendUserListToAll() {
        const userListMessage = JSON.stringify({
            type: "user-list",
            users: this.#connectionList.map((conn) => conn.username || conn.clientID),
        });
        for (const conn of this.#connectionList) {
            if (conn.readyState === WebSocket.OPEN) {
                conn.send(userListMessage);
            }
        }
    }

    #setUp() {
        this.#websocketServer.on("connection", (websocket, request) => {
            SignalingServer.log(`New connection from ${request.socket.remoteAddress}:${request.socket.remotePort}`);
            this.#generateClientID(websocket, request);
            this.#onmessage(websocket, request);
            this.#onclose(websocket, request);
            this.#sendUserListToAll();
        });
    }

    #onmessage(websocket, request) {
        websocket.on("message", (data) => {
            let message;
            try {
                message = JSON.parse(data.toString());
                if (message.hasOwnProperty("type") === false) {
                    throw new Error("Message missing 'type' property");
                }
            } catch(error) {
                SignalingServer.log(`Error parsing message from ${request.socket.remoteAddress}:${request.socket.remotePort} with id ${websocket.id}: ${error}`);
                // TODO 
                return;
            }
            if (this.#signalingTypes.includes(message.type)) {
                // TODO relay message 
                this.#relaySignalingMessage(websocket, request, message);
            } else if (message.type === "set-username") {
                this.#setUsername(websocket, request, message);
            } else {
                // TODO handle unknown message type
            }
        });
    }
    #relaySignalingMessage(websocket, request, message) {
        // {
        //     type: "offer" | "answer" | "new-ice-candidate",
        //     to: string, // username or clientID of the target user
        //     from?: string, // optional, will be filled in by the server
        //     data: any // the actual signaling data (SDP or ICE candidate)
        // }
        if ( 
            !message.hasOwnProperty("to") && 
            !message.hasOwnProperty("data")) {
            // TODO 
            return;
        }
        message.from = websocket.username || websocket.clientID;
        const target = message.to;
        const targetConnection = this.#connectionList.find((conn) => (conn.username === target || conn.clientID == target) && conn.readyState === WebSocket.OPEN);
        if (!targetConnection) {
            // TODO handle error: target user not found or not connected
            return;
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
        if (!message.hasOwnProperty("username")) {
            // TODO handle error
            return;
        }
        const originalUsername = message.username.trim().toLowerCase();
        if (originalUsername.length === 0) {
            // TODO handle error
            return;
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
        SignalingServer.log(`Set username for connection from ${request.socket.remoteAddress}:${request.socket.remotePort} with id ${websocket.clientID} to ${desiredUsername}`);
        this.#sendUserListToAll();
    }

    #isUsernameUnique(username) {
        return !this.#connectionList.some((conn) => conn.username === username);
    }

    #onclose(websocket, request) {
        websocket.on("close", () => {
                this.#connectionList = this.#connectionList.filter((conn) => conn.readyState === WebSocket.OPEN);
                this.#sendUserListToAll();
                SignalingServer.log(`Connection from ${request.socket.remoteAddress}:${request.socket.remotePort} with id ${websocket.clientID} closed`);
            });
    }

    host() {
        return this.#host;
    }

    port() {
        return this.#port;
    }

    static log(text) {
        const time = new Date();
        console.log(`[${time.toLocaleTimeString()}] ${text}`);
    }

}

export default SignalingServer;