import Profile from "./Profile.js";

class Peer {
    #localStream;
    #websocket;
    #rtcPeerConnectionConfig
    #peerConnection
    #remoteStream
    #profile
    #messageChannel;

    constructor(localStream, websocket, rtcPeerConnectionConfig) {
        this.#localStream = localStream;
        this.#websocket = websocket;
        this.#rtcPeerConnectionConfig = rtcPeerConnectionConfig;
        this.#peerConnection = null;
        this.#remoteStream = null;
        this.#profile = new Profile();
        this.#messageChannel = null;
    }

    static async from(signalingServerUrl, rtcPeerConnectionConfig, mediaConstraints) {
        const localStream = await navigator
            .mediaDevices
            .getUserMedia(mediaConstraints);
        
        const websocket = await new Promise((resolve, reject) => {
            const ws = new WebSocket(signalingServerUrl);
            ws.onopen = () => resolve(ws);
            ws.onerror = (err) => reject(err);
        });
        return new Peer(localStream, websocket, rtcPeerConnectionConfig);
    }

    localStream() {
        return this.#localStream;
    }

    websocket() {
        return this.#websocket;
    }

    peerConnection() {
        return this.#peerConnection;
    }

    remoteStream() {
        return this.#remoteStream;
    }

    profile() {
        return this.#profile;
    }

    isClosed() {
        return !this.#peerConnection || !this.#remoteStream || this.#peerConnection.connectionState === "closed";
    }

    messageChannel() {
        return this.#messageChannel;
    }

    async call(remoteUser) {
        this.hangUp();
        await this.#createPeerConnection();
        this.#messageChannel = this.#peerConnection.createDataChannel("message");
        const offer = await this.#peerConnection.createOffer();
        await this.#peerConnection.setLocalDescription(offer);
        this.#createAndSendSdp(remoteUser, "offer");
        this.#onIceCandidate(remoteUser);
        this.#onConnectionStateChange();
    }

    async createAnswer(remoteUser, offer) {
        this.hangUp();
        await this.#createPeerConnection();
        await this.#peerConnection.setRemoteDescription(offer);
        const answer = await this.#peerConnection.createAnswer();
        await this.#peerConnection.setLocalDescription(answer);
        this.#createAndSendSdp(remoteUser, "answer");
        this.#onIceCandidate(remoteUser);
        this.#onConnectionStateChange();
    }

    toggleCamera() {
        const videoTrack = this.#localStream.getTracks().find((track) => track.kind === 'video');
        const newState = !videoTrack.enabled;
        videoTrack.enabled = newState;
        return newState;
    }

    toggleMicrophone() {
        const audioTrack = this.#localStream.getTracks().find((track) => track.kind === 'audio');
        const newState = !audioTrack.enabled;
        audioTrack.enabled = newState;
        return newState;
    }

    hangUp() {
        if (this.#peerConnection) {
            this.#peerConnection.close();
            this.#peerConnection = null;
        }
        if (this.#remoteStream) {
            this.#remoteStream.getTracks().forEach(track => track.stop());
            this.#remoteStream = null;
        }
    }

    async #createPeerConnection() {
        this.#peerConnection = new RTCPeerConnection(this.#rtcPeerConnectionConfig);
        this.#remoteStream = new MediaStream();
        this.#localStream.getTracks().forEach((track) => {
            this.#peerConnection.addTrack(track, this.#localStream);
        });
        this.#peerConnection.ontrack = (event) => {
            event.streams[0].getTracks().forEach(track => {
                if (!this.#remoteStream.getTracks().some(t => t.id === track.id)) {
                    this.#remoteStream.addTrack(track);
                }
            });
        };
    }
    
    #onIceCandidate(remoteUser) {
        this.#peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                setTimeout(() => {
                    this.#websocket.send(JSON.stringify({
                        type: "new-ice-candidate",
                        to: remoteUser,
                        data: event.candidate
                    }));
                }, 1000);
            }
        };
    }

    #onConnectionStateChange() {
        this.#peerConnection.onconnectionstatechange = () => {
            const state = this.#peerConnection.connectionState;
            if (state === "disconnected" || state === "failed" || state === "closed") {
                this.hangUp();
            }
        };
    }

    async #createAndSendSdp(remoteUser, messageType) {
        this.#websocket.send(JSON.stringify({
            type: messageType,
            to: remoteUser,
            data: this.#peerConnection.localDescription
        }));
    }
}

export default Peer;
