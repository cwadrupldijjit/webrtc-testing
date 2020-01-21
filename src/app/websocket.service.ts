import { Injectable } from '@angular/core';
import * as io from 'socket.io-client';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {

  messages = new BehaviorSubject<SocketMessage>(null);

  readonly socket = io({
    transportOptions: {
      polling: {
        extraHeaders: {
          Authorization: 'Bearer foo',
          previousId: null,
        },
      },
    },
  });
  
  private currentId: string;

  constructor() {
    this.socket.on('connect', () => {
      if (this.currentId && this.currentId != this.socket.id) {
        this.socket.emit('resumePosition', this.currentId);
      }
      
      this.currentId = this.socket.id;
      console.log(this.socket.id);
    });
    
    this.socket.on('message', event => {
      this.messages.next(event);
    });
  }

  sendMessage(data: any, eventName = 'message', ...additionalArgs: any[]) {
    this.socket.emit(eventName, data, ...additionalArgs);
  }
}

export interface SocketMessage<T = any> {
  type: string;
  payload: T;
}
