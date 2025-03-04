import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class WebrtcService {
  private peerConnection!: RTCPeerConnection;
  private dataChannel!: RTCDataChannel;
  private socket!: Socket;
  private currentRoom: string | null = null;
  private readonly configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  private currentFileMetadata: { name: string; type: string; size: number } | null = null;
  private currentFileChunks: ArrayBuffer[] = [];

  public fileProgress = new Subject<number>();
  public fileReceived = new Subject<{ name: string; type: string; size: number }>();
  public fileSent = new Subject<void>();
  public connectionState = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');
  public connectionError = new Subject<string>();
  public roomCreated = new Subject<string>();
  private pendingFile: { file: File, resolve: () => void, reject: (error: Error) => void } | null = null;

  constructor() {
    this.socket = io('http://192.168.29.144:3000');
    this.setupSocketListeners();
    console.log("currentRoom : " + this.currentRoom);
  }

  private setupSocketListeners() {
    this.socket.on('room-created', (roomId: string) => {
      console.log('Room created:', roomId);
      this.currentRoom = roomId;
      this.roomCreated.next(roomId);
      this.connectionState.next('connecting');
    });

    this.socket.on('joined-room', (roomId: string) => {
      console.log('Joined room:', roomId);
      this.currentRoom = roomId;
    });

    this.socket.on('join-error', (error: string) => {
      console.error('Join error:', error);
      this.connectionError.next(error);
      this.connectionState.next('disconnected');
    });

    this.socket.on('peer-joined', async () => {
      console.log('Peer joined, creating offer');
      if (this.peerConnection && this.currentRoom) {
        try {
          const offer = await this.peerConnection.createOffer();
          await this.peerConnection.setLocalDescription(offer);
          this.socket.emit('offer', offer);
        } catch (error) {
          console.error('Error creating offer:', error);
        }
      }
    });

    this.socket.on('peer-disconnected', () => {
      console.log('Peer disconnected');
      this.connectionState.next('disconnected');
      this.resetConnection();
      this.currentRoom = null;
    });

    this.socket.on('offer', async (offer: RTCSessionDescriptionInit) => {
      try {
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.socket.emit('answer', answer);
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    this.socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
      if (this.peerConnection && this.peerConnection.signalingState === 'have-local-offer') {
        await this.peerConnection.setRemoteDescription(answer);
      }
    });

    this.socket.on('ice-candidate', async (candidate: RTCIceCandidateInit) => {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    });
  }

  public async initiatePeerConnection(isInitiator: boolean) {
    this.resetConnection();
    this.peerConnection = new RTCPeerConnection(this.configuration);

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.peerConnection.iceConnectionState);
      if (this.peerConnection.iceConnectionState === 'connected') {
        this.connectionState.next('connected');
      } else if (this.peerConnection.iceConnectionState === 'disconnected') {
        this.connectionState.next('disconnected');
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', event.candidate);
      }
    };

    if (isInitiator) {
      // Create room and wait for peer
      this.currentRoom = null;
      this.socket.emit('create-room');
      this.dataChannel = this.peerConnection.createDataChannel('fileTransfer');
      this.setupDataChannel();
    } else {
      // Join existing room
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }

  public async joinRoom(roomId: string) {
    await this.initiatePeerConnection(false);
    this.socket.emit('join-room', roomId);
  }

  public getCurrentRoom(): string | null {
    return this.currentRoom;
  }

  private resetConnection() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    this.resetFileTransfer();
  }

  private setupDataChannel() {
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('DataChannel is open');
      this.connectionState.next('connected');
      if (this.pendingFile) {
        this.sendFileData(this.pendingFile.file)
          .then(() => {
            this.pendingFile?.resolve();
            this.pendingFile = null;
          })
          .catch(error => {
            this.pendingFile?.reject(error);
            this.pendingFile = null;
          });
      }
    };

    this.dataChannel.onclose = () => {
      console.log('DataChannel is closed');
      this.connectionState.next('disconnected');
      this.resetFileTransfer();
    };

    this.dataChannel.onerror = (error) => {
      console.error('DataChannel error:', error);
      if (this.pendingFile) {
        this.pendingFile.reject(new Error('DataChannel error occurred'));
        this.pendingFile = null;
      }
      this.resetFileTransfer();
    };

    this.dataChannel.onmessage = (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        try {
          const metadata = JSON.parse(data);
          this.currentFileMetadata = metadata;
          this.currentFileChunks = [];
          console.log('Receiving file:', metadata);
          this.fileProgress.next(0);
        } catch (error) {
          console.error('Error parsing file metadata:', error);
        }
      } else {
        if (this.currentFileMetadata) {
          this.currentFileChunks.push(data);
          const currentSize = this.currentFileChunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const progress = Math.min((currentSize / this.currentFileMetadata.size) * 100, 100);

          setTimeout(() => {
            this.fileProgress.next(progress);
          });

          if (currentSize >= this.currentFileMetadata.size) {
            setTimeout(() => {
              this.fileReceived.next(this.currentFileMetadata!);
              this.fileProgress.next(0); // Reset progress after completion
              console.log('File transfer complete');
            });
          }
        }
      }
    };
  }

  private resetFileTransfer() {
    this.currentFileMetadata = null;
    this.currentFileChunks = [];
    this.fileProgress.next(0);
  }

  public getReceivedFileBlob(): Blob | null {
    if (!this.currentFileMetadata || this.currentFileChunks.length === 0) {
      return null;
    }

    return new Blob(this.currentFileChunks, { type: this.currentFileMetadata.type });
  }

  public async sendFile(file: File): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.log('DataChannel not ready, queuing file');
      return new Promise((resolve, reject) => {
        this.pendingFile = { file, resolve, reject };
      });
    }
    return this.sendFileData(file);
  }

  private async sendFileData(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const chunkSize = 16384;
      const fileReader = new FileReader();
      let offset = 0;

      try {
        this.fileProgress.next(0);

        this.dataChannel.send(JSON.stringify({
          name: file.name,
          type: file.type,
          size: file.size
        }));

        fileReader.onload = (e) => {
          if (e.target?.result && this.dataChannel.readyState === 'open') {
            try {
              this.dataChannel.send(e.target.result as ArrayBuffer);
              offset += chunkSize;

              const progress = Math.min((offset / file.size) * 100, 100);

              setTimeout(() => {
                this.fileProgress.next(progress);

                if (progress >= 100) {
                  // Notify that file sending is complete
                  setTimeout(() => {
                    this.fileSent.next();
                    this.fileProgress.next(0);
                    resolve();
                  }, 100);
                } else if (offset < file.size) {
                  readSlice(offset);
                }
              });
            } catch (error) {
              reject(error);
            }
          }
        };

        fileReader.onerror = () => {
          reject(new Error('Error reading file'));
        };

        const readSlice = (o: number) => {
          const slice = file.slice(o, o + chunkSize);
          fileReader.readAsArrayBuffer(slice);
        };

        readSlice(0);
      } catch (error) {
        reject(error);
      }
    });
  }

  public async handleOffer(offer: RTCSessionDescriptionInit) {
    try {
      await this.peerConnection.setRemoteDescription(offer);
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socket.emit('answer', answer);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }
}
