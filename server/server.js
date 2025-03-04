const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

// Keep track of rooms and their states
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle room creation
  socket.on('create-room', () => {
    console.log('Room created by:', socket.id);
    rooms.set(socket.id, {
      creator: socket.id,
      joiner: null
    });
    socket.emit('room-created', socket.id);
  });

  // Handle room joining
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    if (room && !room.joiner) {
      room.joiner = socket.id;
      console.log(`User ${socket.id} joined room ${roomId}`);
      socket.emit('joined-room', roomId);
      
      // Notify the room creator
      io.to(roomId).emit('peer-joined', socket.id);
    } else {
      socket.emit('join-error', 'Room not found or already full');
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    const room = Array.from(rooms.values()).find(
      r => (r.creator === socket.id && r.joiner) || r.joiner === socket.id
    );
    if (room) {
      const targetId = room.creator === socket.id ? room.joiner : room.creator;
      io.to(targetId).emit('offer', data);
    }
  });

  socket.on('answer', (data) => {
    const room = Array.from(rooms.values()).find(
      r => (r.creator === socket.id && r.joiner) || r.joiner === socket.id
    );
    if (room) {
      const targetId = room.creator === socket.id ? room.joiner : room.creator;
      io.to(targetId).emit('answer', data);
    }
  });

  socket.on('ice-candidate', (data) => {
    const room = Array.from(rooms.values()).find(
      r => (r.creator === socket.id && r.joiner) || r.joiner === socket.id
    );
    if (room) {
      const targetId = room.creator === socket.id ? room.joiner : room.creator;
      io.to(targetId).emit('ice-candidate', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up rooms when creator or joiner disconnects
    for (const [roomId, room] of rooms.entries()) {
      if (room.creator === socket.id || room.joiner === socket.id) {
        if (room.creator === socket.id) {
          if (room.joiner) {
            io.to(room.joiner).emit('peer-disconnected');
          }
        } else if (room.joiner === socket.id) {
          io.to(room.creator).emit('peer-disconnected');
        }
        rooms.delete(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
