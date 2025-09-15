import SignalingServer from "./SignalingServer.js";

const PORT = 8000;
const SIGNALING_TYPES = ["offer", "answer", "new-ice-candidate"];

async function main() {
    try {
        const server = new SignalingServer("0.0.0.0", PORT, SIGNALING_TYPES);
        server.start();
        server.httpServer().on("error", (error) => {
            let setUpError;
            if (error.code === "EADDRINUSE") {
                setUpError = new Error("Port is already in use. Try another port");
            } else if (error.code === "EACCES") {
                setUpError = new Error("Permission denied. Try a port > 1024 or run with privileges");
            } else {
                setUpError = new Error("Unexpected server error: ", error);
            }
            throw setUpError;
        });
    } catch (error) {
        console.error(error);
    }
}

main();