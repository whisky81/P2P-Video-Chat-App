class Peer {
    #id;
    #websocket;
    #username;
    #availableUsers;
    #localStream;
    #rtcPeerConnectionConfig

    constructor(localStream, websocket, rtcPeerConnectionConfig) {
        this.#localStream = localStream;
        this.#websocket = websocket;
        this.#rtcPeerConnectionConfig = rtcPeerConnectionConfig;
    }

    static async from(url, rtcPeerConnectionConfig) {
        try {
            const localStream = await navigator
                .mediaDevices
                .getUserMedia({
                    video: true,
                    audio: true
                });
            const websocket = new WebSocket(url);
            return new Peer(localStream, websocket, rtcPeerConnectionConfig);
        } catch (error) {
            // TODO 
        }
    }

    async #createPeerConnection() {
        try {
            const peerConnection = new RTCPeerConnection(this.#rtcPeerConnectionConfig);
            const remoteStream = new MediaStream();
            this.#localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, this.#localStream);
            });
            peerConnection.ontrack = (event) => {
                event.streams[0].getTracks().forEach((track) => {
                    remoteStream.addTrack(track);
                });
            };
            return { peerConnection, remoteStream };
        } catch (error) {
            console.log("\r\n\r\n");
            console.error(error);
            console.log("\r\n\r\n");
        }
    }

    async createOffer(remoteUser) {
        try {
            const { peerConnection, remoteStream } = await this.#createPeerConnection();
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.#websocket.send(JSON.stringify({
                        type: "new-ice-candidate",
                        to: remoteUser,
                        data: event.candidate
                    }));
                }
            };
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            this.#websocket.send(JSON.stringify({
                type: "offer",
                to: remoteUser,
                data: offer
            }));
            return { peerConnection, remoteStream };
        } catch (error) {
            console.log("\r\n\r\n");
            console.error(error);
            console.log("\r\n\r\n");
        }
    }

    async createAnswer(remoteUser, offer) {
        try {
            const { peerConnection, remoteStream } = await this.#createPeerConnection();
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.#websocket.send(JSON.stringify({
                        type: "new-ice-candidate",
                        to: remoteUser,
                        data: event.candidate
                    }));
                }
            };
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            this.#websocket.send(JSON.stringify({
                type: "answer",
                to: remoteUser,
                data: answer
            }));
            return { peerConnection, remoteStream };
        } catch (error) {
            console.log("\r\n\r\n");
            console.error(error);
            console.log("\r\n\r\n");
        }
    }

    assignId(newId) {
        // TODO 
        this.#id = newId;
    }

    assignUsername(newUsername) {
        // TODO: is username valid
        this.#username = newUsername;
    }

    assignAvailableUsers(availableUsers) {
        this.#availableUsers = availableUsers.filter((user) => user !== this.#username);
    }

    id() {
        return this.#id;
    }

    websocket() {
        return this.#websocket;
    }

    username() {
        return this.#username;
    }

    availableUsers() {
        return this.#availableUsers;
    }

    localStream() {
        return this.#localStream;
    }
}

let localPeer = document.getElementById('local-peer');
let remotePeer = document.getElementById('remote-peer');
let availableUsersElement = document.getElementById('available-users');
let usernameElement = document.getElementById('username');
let peerConnection, remoteStream;

const RTC_PEER_CONNECTION_CONFIG = {
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

const URL = "ws://localhost:8000";

async function main() {
    try {
        const peer = await Peer.from(URL, RTC_PEER_CONNECTION_CONFIG);
        localPeer.srcObject = peer.localStream();
        peer.websocket().onmessage = async (message) => {
            await onMessageHandler(peer, message.data);
        }
        peer.websocket().onerror = async (message) => {
            console.error(message);
        }
    } catch (error) {
        console.error(error);
        alert(error.message || "Unknow Error");
    }
}

main();

async function onMessageHandler(peer, data) {
    const message = JSON.parse(data);

    console.log("\r\n\r\n");
    console.log(message);
    console.log("\r\n\r\n");

    switch (message.type) {
        case "id":
            peer.assignId(message.id);
            const username = prompt("Enter your username:");
            peer.websocket().send(JSON.stringify({
                type: "set-username",
                username: username,
            }));
            break;
        case "user-list":
            peer.assignAvailableUsers(message.users);
            updateAvailableUsersList(peer);
            break;
        case "username-accepted":
            peer.assignUsername(message.username);
            usernameElement.textContent = `Username: ${peer.username()}`
            break;
        case "offer":
            const data = await peer.createAnswer(message.from, message.data);
            peerConnection = data.peerConnection;
            remoteStream = data.remoteStream;
            remotePeer.srcObject = remoteStream;
            break;
        case "answer":
            if (peerConnection && !peerConnection.currentRemoteDescription) {
                await peerConnection.setRemoteDescription(message.data);
            }
            break;
        case "new-ice-candidate":
            if (peerConnection) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
            }
            break;
        default:
        // TODO
    }
}

function updateAvailableUsersList(peer) {
    availableUsersElement.innerHTML = "";
    peer.availableUsers().forEach(user => {
        let li = document.createElement("li");
        li.textContent = user;
        li.onclick = async () => {
            try {
                const data = await peer.createOffer(user);
                peerConnection = data.peerConnection;
                remoteStream = data.remoteStream;
                remotePeer.srcObject = remoteStream;
            } catch (error) {
                console.error(error);
            }
        };
        availableUsersElement.appendChild(li);
    });
}
