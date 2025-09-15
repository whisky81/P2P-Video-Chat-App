import SignalingServer from "./SignalingServer.js";

const PORT = 8000;
const SIGNALING_TYPES = ["offer", "answer", "new-ice-candidate"];
const server = new SignalingServer("0.0.0.0", PORT, SIGNALING_TYPES);
server.start();