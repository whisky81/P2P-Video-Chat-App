class MediaStreamManager {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
  }

  static async start(mediaConstraints) {
    const localStream = await navigator
      .mediaDevices
      .getUserMedia(mediaConstraints);
    const manager = new MediaStreamManager();
    manager.localStream = localStream;
    manager.remoteStream = new MediaStream();
    return manager;
  }

  addTrack(peerConnection) {
    this.localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, this.localStream);
    });
    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        if (!this.remoteStream.getTracks().some(t => t.id === track.id)) {
          this.remoteStream.addTrack(track);
        }
      });
    };
  }

  close() {
    this.remoteStream.getTracks().forEach(track => track.stop());
    this.remoteStream = new MediaStream();
  }
}

class Profile {
  #id = 0;
  #name = "";
  #availableUsers = [];

  setId(id_) {
    if (typeof id_ !== 'number' || id_ < 0) {
      throw new TypeError("id must be a non-negative number");
    }
    this.#id = id_;
  }

  setName(name_) {
    if (typeof name_ !== 'string' || name_.trim() === "") {
      throw new TypeError("name must be a non-empty string");
    }
    this.#name = name_.trim();
  }

  setAvailableUsers(availableUsers_) {
    if (!Array.isArray(availableUsers_)) {
      throw new TypeError("availableUsers must be an array");
    }
    this.#availableUsers = availableUsers_.filter((username) => username !== this.#name);
  }

  isValidProfile() {
    return this.id() > 0 && this.name().length > 0;
  }

  id() {
    return this.#id;
  }

  name() {
    return this.#name;
  }

  availableUsers() {
    return [...this.#availableUsers];
  }
}

class Peer {
  constructor(websocket, mediaStreamManager, offerOptions) {
    this.websocket = websocket;
    this.profile = new Profile();
    this.mediaStreamManager = mediaStreamManager;
    this.peerConnection = null;
    this.offerOptions = offerOptions;
  }

  static async from(signalingServerUrl, mediaConstraints, offerOptions) {
    // const websocket = await new Promise((resolve, reject) => {
    //   const ws = new WebSocket(signalingServerUrl);
    //   ws.onopen = () => resolve(ws);
    //   ws.onerror = (err) => reject(err);
    // });
    const websocket = null;
    const mediaStreamManager = await MediaStreamManager.start(mediaConstraints);
    return new Peer(websocket, mediaStreamManager, offerOptions);
  }

  async call(remoteUser) {
    await this.createPeerConnection(remoteUser);
    const offer = await this.peerConnection.createOffer(this.offerOptions);
    await this.peerConnection.setLocalDescription(offer);
    this.createAndSendSdp(remoteUser, "offer");
  }

  async createAnswer(remoteUser, offer) {
    await this.createPeerConnection(remoteUser);
    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    this.createAndSendSdp(remoteUser, "answer");
  }

  close() {
    this.mediaStreamManager.close();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }

  async createPeerConnection(remoteUser) {
    this.close();
    this.peerConnection = new RTCPeerConnection();
    this.mediaStreamManager.addTrack(this.peerConnection);
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.close();
      }
    };
    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      websocket.send(JSON.stringify({
        type: "new-ice-candidate",
        to: remoteUser,
        data: event.candidate
      }));
    }
  }

  async createAndSendSdp(remoteUser, messageType) {
    if (!this.peerConnection) throw new Error("PeerConnection is not established");
    websocket.send(JSON.stringify({
      type: messageType,
      to: remoteUser,
      data: this.peerConnection.localDescription
    }));
  }
}

const MEDIA_CONSTRAINTS = { audio: true, video: true };
const SIGNALING_SERVER_URL = "ws://localhost:8000";
const OFFER_OPTIONS = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

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

let peer;
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
        await peer.createAnswer("peer", message.data);
        remoteVideo.srcObject = peer.mediaStreamManager.remoteStream;
        break;
      case "answer":
        await peer.peerConnection.setRemoteDescription(message.data);
        break;
      case "new-ice-candidate":
        await peer.peerConnection.addIceCandidate(message.data);
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
    peer = await Peer.from(SIGNALING_SERVER_URL, MEDIA_CONSTRAINTS, OFFER_OPTIONS);
    localVideo.srcObject = peer.mediaStreamManager.localStream;
    startButton.disabled = true;
    callButton.disabled = false;
  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}

async function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  await peer.call("peer1");
  remoteVideo.srcObject = peer.mediaStreamManager.remoteStream;
}

async function hangup() {
  peer.close();
  hangupButton.disabled = true;
  callButton.disabled = false;
}
