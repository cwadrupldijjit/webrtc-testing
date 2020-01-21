import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { WebsocketService } from '../websocket.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss']
})
export class ResultsComponent implements OnInit {

  @ViewChild('video', { static: true })
  remoteVideo: ElementRef<HTMLVideoElement>;

  private mediaStream: MediaStream;
  private peerConnection: RTCPeerConnection;
  private roomKey: string;

  constructor(route: ActivatedRoute, private websocketService: WebsocketService) {
    websocketService.socket.on('rtcDescription', (description: RTCSessionDescription) => {
      this.peerConnection.setRemoteDescription(description);
    });
    route.queryParams.subscribe(params => {
      if (this.roomKey) {
        websocketService.sendMessage(this.roomKey, 'leaveRoom');
      }
      
      this.roomKey = params.roomId;

      this.tryStartCall();
    });

    websocketService.socket.on('rtcDescription', (description: RTCSessionDescription) => {
      this.peerConnection.setRemoteDescription(description);
    });

    websocketService.socket.on('candidate', (candidate) => {
      this.peerConnection.addIceCandidate(new RTCIceCandidate({
        sdpMLineIndex: candidate.label,
        candidate: candidate.candidate,
      }));
    });
  }

  ngOnInit() {
  }

  joinCall() {
    if (!this.peerConnection) {
      this.peerConnection = new RTCPeerConnection();
      this.peerConnection.addEventListener('track', this.handleRemoteStreamAdd);
    }

    this.tryStartCall();
  }

  private handleRemoteStreamAdd = (event: RTCTrackEvent) => {
    this.remoteVideo.nativeElement.srcObject = event.streams[0];
  };

  private tryStartCall() {
    if (this.peerConnection && this.roomKey) {
      this.websocketService.sendMessage(this.roomKey, 'joinRoom');
    }
  }

}
