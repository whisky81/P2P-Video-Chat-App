export const RTC_PEER_CONNECTION_CONFIG = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302",
                "stun:stun3.l.google.com:19302",
                "stun:stun4.l.google.com:19302"
            ]
        }
    ]
};
export const MEDIA_CONSTRAINTS = {
    video: true,
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
};
export const SIGNALING_SERVER_URL = "wss://defc9e396a06.ngrok-free.app"; // will be update later when start signaling server
