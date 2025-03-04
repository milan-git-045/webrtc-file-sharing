# WebRTC File Sharing Application

A peer-to-peer file sharing application built with Angular and WebRTC that allows direct file transfer between browsers without storing files on a server.

## Features

- Direct peer-to-peer file transfer using WebRTC
- Room-based connection system for secure peer pairing
- Support for cross-network file sharing using STUN/TURN servers
- Real-time transfer progress tracking
- Modern and responsive UI
- File download control for receivers
- Automatic connection state management
- Support for large file transfers

## Prerequisites

- Node.js (v14 or higher)
- Angular CLI
- A modern web browser that supports WebRTC (Chrome, Firefox, Edge, etc.)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd webrtc-file-sharing
```

2. Install dependencies for both client and server:
```bash
# Install client dependencies
npm install

# Install server dependencies
cd server
npm install
```

## Configuration

1. Server Configuration:
- Open `server/server.js`
- The server runs on port 3000 by default
- CORS is configured to accept connections from any origin

2. Client Configuration:
- Open `src/app/services/webrtc.service.ts`
- Update the Socket.IO server URL to match your server's address
- STUN/TURN server configuration is included for cross-network support

## Running the Application

1. Start the signaling server:
```bash
cd server
node server.js
```

2. Start the Angular application:
```bash
ng serve
```

3. Access the application:
- Open your browser and navigate to `http://localhost:4200`
- For cross-device testing, use your machine's IP address instead of localhost

## Usage

1. Creating a Connection:
   - First user clicks "Create Room"
   - Waits for the second user to join

2. Joining a Connection:
   - Second user clicks "Join Room"
   - Connection is established automatically

3. Sending Files:
   - Click "Choose a file" to select a file
   - Click "Share File" to start the transfer
   - Progress bar shows transfer status

4. Receiving Files:
   - File information is displayed when transfer starts
   - Progress bar shows download progress
   - Click "Download File" when transfer is complete

## Technical Details

### Client-Side Architecture
- Built with Angular
- Uses WebRTC's RTCPeerConnection for peer-to-peer connections
- Uses WebRTC's RTCDataChannel for file transfer
- Socket.IO client for signaling

### Server-Side Architecture
- Node.js with Express
- Socket.IO for signaling
- Room-based connection management
- Handles WebRTC offer/answer exchange

### Network Support
- Uses multiple STUN servers for NAT traversal
- TURN server support for fallback when direct connection fails
- Supports both UDP and TCP protocols

## Troubleshooting

1. Connection Issues:
   - Ensure both peers are using compatible browsers
   - Check if the signaling server is running
   - Verify network firewall settings
   - Check browser console for connection state logs

2. File Transfer Issues:
   - Large files are sent in chunks
   - Progress updates are real-time
   - Connection status is monitored continuously

## Security Considerations

- Files are transferred directly between peers
- No data is stored on the server
- All connections are peer-to-peer
- TURN server credentials should be secured in production

## Known Limitations

- Requires modern browser with WebRTC support
- Both peers must be online simultaneously
- Transfer speed depends on network conditions
- Maximum file size depends on available memory

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
