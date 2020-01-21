import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { WebsocketService } from '../websocket.service';

@Component({
  selector: 'app-record',
  templateUrl: './record.component.html',
  styleUrls: ['./record.component.scss']
})
export class RecordComponent implements OnInit {
  @ViewChild('video', { static: true })
  videoElement: ElementRef<HTMLVideoElement>;

  get seeCallButton() {
    return this.mediaStream && !this.callStarted;
  }

  get seeDisconnectButton() {
    return this.mediaStream && this.callStarted;
  }

  get callStarted() {
    return Boolean(this.peerConnection);
  }

  private mediaStream: MediaStream;

  private mediaStreamConstraints: MediaStreamConstraints = {
    video: true,
  };

  private peerConnection: RTCPeerConnection;
  private roomKey: string;

  constructor(private websocketService: WebsocketService) { }

  ngOnInit() {
    navigator.mediaDevices.getUserMedia(this.mediaStreamConstraints)
      .then(this.onStreamReceived)
      .catch(this.onStreamError);

    this.websocketService.messages.subscribe(message => console.log(message));

    this.websocketService.socket.on('joinedRoom', (roomKey: string, isAdmin = false) => {
      this.roomKey = roomKey;
      console.log(this.roomKey);

      if (isAdmin) {
        this.peerConnection.createOffer()
          .then((description) => {
            this.peerConnection.setLocalDescription(description);
            console.log(description);
            this.websocketService.sendMessage(description, 'sendRtcDescription', this.roomKey);
          })
          .catch(err => console.warn(err));
      }
    });

    this.websocketService.socket.on('joinRequest', (socketId: string, roomKey: string) => {
      this.websocketService.socket.emit('respondToJoinRequest', socketId, roomKey, true);
    });
  }

  clickCall() {
    // this could include other media server configurations passed into the constructor
    this.peerConnection = new RTCPeerConnection(null);
    this.peerConnection.addEventListener('icecandidate', this.onIceCandidateConnection);
    this.peerConnection.addEventListener('iceconnectionstatechange', this.onIceCandidateConnectionChange);

    this.addStream();
    this.websocketService.sendMessage('', 'joinRoom');
  }

  clickDisconnect() {
    // 
  }

  private addStream() {
    this.mediaStream.getTracks().forEach(track => this.peerConnection.addTrack(track));
  }

  private onIceCandidateConnection = (event: RTCPeerConnectionIceEvent) => {
    const iceCandidate = event.candidate;
    console.info('ice candidate received');

    if (iceCandidate) {
      this.websocketService.sendMessage({
        label: iceCandidate.sdpMLineIndex,
        id: iceCandidate.sdpMid,
        candidate: iceCandidate.candidate,
      }, 'sendCandidate', this.roomKey);
    }
  };

  private onIceCandidateConnectionChange = (event: RTCPeerConnectionIceEvent) => {
    // const peerConnection = event.target;
    console.log('ICE state change event: ', event);
  };

  private onStreamReceived = (stream: MediaStream) => {
    this.mediaStream = stream;
    this.videoElement.nativeElement.srcObject = stream;
  };

  private onStreamError = (err) => {
    console.warn(err);
  };

}
