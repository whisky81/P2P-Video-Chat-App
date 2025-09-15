
let localStream;
let remoteStream;
let localPeer = document.getElementById('local-peer');
let remotePeer = document.getElementById('remote-peer');
let availableUsersElement = document.getElementById('available-users');
let usernameElement = document.getElementById('username');
let peerConnection;

// signaling 
let id;
let ws;
let username;
let availableUsers = [];

const servers = {
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

let isCaller = false;
let targetUser = null;

async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localPeer.srcObject = localStream;
        ws = new WebSocket("ws://localhost:8000");

        ws.onmessage = async (message) => {
            let data = JSON.parse(message.data);
            console.log("Received message:", data);
            
            if (data.type === "id") {
                id = data.id;
                console.log("Assigned ID:", id);
                username = prompt("Enter your username:");
                ws.send(JSON.stringify({ type: "set-username", id: id, username: username }));
            } else if (data.type === "userlist") {
                availableUsers = data.users.filter(user => user !== username);
                updateAvailableUsersList();
            } else if (data.type === "username-accepted") {
                username = data.username;
                usernameElement.textContent = `Username: ${username}`;
            } else if (data.type === "webrtc-signaling") {
                await handleWebRTCSignaling(data);
            } else {
                // TODO: handle error messages 
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
        };

    } catch (error) {
        console.error("Error initializing:", error);
        alert("Error accessing camera/microphone: " + error.message);
    }
}

function updateAvailableUsersList() {
    availableUsersElement.innerHTML = "";
    availableUsers.forEach(user => {
        let li = document.createElement("li");
        li.textContent = user;
        li.style.cursor = "pointer";
        li.style.padding = "5px";
        li.style.margin = "2px";
        li.style.backgroundColor = "#f0f0f0";
        li.onclick = () => {
            console.log(`Starting call with ${user}`);
            targetUser = user;
            isCaller = true;
            createOffer(user);
        };
        availableUsersElement.appendChild(li);
    });
}

async function handleWebRTCSignaling(data) {
    const signalingData = data.data;
    
    if (signalingData.type === "offer") {
        console.log("Received offer from:", data.from);
        targetUser = data.from;
        isCaller = false;
        await createAnswer(targetUser, signalingData);
    } else if (signalingData.type === "answer") {
        console.log("Received answer from:", data.from);
        await addAnswer(signalingData);
    } else if (signalingData.type === "ice-candidate") {
        console.log("Received ICE candidate from:", data.from);
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signalingData.candidate));
            } catch (error) {
                console.error("Error adding ICE candidate:", error);
            }
        }
    }
}

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    remotePeer.srcObject = remoteStream;

    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        console.log("Received remote tracks");
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("New ICE candidate:", event.candidate);
            ws.send(JSON.stringify({
                type: "webrtc-signaling",
                id: id,
                target: targetUser,
                data: {
                    type: "ice-candidate",
                    candidate: event.candidate
                }
            }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.connectionState);
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
    };
}

async function createOffer(targetUser) {
    await createPeerConnection();
    
    try {
        let offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        console.log("Created offer:", offer);
        
        ws.send(JSON.stringify({
            type: "webrtc-signaling",
            id: id,
            target: targetUser,
            data: offer
        }));
        
    } catch (error) {
        console.error("Error creating offer:", error);
    }
}

async function createAnswer(remoteUser, offer) {
    await createPeerConnection();
    
    try {
        await peerConnection.setRemoteDescription(offer);
        let answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        console.log("Created answer:", answer);
        
        ws.send(JSON.stringify({
            type: "webrtc-signaling",
            id: id,
            target: remoteUser,
            data: answer
        }));
        
    } catch (error) {
        console.error("Error creating answer:", error);
    }
}

async function addAnswer(answer) {
    try {
        if (!peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(answer);
            console.log("Answer set successfully");
        }
    } catch (error) {
        console.error("Error adding answer:", error);
    }
}

init();