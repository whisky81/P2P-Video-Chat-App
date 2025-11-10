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
      try {
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        this.originalVideoTrack = this.localStream.getVideoTracks()[0];

        this.localStream.removeTrack(this.originalVideoTrack);
        const screenVideoTrack = this.screenStream.getVideoTracks()[0];
        this.localStream.addTrack(screenVideoTrack);

        const sender = peerConnection.getSenders().find(s =>
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          await sender.replaceTrack(screenVideoTrack);
        }

        this.isScreenSharing = true;

        screenVideoTrack.onended = () => {
          this.stopScreenShare(peerConnection);
        };

        return true;
      } catch (error) {
        console.error('Error starting screen share:', error);
        return false;
      }
    } else {
      this.stopScreenShare(peerConnection);
      return false;
    }
  }

  async stopScreenShare(peerConnection) {
    if (!this.isScreenSharing || !this.originalVideoTrack) return;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
    }

    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    this.localStream.removeTrack(currentVideoTrack);
    this.localStream.addTrack(this.originalVideoTrack);

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

export default MediaStreamManager;