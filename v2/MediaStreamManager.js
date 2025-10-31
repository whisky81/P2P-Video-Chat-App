class MediaStreamManager {
    constructor(localStream, remoteStream) {
        this.localStream = localStream;
        this.remoteStream = remoteStream;
    }

    static async start(streamConstraints) {
        const localStream = await navigator
            .mediaDevices
            .getUserMedia(streamConstraints);
        const remoteStream = new MediaStream();
        return new MediaStream(localStream, remoteStream);
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

    // restart function 

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
}

export default MediaStreamManager;