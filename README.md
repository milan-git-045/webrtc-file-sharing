# WebRTC File Sharing

A real-time peer-to-peer file sharing application built with Angular and WebRTC. This application allows users to share files directly between browsers without uploading them to a server.

## Features

- Direct peer-to-peer file transfer using WebRTC
- Real-time file transfer progress tracking
- Support for any file type
- Simple room-based connection system
- Clean and modern UI
- No file size limitations (browser dependent)
- No server storage required - files are transferred directly between peers

## Prerequisites

- Node.js (v18 or higher)
- Angular CLI (v19.0.0)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd webrtc-file-sharing
```

2. Install dependencies for both client and server:
```bash
# Install client dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

## Running the Application

1. Start the signaling server:
```bash
npm run server
```

2. In a new terminal, start the Angular application:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:4200`

## How to Use

1. **First Device (Sender)**:
   - Click "Create Room"
   - A Room ID will be displayed
   - Share this Room ID with the person you want to connect with

2. **Second Device (Receiver)**:
   - Enter the Room ID provided by the sender
   - Click "Join Room"
   - Wait for the connection to be established

3. **File Sharing**:
   - Once connected, either user can send files
   - Click "Choose a file to share" to select a file
   - Click "Share File" to start the transfer
   - The receiver will see the file details and can download it

## Technical Details

### Client-side (Angular)

- Built with Angular v19
- Uses WebRTC data channels for peer-to-peer communication
- Real-time progress tracking
- Handles large files by chunking

### Server-side (Node.js)

- Express.js server for signaling
- Socket.IO for real-time communication
- Manages room creation and peer connections
- No file storage - only handles connection setup

### WebRTC Features

- Uses STUN servers for NAT traversal
- Implements reliable data transfer
- Handles connection state management
- Supports various file types and sizes

## Architecture

The application follows a clean architecture with separate concerns:

- **Signaling Server**: Handles room creation and peer discovery
- **WebRTC Service**: Manages peer connections and file transfer
- **UI Components**: Handle user interaction and file selection
- **Real-time Updates**: Progress tracking and connection state management

## Browser Support

This application works on modern browsers that support WebRTC:
- Chrome (recommended)
- Firefox
- Edge
- Safari

## Development

### Project Structure
```
webrtc-file-sharing/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   └── file-sharing/
│   │   └── services/
│   │       └── webrtc.service.ts
│   └── ...
├── server/
│   └── server.js
└── ...
```

### Key Components

- `WebrtcService`: Handles WebRTC connection and file transfer logic
- `FileSharingComponent`: Main UI component for file sharing
- `server.js`: Signaling server implementation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
