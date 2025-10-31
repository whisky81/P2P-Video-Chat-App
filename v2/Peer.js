
class Connection {
    #websocket;
    constructor(websocket) {
        this.#websocket = websocket;
    }
    static async from(signalingServerUrl) {
        const websocket = await new Promise((resolve, reject) => {
            const ws = new WebSocket(signalingServerUrl);
            ws.onopen = () => resolve(ws);
            ws.onerror = (err) => reject(err);
        });
        return new Connection(websocket);
    }
    websocket() {
        return this.#websocket;
    }
}

