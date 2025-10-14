import * as Config from "./config.js";
import Peer from "./Peer.js";

const localPeer = document.getElementById('local-peer');
const remotePeer = document.getElementById('remote-peer');
const availableUsersElement = document.getElementById('available-users');
const usernameElement = document.getElementById('username');
const remoteUserElement = document.getElementById("remote-user");
const cameraBtn = document.getElementById('camera');
const microphoneBtn = document.getElementById('microphone');
const disconnectBtn = document.getElementById('disconnect');
const nextBtn = document.getElementById('next');
const popup = document.getElementById("error-popup");
const closeBtn = document.getElementById("close-popup");

const messages = document.getElementById("messages");
const message = document.getElementById("message");
const sendButton = document.getElementById("send");

init();

async function init() {
    try {
        sendButton.disabled = true;
        setUpClosePopupEventHandler();
        const peer = await Peer.from(
            Config.SIGNALING_SERVER_URL,
            Config.RTC_PEER_CONNECTION_CONFIG,
            Config.MEDIA_CONSTRAINTS);
        window.peer = peer;
        localPeer.srcObject = peer.localStream();
        //
        localPeer.muted = true;
        remotePeer.srcObject = peer.remoteStream();
        remotePeer.style.backgroundColor = 'black';
        remotePeer.onloadedmetadata = () => {
            remotePeer.play().catch(e => showError(e));
        };
        // 
        peer.websocket().onmessage = async (message) => {
            await onMessageHandler(peer, message.data);
        }
        peer.websocket().onerror = (message) => {
            showError(message);
        }
        peer.websocket().onclose = () => {
            try {
                remoteUserElement.textContent = "No remote user connected";
                remotePeer.srcObject = null;
                remotePeer.style.backgroundColor = 'black';
                peer.hangUp();
            } catch (error) {
                showError(error);
            }
        }
        cameraBtn.addEventListener('click', () => {
            try {
                if (peer.toggleCamera()) {
                    cameraBtn.style.backgroundColor = 'green';
                } else {
                    cameraBtn.style.backgroundColor = 'red';
                }
            } catch (error) {
                showError(error);
            }
        });
        microphoneBtn.addEventListener('click', () => {
            try {
                if (peer.toggleMicrophone()) {
                    microphoneBtn.style.backgroundColor = 'green';
                } else {
                    microphoneBtn.style.backgroundColor = 'red';
                }
            } catch (error) {
                showError(error);
            }
        });
        disconnectBtn.addEventListener('click', () => {
            try {
                peer.hangUp();
                remotePeer.srcObject = null;
                remotePeer.style.backgroundColor = 'black';
                remoteUserElement.textContent = "No remote user connected";
            } catch (error) {
                showError(error);
            }
        });
        nextBtn.addEventListener('click', async () => {
            await randomCall(peer);
        });
    } catch (error) {
        if (error.name === "OverconstrainedError") {
            console.log(`
                The constraints could not be satisfied by the available devices. 
                Constraints: ${JSON.stringify(Config.MEDIA_CONSTRAINTS)}`);
        } else if (error.name === "NotAllowedError") {
            showError('Permissions have not been granted to use your camera and microphone');
        } else {
            showError(error.message || "Unknow Error");
        }
    }
}

async function onMessageHandler(peer, data) {
    try {
        const message = JSON.parse(data);
        switch (message.type) {
            case "id":
                peer.profile().setId(message.id);
                const username = prompt("Enter your username:", "peer");
                peer.websocket().send(JSON.stringify({
                    type: "set-username",
                    username: username,
                }));
                break;
            case "user-list":
                peer.profile().setAvailableUsers(message.users);
                updateAvailableUsersList(peer);
                break;
            case "username-accepted":
                peer.profile().setName(message.username);
                usernameElement.textContent = `Username: ${peer.profile().name()}`
                break;
            case "offer":
                await inComingCall(peer, message);
                setUpMessageChannel(peer);
                break;
            case "answer":
                if (!peer.isClosed() && peer.peerConnection() && !peer.peerConnection().currentRemoteDescription) {
                    await peer.peerConnection().setRemoteDescription(message.data);
                }
                break;
            case "new-ice-candidate":
                if (!peer.isClosed() && peer.peerConnection() && message.data) {
                    const newIceCandidate = new RTCIceCandidate(message.data);
                    await peer.peerConnection().addIceCandidate(newIceCandidate);
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
    peer.profile().availableUsers().forEach(user => {
        let li = document.createElement("li");
        li.textContent = user;
        li.onclick = async () => {
            try {
                await peer.call(user);
                remotePeer.srcObject = peer.remoteStream();
                remoteUserElement.textContent = `Connected to ${user}`;
                setUpMessageChannel(peer);
            } catch (error) {
                showError(error.message);
            }
        };
        availableUsersElement.appendChild(li);
    });
}

function setUpClosePopupEventHandler() {
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

async function inComingCall(peer, message) {
    const accept = confirm(`Got a call from ${message.from}`);
    if (!accept) return;
    await peer.createAnswer(message.from, message.data);
    remotePeer.srcObject = peer.remoteStream();
    remoteUserElement.textContent = `Connected to ${message.from || "unknown"}`;
    setTimeout(() => {
        if (remotePeer.srcObject) {
            remotePeer.play().catch(e => showError(e));
        }
    }, 1000);
}

async function randomCall(peer) {
    try {
        const len = peer.profile().availableUsers().length;
        const randomNumber = Math.floor(Math.random() * len);
        const stranger = peer.profile().availableUsers()[randomNumber];
        await peer.call(stranger);
        remotePeer.srcObject = peer.remoteStream();
        remoteUserElement.textContent = `Connected to ${stranger}`;
    } catch (error) {
        showError(error);
    }
}

function setUpMessageChannel(peer) {
    messages.innerHTML = "";
    message.value = "";
    const messageChannel = peer.messageChannel();
    if (messageChannel) {
        dataChannelEventListener(messageChannel);
    } else {
        peer.peerConnection().ondatachannel = (event) => {
            dataChannelEventListener(event.channel);
        }
    }
    
}

function dataChannelEventListener(messageChannel) {
    messageChannel.onopen = () => {
        const state = messageChannel.readyState;
        console.log(state);
        if (state === 'open') {
            sendButton.disabled = false;
        }
    }
    messageChannel.onclose = () => {
        const state = messageChannel.readyState;
        console.log(state);
        sendButton.disabled = true;
    }
    messageChannel.onmessage = (event) => {
        const li = document.createElement('li');
        li.textContent = `Receive: ${event.data}`;
        messages.appendChild(li);
    }
    sendButton.onclick = () => {
        const li = document.createElement('li');
        li.textContent = `Send: ${message.value}`;
        messageChannel.send(message.value);
        message.value = "";
        messages.appendChild(li);
    }
}