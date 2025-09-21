import Profile from "./Profile.js";

class Peer {
    #localStream;
    #websocket;
    #rtcPeerConnectionConfig
    #peerConnection
    #remoteStream
    #profile

    constructor(localStream, websocket, rtcPeerConnectionConfig) {
        this.#localStream = localStream;
        this.#websocket = websocket;
        this.#rtcPeerConnectionConfig = rtcPeerConnectionConfig;
        this.#peerConnection = null;
        this.#remoteStream = null;
        this.#profile = new Profile();
    }

    static async from(signalingServerUrl, rtcPeerConnectionConfig, mediaConstraints) {
        const localStream = await navigator
            .mediaDevices
            .getUserMedia(mediaConstraints);
        // missing onclose and onopen config
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

    async call(remoteUser) {
        await this.#createPeerConnection();
        const offer = await this.#peerConnection.createOffer();
        await this.#peerConnection.setLocalDescription(offer);
        this.#createAndSendSdp(remoteUser, "offer");
        this.#onIceCandidate(remoteUser);
        this.#onConnectionStateChange();
    }

    async createAnswer(remoteUser, offer) {
        await this.#createPeerConnection();
        await this.#peerConnection.setRemoteDescription(offer);
        const answer = await this.#peerConnection.createAnswer();
        await this.#peerConnection.setLocalDescription(answer);
        this.#createAndSendSdp(remoteUser, "answer");
        this.#onIceCandidate(remoteUser);
        this.#onConnectionStateChange();
    }

    // toggle and return new state
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
    // ICE Candidate Exchange: Potential timing issues with ICE candidate exchange
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
        // this.#peerConnection.onicecandidate = (event) => {
        //     if (event.candidate) {
        //         this.#websocket.send(JSON.stringify({
        //             type: "new-ice-candidate",
        //             to: remoteUser,
        //             data: event.candidate
        //         }));
        //     }
        // };
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
        // await new Promise(resolve => {
        //     if (this.#peerConnection.iceGatheringState === "complete") {
        //         resolve();
        //     } else {
        //         this.#peerConnection.onicegatheringstatechange = () => {
        //             if (this.#peerConnection.iceGatheringState === "complete") {
        //                 resolve();
        //             }
        //         };
        //     }
        // });
        //
        // or
        //
        // if (this.#peerConnection.iceGatheringState !== 'complete') {
        //     await new Promise((resolve) => {
        //         const checkState = () => {
        //             if (this.#peerConnection.iceGatheringState === 'complete') {
        //                 resolve();
        //             } else {
        //                 this.#peerConnection.addEventListener('icegatheringstatechange', checkState, { once: true });
        //             }
        //         };
        //         checkState();
        //     });
        // }
        //
        // or send sdp immediately
        this.#websocket.send(JSON.stringify({
            type: messageType,
            to: remoteUser,
            data: this.#peerConnection.localDescription
        }));
    }
}

export default Peer;
