import MediaStreamManager from "./MediaStreamManager.js";

class Peer {
  constructor(websocket, offerOptions, mediaConstraints, rtcPeerConnectionConfig) {
    this.websocket = websocket;
    this.mediaStreamManager = null;
    this.peerConnection = null;

    // configuration
    this.offerOptions = offerOptions;
    this.mediaConstraints = mediaConstraints;
    this.rtcPeerConnectionConfig = rtcPeerConnectionConfig;

    // profile 
    this.username = null;
    this.users = [];
    this.remoteUser = null;

    // message transfer
    this.messageChannel = null;

    // file transfer
    this.fileChannel = null;
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
    this.peerConnection = new RTCPeerConnection(this.rtcPeerConnectionConfig);
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

export default Peer;