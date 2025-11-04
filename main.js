class MediaStreamManager {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
    this.screenStream = null;
    this.isScreenSharing = false;
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
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;
  }

  toggleCamera() {
    const videoTrack = this.localStream.getTracks().find((track) => track.kind === 'video');
    const newState = !videoTrack.enabled;
    videoTrack.enabled = newState;
    return newState;
  }

  toggleMicrophone() {
    const audioTrack = this.localStream.getTracks().find((track) => track.kind === 'audio');
    const newState = !audioTrack.enabled;
    audioTrack.enabled = newState;
    return newState;
  }

  async toggleScreenShare(peerConnection) {
    if (!this.isScreenSharing) {
      // Start screen sharing
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: true 
        });

        // Store the original video track to revert back later
        this.originalVideoTrack = this.localStream.getVideoTracks()[0];
        
        // Replace the video track in local stream with screen share track
        this.localStream.removeTrack(this.originalVideoTrack);
        const screenVideoTrack = this.screenStream.getVideoTracks()[0];
        this.localStream.addTrack(screenVideoTrack);

        // Replace the track in peer connection
        const sender = peerConnection.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          await sender.replaceTrack(screenVideoTrack);
        }

        this.isScreenSharing = true;

        // Handle when user stops screen sharing via browser UI
        screenVideoTrack.onended = () => {
          this.stopScreenShare(peerConnection);
        };

        return true;
      } catch (error) {
        console.error('Error starting screen share:', error);
        return false;
      }
    } else {
      // Stop screen sharing
      this.stopScreenShare(peerConnection);
      return false;
    }
  }

  async stopScreenShare(peerConnection) {
    if (!this.isScreenSharing || !this.originalVideoTrack) return;

    // Stop screen share tracks
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    // Replace back with original camera track
    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    this.localStream.removeTrack(currentVideoTrack);
    this.localStream.addTrack(this.originalVideoTrack);

    // Replace track in peer connection
    const sender = peerConnection.getSenders().find(s => 
      s.track && s.track.kind === 'video'
    );
    if (sender) {
      await sender.replaceTrack(this.originalVideoTrack);
    }

    this.isScreenSharing = false;
    this.originalVideoTrack = null;
  }
}

class Peer {
  constructor(websocket, offerOptions, mediaConstraints) {
    this.websocket = websocket;
    this.mediaStreamManager = null;
    this.peerConnection = null;
    this.offerOptions = offerOptions;
    this.mediaConstraints = mediaConstraints;
    this.username = null;
    this.users = [];
    this.messageChannel = null;
    this.fileChannel = null;
    this.remoteUser = null;
    this.receiveBuffer = [];
    this.receivedSize = 0;
  }

  async start() {
    this.mediaStreamManager = await MediaStreamManager.start(this.mediaConstraints);
  }

  async call(remoteUser) {
    await this.createPeerConnection(remoteUser);
    this.messageChannel = this.peerConnection.createDataChannel("message");
    this.fileChannel = this.peerConnection.createDataChannel("file");
    this.fileChannel.binaryType = 'arraybuffer';
    const offer = await this.peerConnection.createOffer(this.offerOptions);
    await this.peerConnection.setLocalDescription(offer);
    this.createAndSendSdp(remoteUser, "offer");
  }

  async createAnswer(remoteUser, offer) {
    if (
      this.peerConnection
      && this.peerConnection.signalingState !== 'stable') {
      console.warn('PeerConnection is not in stable state, skipping answer creation');
      return;
    }
    await this.createPeerConnection(remoteUser);
    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    this.createAndSendSdp(remoteUser, "answer");
  }

  close() {
    this.resetFileTransfer();
    if (this.messageChannel) {
      this.messageChannel.close();
      this.messageChannel = null;
    }
    if (this.fileChannel) {
      this.fileChannel.close();
      this.fileChannel = null;
    }
    this.mediaStreamManager.close();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      this.remoteUser = null;
    }
  }

  resetFileTransfer() {
    this.receivedSize = 0;
    this.receiveBuffer = [];
  }

  async createPeerConnection(remoteUser) {
    this.close();
    this.peerConnection = new RTCPeerConnection();
    this.mediaStreamManager.addTrack(this.peerConnection);
    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.websocket.send(JSON.stringify({
        type: "new-ice-candidate",
        to: remoteUser,
        data: event.candidate
      }));
    }
  }

  async createAndSendSdp(remoteUser, messageType) {
    if (!this.peerConnection) throw new Error("PeerConnection is not established");
    this.websocket.send(JSON.stringify({
      type: messageType,
      to: remoteUser,
      data: this.peerConnection.localDescription
    }));
  }

  async toggleScreenShare() {
    if (!this.peerConnection) {
      alert('Please start a call first');
      return false;
    }
    return await this.mediaStreamManager.toggleScreenShare(this.peerConnection);
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
const messageFileContainer = document.getElementById('message-file-container');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('message');
const sendButton = document.getElementById('send');
const remoteUserElement = document.getElementById('remote-user');
const fileInput = document.getElementById('fileInput');
const sendFileButton = document.getElementById('sendFile');
const cameraButton = document.getElementById('camera');
const micButton = document.getElementById('mic');
const screenShareButton = document.getElementById('screenShare');

cameraButton.disabled = true;
micButton.disabled = true;
screenShareButton.disabled = true;
callButton.disabled = true;
hangupButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', async () => {
  await call("peer1");
});
hangupButton.addEventListener('click', hangup);
screenShareButton.addEventListener('click', toggleScreenShare);
messageFileContainer.style.display = "none";
let peer;
const metadataFiles = [];

