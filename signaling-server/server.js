import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = 8000;

const log = (text) => {
    const time = new Date();
    console.log(`[${time.toLocaleTimeString()}] ${text}`);
};

const httpServer = http.createServer();
httpServer.listen({
    host: "0.0.0.0",
    port: PORT
}, () => {
    log(`Server is listening on http://localhost:${PORT}`);
});

const websocketServer = new WebSocketServer({ server: httpServer });

let connectionList = [];
let nextID = Date.now();

websocketServer.on("connection", (ws, req) => {
    log(`New connection from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
    generateClientID(ws, req);
    onmessage(ws, req);
    onclose(ws, req);
    sendUserListToAll();
});

function generateClientID(ws, req) {
    ws.clientID = nextID++;
    connectionList.push(ws);
    ws.send(JSON.stringify({ type: "id", id: ws.clientID }));
    log(`Assigned ID ${ws.clientID} to connection from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
}

function onmessage(ws, req) {
    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (err) {
            handleError(ws, "invalid-json", "Could not parse JSON");
            log(`Error parsing message from ${req.socket.remoteAddress}:${req.socket.remoteAddress}: ${err}`);
            return;
        }

        // Handle WebRTC signaling messages
        if (msg.type === "webrtc-signaling") {
            handleWebRTCSignaling(ws, msg);
            return;
        }

        // Handle regular messages
        if (msg.type === "message") {
            handleChatMessage(ws, msg);
        } else if (msg.type === "set-username") {
            handleSetUsername(ws, msg, req);
        } else {
            handleError(ws, "unknown-type", `Unknown message type: ${msg.type}`);
        }
    });
}

function handleWebRTCSignaling(ws, msg) {
    const { target, data } = msg;

    if (!target) {
        handleError(ws, "invalid-target", "Target user not specified for WebRTC signaling");
        return;
    }

    const targetConnection = connectionList.find(conn =>
        conn.username === target && conn.readyState === WebSocket.OPEN
    );

    if (!targetConnection) {
        handleError(ws, "target-not-found", `Target user ${target} not found or not connected`);
        return;
    }

    // Forward the signaling message to the target user
    targetConnection.send(JSON.stringify({
        type: "webrtc-signaling",
        from: ws.username || ws.clientID,
        data: data
    }));

    log(`Forwarded WebRTC signaling message from ${ws.username} to ${target}`);
}

function handleChatMessage(ws, msg) {
    const conn = getConnectionForID(ws.clientID);
    msg.username = conn?.username || "anonymous";

    if (msg.target) {
        sendToOneUser(msg.target, JSON.stringify(msg));
        log(`Relayed message from ${msg.username} to ${msg.target}`);
    } else {
        broadcastMessage(JSON.stringify(msg));
        log(`Broadcasted message from ${msg.username}`);
    }
}

function handleSetUsername(ws, msg, req) {
    if (!msg.hasOwnProperty("username")) {
        ws.send(JSON.stringify({ type: "username-rejected", reason: "Username not provided" }));
        return;
    }

    let originalUsername = msg.username.trim().toLowerCase();
    if (!originalUsername) {
        ws.send(JSON.stringify({ type: "username-rejected", reason: "Username cannot be empty" }));
        return;
    }

    let newUsername = originalUsername;
    let counter = 1;
    while (!isUsernameUnique(newUsername)) {
        newUsername = `${originalUsername}${counter++}`;
    }

    ws.username = newUsername;
    ws.send(JSON.stringify({ type: "username-accepted", username: newUsername }));
    sendUserListToAll();
    log(`User ${newUsername} connected from ${req.socket.remoteAddress}`);
}

function broadcastMessage(message) {
    for (const c of connectionList) {
        try {
            if (c.readyState === WebSocket.OPEN) {
                c.send(message);
            }
        } catch (err) {
            log(`Error sending message: ${err}`);
        }
    }
}

function handleError(ws, errorType, message) {
    ws.send(JSON.stringify({ type: errorType, message }));
}

function onclose(ws, req) {
    ws.on("close", () => {
        connectionList = connectionList.filter((conn) => conn.readyState === WebSocket.OPEN);
        sendUserListToAll();
        log(`Connection from ${req.socket.remoteAddress}:${req.socket.remotePort} closed`);
    });
}

function generateUserListMessage() {
    return JSON.stringify({
        type: "userlist",
        users: connectionList.map((conn) => conn.username),
    });
}

function sendUserListToAll() {
    const userListMsgStr = generateUserListMessage();
    for (const conn of connectionList) {
        conn.send(userListMsgStr);
    }
}

function sendToOneUser(target, message) {
    const user = connectionList.find((c) => c.username === target);
    if (user && user.readyState === WebSocket.OPEN) {
        user.send(message);
    }
}

function isUsernameUnique(username) {
    return !connectionList.some((conn) => conn.username === username);
}

function getConnectionForID(id) {
    return connectionList.find((conn) => conn.clientID === id) || null;
}