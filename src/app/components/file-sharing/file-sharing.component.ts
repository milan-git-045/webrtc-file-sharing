import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { WebrtcService } from '../../services/webrtc.service';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-file-sharing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-sharing.component.html',
  styleUrls: ['./file-sharing.component.scss']
})
export class FileSharingComponent implements OnInit, OnDestroy {
  isConnected = false;
  transferProgress = 0;
  selectedFile: File | null = null;
  connectionStatus = 'disconnected';
  receivedFile: { name: string; type: string; size: number } | null = null;
  isSending = false;
  isReceiving = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private webrtcService: WebrtcService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.subscriptions.push(
      this.webrtcService.fileProgress.subscribe(progress => {
        this.ngZone.run(() => {
          this.transferProgress = progress;
          if (progress === 0) {
            this.isSending = false;
            this.isReceiving = false;
          }
          this.cdr.detectChanges();
        });
      }),

      this.webrtcService.fileReceived.subscribe(fileInfo => {
        this.ngZone.run(() => {
          this.receivedFile = fileInfo;
          this.isReceiving = false;
          this.transferProgress = 0;
          this.cdr.detectChanges();
        });
      }),

      this.webrtcService.fileSent.subscribe(() => {
        this.ngZone.run(() => {
          this.isSending = false;
          this.selectedFile = null;
          this.transferProgress = 0;
          this.cdr.detectChanges();
        });
      }),

      this.webrtcService.connectionState.subscribe(state => {
        this.ngZone.run(() => {
          this.connectionStatus = state;
          this.isConnected = state === 'connected';
          if (state === 'disconnected') {
            this.resetState();
          }
          this.cdr.detectChanges();
        });
      })
    );
  }

  private resetState() {
    this.selectedFile = null;
    this.receivedFile = null;
    this.transferProgress = 0;
    this.isSending = false;
    this.isReceiving = false;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async initializeConnection(isInitiator: boolean) {
    try {
      await this.webrtcService.initiatePeerConnection(isInitiator);
    } catch (error) {
      console.error('Failed to initialize connection:', error);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.ngZone.run(() => {
        this.selectedFile = input.files![0];
        this.cdr.detectChanges();
      });
    }
  }

  async sendFile() {
    if (this.selectedFile) {
      try {
        this.ngZone.run(() => {
          this.isSending = true;
          this.transferProgress = 0;
          this.cdr.detectChanges();
        });
        
        await this.webrtcService.sendFile(this.selectedFile);
      } catch (error) {
        console.error('Error sending file:', error);
        this.ngZone.run(() => {
          this.isSending = false;
          this.transferProgress = 0;
          this.cdr.detectChanges();
        });
      }
    }
  }

  downloadFile() {
    if (!this.receivedFile) return;

    const blob = this.webrtcService.getReceivedFileBlob();
    if (!blob) {
      console.error('No file data available');
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.receivedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.ngZone.run(() => {
      this.receivedFile = null;
      this.transferProgress = 0;
      this.cdr.detectChanges();
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