async function start() {
  try {
    const websocket = new WebSocket('ws://localhost:8000');
    peer = new Peer(websocket, OFFER_OPTIONS, MEDIA_CONSTRAINTS);
    websocket.onmessage = async (message) => {
      try {
        message = JSON.parse(message.data);
        switch (message.type) {
          case "id":
            idElement.textContent = `ID: ${message.id}`;
            const username = prompt("Enter your username:", "peer");
            websocket.send(JSON.stringify({
              type: "set-username",
              username: username,
            }));
            break;
          case "user-list":
            peer.users = message.users.filter(user => user !== peer.username);
            updateAvailableUsersList();
            break;
          case "username-accepted":
            peer.username = message.username;
            usernameElement.textContent = `Username: ${peer.username}`;
            break;
          case "offer":
            callButton.disabled = true;
            hangupButton.disabled = false;
            screenShareButton.disabled = false;
            await peer.createAnswer(message.from, message.data);
            onConnectionStateChange();
            setUpMessageChannel();
            remoteVideo.srcObject = peer.mediaStreamManager.remoteStream;
            peer.remoteUser = message.from;
            remoteUserElement.textContent = peer.remoteUser ? `Connected to ${peer.remoteUser}` : "";
            break;
          case "answer":
            if (peer.peerConnection.signalingState === 'have-local-offer') {
              await peer.peerConnection.setRemoteDescription(message.data);
            } else {
              console.warn('Cannot set remote description in current state:',
                peer.peerConnection.signalingState);
            }
            break;
          case "new-ice-candidate":
            await peer.peerConnection.addIceCandidate(message.data);
            break;
          case "metadata-file":
            metadataFiles.push(JSON.parse(JSON.stringify(message.metadata)));
            break;
          default:
            throw new Error(`Unknown message type`);
        }
      } catch (error) {
        throw error;
      }
    }
    await peer.start();
    localVideo.srcObject = peer.mediaStreamManager.localStream;
    startButton.disabled = true;
    callButton.disabled = false;
    messageFileContainer.style.display = "block";
    sendButton.disabled = true;
    cameraButton.disabled = false;
    micButton.disabled = false;
    
    cameraButton.onclick = () => {
      if (!peer) return;
      const status = peer.mediaStreamManager.toggleCamera();
      cameraButton.style.backgroundColor = status ? "green" : "red";
    }
    
    micButton.onclick = () => {
      if (!peer) return;
      const status = peer.mediaStreamManager.toggleMicrophone();
      micButton.style.backgroundColor = status ? "green" : "red";
    }
  } catch (e) {
    alert(e);
  }
}

async function call(remoteUser) {
  callButton.disabled = true;
  hangupButton.disabled = false;
  screenShareButton.disabled = false;
  await peer.call(remoteUser);
  onConnectionStateChange();
  setUpMessageChannel();
  remoteVideo.srcObject = peer.mediaStreamManager.remoteStream;
  peer.remoteUser = remoteUser;
  remoteUserElement.textContent = `Connected to ${remoteUser}`;
}

async function hangup() {
  if (peer) {
    messages.innerHTML = "";
    messageInput.value = "";
    peer.close();
    remoteVideo.srcObject = null;
    remoteUserElement.textContent = "";
    screenShareButton.disabled = true;
    screenShareButton.style.backgroundColor = "";
  }
  hangupButton.disabled = true;
  callButton.disabled = false;
}

async function toggleScreenShare() {
  if (!peer) return;
  
  const isNowSharing = await peer.toggleScreenShare();
  screenShareButton.style.backgroundColor = isNowSharing ? "red" : "";
  
  if (isNowSharing) {
    screenShareButton.textContent = "Stop Sharing";
  } else {
    screenShareButton.textContent = "Share Screen";
  }
}

