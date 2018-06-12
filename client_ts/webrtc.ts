var localVideo: HTMLVideoElement;
var localStream: MediaStream;
var remoteVideo: HTMLVideoElement;
var peerConnection: RTCPeerConnection;
var uuid: string;
var serverConnection: WebSocket;


var peerConnectionConfig: RTCConfiguration = {
    'iceServers': [
        { 'urls': 'stun:stun.stunprotocol.org:3478' },
        { 'urls': 'stun:stun.l.google.com:19302' },
    ]
};

namespace Utils {
    export function createUUID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }

        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }

    export const videoConstrains = {
        video: true,
        audio: false,
    };

    export const peerConnectionConfig: RTCConfiguration = {
        'iceServers': [
            { 'urls': 'stun:stun.stunprotocol.org:3478' },
            { 'urls': 'stun:stun.l.google.com:19302' },
        ]
    };

}

class RTCProducer {
    protected uuid: string = Utils.createUUID();
    protected localVideo: HTMLVideoElement = document.getElementById('localVideo') as HTMLVideoElement;
    protected connection: WebSocket = new WebSocket(`ws://${window.location.hostname}:8443`)
    protected peerConnections: {[key: string]: RTCPeerConnection} = {};

    private myStream: MediaStream | null = null;

    protected get isProducer(): boolean {
        return true;
    }

    constructor() {
        this.init();
    }
    
    init() {
        window['ProducerR'] = this;
        this.connection.addEventListener('message', this.messageRecieved.bind(this));
        if (navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(Utils.videoConstrains).then(this.OnMediaCaptureSuccess).catch(this.error);
        } else {
            alert('Your browser does not support getUserMedia API');
        }
    }

    protected createConnection(uuid: string) {
        this.peerConnections[uuid] = new RTCPeerConnection(Utils.peerConnectionConfig);
        this.peerConnections[uuid].addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate != null) {
                this.connection.send(JSON.stringify({ 
                    'ice': event.candidate,
                    'uuid': this.uuid,
                    targetUuid: uuid
                }));
            }
        });
        // (peerConnection as any).ontrack = gotRemoteStream;
        // this.peerConnections[uuid].addStream(this.myStream as MediaStream);
        (this.peerConnections[uuid] as any).addTrack((this.myStream as MediaStream).getVideoTracks()[0], this.myStream);
        this.peerConnections[uuid].createOffer().then((description: RTCSessionDescriptionInit) => {
            console.log('Got Description', description);

            this.peerConnections[uuid].setLocalDescription(description).then(() => {
                this.connection.send(JSON.stringify({ 
                    'sdp': this.peerConnections[uuid].localDescription, 
                    'uuid': this.uuid,
                    targetUuid: uuid
                }));
            }).catch(this.error);
        }).catch(this.error);
    }

    protected messageRecieved (message: {data: string}) {
        var signal: {
            sdp: RTCSessionDescriptionInit,
            uuid: string,
            targetUuid: string,
            ice: RTCIceCandidateInit,
            error: boolean,
            message: string,
        } = JSON.parse(message.data);

        // If server sent back an error and the uuid is ours,
        // display error to user.
        if (signal.error && signal.uuid == this.uuid) {
            alert(signal.message);
            return;
        } 

        if (signal.message == 'RequestingConnection' && this.isProducer) {
            this.createConnection(signal.uuid);
            this.connection.send(JSON.stringify({
                uuid: this.uuid,
                message: 'ConnectionRequestApproved',
                targetUuid: signal.uuid
            }));
        }

        // Ignore messages from ourself
        if (signal.uuid == this.uuid || signal.targetUuid !== this.uuid) return;

        if (signal.ice) {
            this.peerConnections[signal.uuid].addIceCandidate(new RTCIceCandidate(signal.ice) as any).catch(this.error);
        }

        if (signal.sdp) {
            this.peerConnections[signal.uuid].setRemoteDescription(new RTCSessionDescription(signal.sdp) as any).then(() => {}).catch(this.error);
        }
    }

    private OnMediaCaptureSuccess = (stream: MediaStream) => {
        console.log('Capturing Cam Stream: Producer');
        this.localVideo.srcObject = stream;
        this.myStream = stream;

        // start the capture and connection process
    }

    protected error = (err: any) => {
        console.log(err);
    }
}

class RTCConsumer extends RTCProducer {
    private remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;
    
    protected get isProducer(): boolean {
        return false;
    }

    constructor() {
        super();
    }

    init() {
        window['Consumer'] = this;
        this.connection.addEventListener('message', this.messageRecieved.bind(this));
        
        setTimeout(() => {
            this.connection.send(JSON.stringify({
                message: "RequestingConnection", uuid: this.uuid
            }));
        }, 1000);
    }

    protected createConnection(uuid: string) {
        this.peerConnections[uuid] = new RTCPeerConnection(Utils.peerConnectionConfig);
        this.peerConnections[uuid].addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
            if (event.candidate != null) {
                this.connection.send(JSON.stringify({ 
                    'ice': event.candidate, 
                    'uuid': this.uuid,
                    targetUuid: uuid
                }));
            }
        });
        this.peerConnections[uuid].addEventListener('track', (e: any) => {
            this.remoteVideo.srcObject = e.streams[0];
        });
    }

    protected messageRecieved(message: { data: string }) {
        var signal: {
            sdp: RTCSessionDescriptionInit,
            uuid: string,
            targetUuid: string;
            ice: RTCIceCandidateInit,
            error: boolean,
            message: string,
        } = JSON.parse(message.data);

        // If server sent back an error and the uuid is ours,
        // display error to user.
        if (signal.error && signal.uuid == this.uuid) {
            alert(signal.message);
            return;
        }

        if (signal.message === 'ConnectionRequestApproved' && signal.targetUuid == this.uuid) {
            this.createConnection(signal.uuid);
        }

        // Ignore messages from ourself
        if (signal.uuid == this.uuid || signal.targetUuid !== this.uuid ) return;

        if (this.peerConnections[signal.uuid]) {
            if (signal.ice) {
                this.peerConnections[signal.uuid].addIceCandidate(new RTCIceCandidate(signal.ice) as any).catch(this.error);
            }

            if (signal.sdp) {
                this.peerConnections[signal.uuid].setRemoteDescription(new RTCSessionDescription(signal.sdp) as any).then(() => {
                    // Only create answers in response to offers
                    if (signal.sdp.type == 'offer') {
                        this.peerConnections[signal.uuid].createAnswer().then((description: RTCSessionDescriptionInit) => {
                            console.log('Got Description', description);

                            console.log(this.peerConnections[signal.uuid]);

                            this.peerConnections[signal.uuid].setLocalDescription(description).then(() => {
                                this.connection.send(JSON.stringify({
                                    'sdp': this.peerConnections[signal.uuid].localDescription,
                                    'uuid': this.uuid,
                                    targetUuid: signal.uuid
                                }));
                            }).catch(this.error);
                        }).catch(this.error);
                    }
                }).catch(this.error);
            }
        }
    }
}