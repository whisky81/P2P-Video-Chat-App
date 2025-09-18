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
        const localStream = await navigator
            .mediaDevices
            .getUserMedia({
                video: true,
                audio: true
            });
        const websocket = new WebSocket(url);
        return new Peer(localStream, websocket, rtcPeerConnectionConfig);
    }

    async #createPeerConnection() {
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
    }

    #checkConnection(peerConnection, remoteStream) {
        return !peerConnection || !remoteStream;
    }

    async createOffer(remoteUser) {
        const { peerConnection, remoteStream } = await this.#createPeerConnection();
        if (this.#checkConnection(peerConnection, remoteStream)) throw new Error(`Failed to connect to remote user ${remoteUser}`);
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
    }

    async createAnswer(remoteUser, offer) {
        const { peerConnection, remoteStream } = await this.#createPeerConnection();
        if (this.#checkConnection(peerConnection, remoteStream)) throw new Error(`Failed to connect to remote user ${remoteUser}`);
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
    }

    assignId(newId) {
        // TODO 
        this.#id = newId;
    }

    assignUsername(newUsername) {
        if (newUsername.trim() === "") {
            throw new Error("username cannot be empty");
        }
        this.#username = newUsername.trim();
    }

    assignAvailableUsers(availableUsers) {
        this.#availableUsers = availableUsers.filter((user) => user != this.#username);
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
let remoteUserElement = document.getElementById("remote-user");
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

const URL = "";

async function main() {
    try {
        setUpEventHandler();
        const peer = await Peer.from(URL, RTC_PEER_CONNECTION_CONFIG);
        localPeer.srcObject = peer.localStream();
        peer.websocket().onmessage = async (message) => {
            await onMessageHandler(peer, message.data);
        }
        peer.websocket().onerror = async (message) => {
            showError(message);
        }
        peer.websocket().onclose = (event) => {
            if (remoteUserElement) remoteUserElement.textContent = "No remote user connected";
        }
    } catch (error) {
        showError(error.message || "Unknow Error");
    }
}

main();

async function onMessageHandler(peer, data) {
    try {
        const message = JSON.parse(data);
        switch (message.type) {
            case "id":
                peer.assignId(message.id);
                const username = prompt("Enter your username:", "peer");
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
                showError(`${message.type} ${message.data || ""}`);
        }
    } catch (error) {
        showError(`${error.type} ${error.message || ""}`);
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
                if (remoteUserElement) {
                    remoteUserElement.textContent = `Connected to ${user}`;
                }
            } catch (error) {
                showError(error.message);
            }
        };
        availableUsersElement.appendChild(li);
    });
}

function setUpEventHandler() {
    const popup = document.getElementById("error-popup");
    const closeBtn = document.getElementById("close-popup");
    closeBtn.onclick = () => {
        popup.style.display = "none";
    };
    window.onclick = (event) => {
        if (event.target === popup) {
            popup.style.display = "none";
        }
    };
}

function showError(message) {
    const popup = document.getElementById("error-popup");
    const msg = document.getElementById("error-message");
    msg.textContent = message;
    popup.style.display = "block";
}

