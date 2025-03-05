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
  private receivedFileBlob: Blob | null = null;

  public fileProgress = new Subject<number>();
  public fileReceived = new Subject<{ name: string; type: string; size: number }>();
  public fileSent = new Subject<void>();
  public connectionState = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');
  public connectionError = new Subject<string>();
  public roomCreated = new Subject<string>();
  private pendingFile: { file: File, resolve: () => void, reject: (error: Error) => void } | null = null;

  // File transfer configuration
  private readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks
  private readonly MAX_BUFFER_SIZE = 1024 * 1024; // 1MB buffer
  private fileReader: FileReader | null = null;
  private currentOffset = 0;
  private sendingInProgress = false;

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
    let receivedSize = 0;
    let expectedSize = 0;
    const chunks: ArrayBuffer[] = [];

    this.dataChannel.onmessage = async (event) => {
      const data = event.data;
      
      if (typeof data === 'string') {
        try {
          const metadata = JSON.parse(data);
          this.currentFileMetadata = metadata;
          expectedSize = metadata.size;
          receivedSize = 0;
          chunks.length = 0;
          this.receivedFileBlob = null;
          this.fileProgress.next(0);
          console.log('Receiving file:', metadata);
        } catch (error) {
          console.error('Error parsing file metadata:', error);
        }
      } else if (data instanceof ArrayBuffer && this.currentFileMetadata) {
        chunks.push(data);
        receivedSize += data.byteLength;
        
        // Calculate progress
        const progress = Math.min(100, Math.round((receivedSize * 100) / expectedSize));
        this.fileProgress.next(progress);

        // Check if file is complete
        if (receivedSize >= expectedSize) {
          this.receivedFileBlob = new Blob(chunks, { type: this.currentFileMetadata.type });
          this.fileReceived.next(this.currentFileMetadata);
          
          // Clear temporary chunks array but keep the blob for download
          chunks.length = 0;
        }
      }
    };

    this.dataChannel.onopen = () => {
      console.log('DataChannel is open');
      this.connectionState.next('connected');
      if (this.pendingFile) {
        this.sendFile(this.pendingFile.file)
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
  }

  private resetFileTransfer() {
    this.currentFileMetadata = null;
    this.receivedFileBlob = null;
    this.fileProgress.next(0);
  }

  public async sendFile(file: File): Promise<void> {
    if (this.sendingInProgress) {
      throw new Error('A file transfer is already in progress');
    }

    try {
      this.sendingInProgress = true;
      
      // Send file metadata first
      const metadata = {
        name: file.name,
        type: file.type,
        size: file.size,
        chunks: Math.ceil(file.size / this.CHUNK_SIZE)
      };
      this.dataChannel.send(JSON.stringify(metadata));

      // Reset state
      this.currentOffset = 0;
      this.fileReader = new FileReader();
      
      await this.sendFileChunks(file);
      
      this.fileSent.next();
    } finally {
      this.sendingInProgress = false;
      this.fileReader = null;
      this.currentOffset = 0;
    }
  }

  private async sendFileChunks(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.fileReader) {
        reject(new Error('FileReader not initialized'));
        return;
      }

      this.fileReader.onerror = () => {
        reject(new Error('Error reading file'));
      };

      this.fileReader.onload = async (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          try {
            // Wait if the buffer is too full
            while (this.dataChannel.bufferedAmount > this.MAX_BUFFER_SIZE) {
              await new Promise(r => setTimeout(r, 100));
            }

            this.dataChannel.send(e.target.result);
            this.currentOffset += this.CHUNK_SIZE;

            // Calculate and emit progress
            const progress = Math.min(100, Math.round((this.currentOffset * 100) / file.size));
            this.fileProgress.next(progress);

            // Read next chunk or finish
            if (this.currentOffset < file.size) {
              this.readNextChunk(file);
            } else {
              resolve();
            }
          } catch (error) {
            reject(error);
          }
        }
      };

      // Start reading the first chunk
      this.readNextChunk(file);
    });
  }

  private readNextChunk(file: File) {
    const slice = file.slice(this.currentOffset, this.currentOffset + this.CHUNK_SIZE);
    this.fileReader?.readAsArrayBuffer(slice);
  }

  public getReceivedFileBlob(): Blob | null {
    return this.receivedFileBlob;
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