function onConnectionStateChange() {
  peer.peerConnection.onconnectionstatechange = async () => {
    const state = peer.peerConnection.connectionState;
    if (
      state === "disconnected"
      || state === "failed"
      || state === "closed") {
      await  peer.mediaStreamManager.stopScreenShare(peer.peerConnection);
      hangup();
    }
  }
}

function updateAvailableUsersList() {
  users.innerHTML = "";
  peer.users.forEach(user => {
    const li = document.createElement("li");
    li.textContent = user;
    li.onclick = async () => {
      try {
        await call(user);
      } catch (error) {
        alert(error.message);
      }
    };
    users.appendChild(li);
  });
}

function setUpMessageChannel() {
  messages.innerHTML = "";
  messageInput.value = "";
  if (peer.messageChannel && peer.fileChannel) {
    dataChannelEventListener(peer.messageChannel);
    fileChannelEventListener(peer.fileChannel);
  } else {
    peer.peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "message") {
        dataChannelEventListener(channel);
      } else {
        // file channel
        fileChannelEventListener(channel);
      }
    }
  }
}

function dataChannelEventListener(messageChannel) {
  messageChannel.onopen = () => {
    const state = messageChannel.readyState;
    if (state === 'open') {
      sendButton.disabled = false;
    }
  }
  messageChannel.onclose = () => {
    const state = messageChannel.readyState;
    sendButton.disabled = true;
  }
  messageChannel.onmessage = (event) => {
    const li = document.createElement('li');
    li.textContent = event.data;
    li.classList.add('receive');
    messages.appendChild(li);
  }
  sendButton.onclick = () => {
    const li = document.createElement('li');
    li.textContent = messageInput.value;
    li.classList.add('send');
    messageChannel.send(messageInput.value);
    messageInput.value = "";
    messages.appendChild(li);
  }
}

function fileChannelEventListener(fileChannel) {
  fileChannel.binaryType = 'arraybuffer';
  fileChannel.onopen = () => {
    const state = fileChannel.readyState;
    if (state === 'open') {
      sendFileButton.disabled = false;
    }
  }
  fileChannel.onclose = () => {
    sendFileButton.disabled = true;
  }
  fileChannel.onmessage = (event) => {
    if (metadataFiles.length === 0) return;
    const metadataFile = metadataFiles[metadataFiles.length - 1];

    let progressElement = document.querySelector(`progress[data-file="${metadataFile.name}"]`);
    if (!progressElement) {
      const li = document.createElement('li');
      progressElement = document.createElement('progress');
      progressElement.setAttribute('data-file', metadataFile.name);
      progressElement.max = metadataFile.size;
      progressElement.value = 0;
      li.textContent = `Receiving file: ${metadataFile.name} (${metadataFile.size} bytes) `;
      li.appendChild(progressElement);
      messages.appendChild(li);
    }

    peer.receiveBuffer.push(event.data);
    peer.receivedSize += event.data.byteLength;
    progressElement.value = peer.receivedSize;

    if (peer.receivedSize === metadataFile.size) {
      const file = new Blob(peer.receiveBuffer, {
        type: metadataFile.type
      });

      peer.resetFileTransfer();

      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = URL.createObjectURL(file);
      downloadAnchor.download = metadataFile.name;
      downloadAnchor.textContent = `Click to download '${metadataFile.name}' (${metadataFile.size} bytes)`;

      const li = progressElement.parentNode;
      li.appendChild(document.createElement('br'));
      li.appendChild(downloadAnchor);

      metadataFiles.pop();
    }
  }

  sendFileButton.onclick = () => {
    const file = fileInput.files[0];
    if (!file || !fileChannel || fileChannel.readyState !== 'open') return;

    const metadataFile = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    };

    peer.websocket.send(JSON.stringify({
      type: "metadata-file",
      to: peer.remoteUser,
      metadata: metadataFile
    }));

    const li = document.createElement('li');
    const progressElement = document.createElement('progress');
    progressElement.max = file.size;
    progressElement.value = 0;
    li.textContent = `Sending file: ${file.name} (${file.size} bytes) `;
    li.appendChild(progressElement);
    messages.appendChild(li);

    const chunkSize = 16 * 1024;
    let offset = 0;

    const readSlice = (o) => {
      const slice = file.slice(offset, o + chunkSize);
      const fileReader = new FileReader();

      fileReader.onload = (e) => {
        if (fileChannel.readyState === 'open') {
          fileChannel.send(e.target.result);
          offset += e.target.result.byteLength;
          progressElement.value = offset;

          if (offset < file.size) {
            readSlice(offset);
          } else {
            fileInput.value = "";
            peer.resetFileTransfer();
          }
        }
      };

      fileReader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  }
}