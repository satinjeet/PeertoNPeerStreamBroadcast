"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var localVideo;
var localStream;
var remoteVideo;
var peerConnection;
var uuid;
var serverConnection;
var peerConnectionConfig = {
    'iceServers': [
        { 'urls': 'stun:stun.stunprotocol.org:3478' },
        { 'urls': 'stun:stun.l.google.com:19302' },
    ]
};
var Utils;
(function (Utils) {
    function createUUID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
    }
    Utils.createUUID = createUUID;
    Utils.videoConstrains = {
        video: true,
        audio: false,
    };
    Utils.peerConnectionConfig = {
        'iceServers': [
            { 'urls': 'stun:stun.stunprotocol.org:3478' },
            { 'urls': 'stun:stun.l.google.com:19302' },
        ]
    };
})(Utils || (Utils = {}));
var RTCProducer = /** @class */ (function () {
    function RTCProducer() {
        var _this = this;
        this.uuid = Utils.createUUID();
        this.localVideo = document.getElementById('localVideo');
        this.connection = new WebSocket("ws://" + window.location.hostname + ":8443");
        this.peerConnections = {};
        this.myStream = null;
        this.OnMediaCaptureSuccess = function (stream) {
            console.log('Capturing Cam Stream: Producer');
            _this.localVideo.srcObject = stream;
            _this.myStream = stream;
            // start the capture and connection process
        };
        this.error = function (err) {
            console.log(err);
        };
        this.init();
    }
    Object.defineProperty(RTCProducer.prototype, "isProducer", {
        get: function () {
            return true;
        },
        enumerable: true,
        configurable: true
    });
    RTCProducer.prototype.init = function () {
        window['ProducerR'] = this;
        this.connection.addEventListener('message', this.messageRecieved.bind(this));
        if (navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(Utils.videoConstrains).then(this.OnMediaCaptureSuccess).catch(this.error);
        }
        else {
            alert('Your browser does not support getUserMedia API');
        }
    };
    RTCProducer.prototype.createConnection = function (uuid) {
        var _this = this;
        this.peerConnections[uuid] = new RTCPeerConnection(Utils.peerConnectionConfig);
        this.peerConnections[uuid].addEventListener('icecandidate', function (event) {
            if (event.candidate != null) {
                _this.connection.send(JSON.stringify({
                    'ice': event.candidate,
                    'uuid': _this.uuid,
                    targetUuid: uuid
                }));
            }
        });
        // (peerConnection as any).ontrack = gotRemoteStream;
        // this.peerConnections[uuid].addStream(this.myStream as MediaStream);
        this.peerConnections[uuid].addTrack(this.myStream.getVideoTracks()[0], this.myStream);
        this.peerConnections[uuid].createOffer().then(function (description) {
            console.log('Got Description', description);
            _this.peerConnections[uuid].setLocalDescription(description).then(function () {
                _this.connection.send(JSON.stringify({
                    'sdp': _this.peerConnections[uuid].localDescription,
                    'uuid': _this.uuid,
                    targetUuid: uuid
                }));
            }).catch(_this.error);
        }).catch(this.error);
    };
    RTCProducer.prototype.messageRecieved = function (message) {
        var signal = JSON.parse(message.data);
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
        if (signal.uuid == this.uuid || signal.targetUuid !== this.uuid)
            return;
        if (signal.ice) {
            this.peerConnections[signal.uuid].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(this.error);
        }
        if (signal.sdp) {
            this.peerConnections[signal.uuid].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function () { }).catch(this.error);
        }
    };
    return RTCProducer;
}());
var RTCConsumer = /** @class */ (function (_super) {
    __extends(RTCConsumer, _super);
    function RTCConsumer() {
        var _this = _super.call(this) || this;
        _this.remoteVideo = document.getElementById('remoteVideo');
        return _this;
    }
    Object.defineProperty(RTCConsumer.prototype, "isProducer", {
        get: function () {
            return false;
        },
        enumerable: true,
        configurable: true
    });
    RTCConsumer.prototype.init = function () {
        var _this = this;
        window['Consumer'] = this;
        this.connection.addEventListener('message', this.messageRecieved.bind(this));
        setTimeout(function () {
            _this.connection.send(JSON.stringify({
                message: "RequestingConnection", uuid: _this.uuid
            }));
        }, 1000);
    };
    RTCConsumer.prototype.createConnection = function (uuid) {
        var _this = this;
        this.peerConnections[uuid] = new RTCPeerConnection(Utils.peerConnectionConfig);
        this.peerConnections[uuid].addEventListener('icecandidate', function (event) {
            if (event.candidate != null) {
                _this.connection.send(JSON.stringify({
                    'ice': event.candidate,
                    'uuid': _this.uuid,
                    targetUuid: uuid
                }));
            }
        });
        this.peerConnections[uuid].addEventListener('track', function (e) {
            _this.remoteVideo.srcObject = e.streams[0];
        });
    };
    RTCConsumer.prototype.messageRecieved = function (message) {
        var _this = this;
        var signal = JSON.parse(message.data);
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
        if (signal.uuid == this.uuid || signal.targetUuid !== this.uuid)
            return;
        if (this.peerConnections[signal.uuid]) {
            if (signal.ice) {
                this.peerConnections[signal.uuid].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(this.error);
            }
            if (signal.sdp) {
                this.peerConnections[signal.uuid].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function () {
                    // Only create answers in response to offers
                    if (signal.sdp.type == 'offer') {
                        _this.peerConnections[signal.uuid].createAnswer().then(function (description) {
                            console.log('Got Description', description);
                            console.log(_this.peerConnections[signal.uuid]);
                            _this.peerConnections[signal.uuid].setLocalDescription(description).then(function () {
                                _this.connection.send(JSON.stringify({
                                    'sdp': _this.peerConnections[signal.uuid].localDescription,
                                    'uuid': _this.uuid,
                                    targetUuid: signal.uuid
                                }));
                            }).catch(_this.error);
                        }).catch(_this.error);
                    }
                }).catch(this.error);
            }
        }
    };
    return RTCConsumer;
}(RTCProducer));
