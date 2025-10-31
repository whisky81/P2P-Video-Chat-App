import MediaStreamManager from "../MediaStreamManager.js";

const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const idElement = document.getElementById('id');
const usernameElement = document.getElementById('username');
const users = document.getElementById('users');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);


let mediaManager;
let localStream;
let pc1;
const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};
let pendingIceCandidates = [];

let websocket = new WebSocket('ws://localhost:8000');
websocket.onmessage = async (message) => {
  try {
    message = JSON.parse(message.data);
    console.log(message);
    switch (message.type) {
      case "id":
        idElement.textContent = `ID: ${message.id}`;
        websocket.send(JSON.stringify({
          type: "set-username",
          username: "peer",
        }));
        break;
      case "user-list":
        users.innerHTML = message.users.map(user => `<li>${user}</li>`).join('');
        break;
      case "username-accepted":
        usernameElement.textContent = `Username: ${message.username}`;
        break;
      case "offer":
        callButton.disabled = true;
        hangupButton.disabled = false;
        pc1 = await createConnection();
        await pc1.setRemoteDescription(message.data);
        const answer = await pc1.createAnswer();
        await pc1.setLocalDescription(answer);
        createAndSendSdp("peer", "answer");
        break;
      case "answer":
        await pc1.setRemoteDescription(message.data);
        break;
      case "new-ice-candidate":
        await pc1.addIceCandidate(message.data);
        break;
      default:
        throw new Error(`Unknown message type`);
    }
  } catch (error) {
    console.error(error);
  }
}

async function start() {
  try {
    const stream = await navigator
      .mediaDevices
      .getUserMedia({ audio: true, video: true });
    localVideo.srcObject = stream;
    localStream = stream;
    startButton.disabled = true;
    callButton.disabled = false;
  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}

async function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;

  pc1 = await createConnection();

  try {
    const offer = await pc1.createOffer(offerOptions);
    await pc1.setLocalDescription(offer);
    createAndSendSdp("peer1", "offer");
  } catch (e) {
  }
}

function hangup() {
  pc1.close();
  pc1 = null;
  pendingIceCandidates = [];
  hangupButton.disabled = true;
  callButton.disabled = false;
}

async function onIceCandidate(event) {
  try {
    // await pc.addIceCandidate(event.candidate);
    websocket.send(JSON.stringify({
      type: "new-ice-candidate",
      to: "peer1",
      data: event.candidate
    }));
  } catch (e) {
  }
}

async function createAndSendSdp(remoteUser, messageType) {
  websocket.send(JSON.stringify({
    type: messageType,
    to: remoteUser,
    data: pc1.localDescription
  }));
}

async function createConnection() {
  const configuration = {};
  const pc1 = new RTCPeerConnection(configuration);
  pc1.addEventListener('icecandidate', e => onIceCandidate(e));

  localStream.getTracks().forEach((track) => {
    pc1.addTrack(track, localStream);
  });

  const remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  pc1.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => {
      if (!remoteStream.getTracks().some(t => t.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });
  };
  return pc1;
}
