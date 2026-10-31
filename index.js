const express = require('express');
const app = express();
const { Server } = require('socket.io');
const http = require('http');
const { createChatStore } = require('./chat-room-store');

const server = http.createServer(app);
const io = new Server(server);
const preferredPort = Number(process.env.PORT) || 5000;
const chatStore = createChatStore(['general']);
const typingUsersByRoom = new Map();

function clearTypingForSocket(socket) {
    for (const [room, users] of typingUsersByRoom.entries()) {
        users.delete(socket.id);
        if (users.size === 0) {
            typingUsersByRoom.delete(room);
        }
    }
}

function emitTypingState(roomName, typingArray) {
    const room = normalizeRoomName(roomName || 'general');
    const names = Array.from(new Set(typingArray.filter(Boolean)));
    io.to(room).emit('typing status', {
        room,
        typingUsers: names
    });
}

function normalizeRoomName(roomName) {
    const cleaned = String(roomName || '').trim();
    if (!cleaned) return 'general';
    return cleaned.replace(/\s+/g, ' ');
}

function emitRoomSnapshot(roomName) {
    const targetRoom = normalizeRoomName(roomName || 'general');
    const roomMembers = chatStore.getRoomMembers(targetRoom);
    io.emit('room list', chatStore.getRoomNames());
    io.emit('room members', { room: targetRoom, members: roomMembers });
}

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

function startServer(port, attempt = 0) {
    server.once('error', err => {
        if (err.code === 'EADDRINUSE' && attempt < 10) {
            const nextPort = port + 1;
            console.log(`Port ${port} is busy, trying ${nextPort} instead...`);
            startServer(nextPort, attempt + 1);
            return;
        }

        throw err;
    });

    server.listen(port, () => console.log(`Server running on port ${port}`));
}

io.on('connection', socket => {
    socket.data.currentRoom = 'general';
    socket.emit('room list', chatStore.getRoomNames());
    socket.emit('active room', 'general');
    socket.emit('room messages', chatStore.getRoomMessages('general'));
    socket.emit('room members', { room: 'general', members: chatStore.getRoomMembers('general') });

    socket.on('join room', ({ roomName } = {}) => {
        const room = normalizeRoomName(roomName || 'general');
        const safeRoom = chatStore.ensureRoom(room);

        for (const joinedRoom of socket.rooms) {
            if (joinedRoom !== socket.id && joinedRoom !== safeRoom) {
                socket.leave(joinedRoom);
            }
        }

        clearTypingForSocket(socket);
        socket.join(safeRoom);
        socket.data.currentRoom = safeRoom;
        socket.emit('active room', safeRoom);
        socket.emit('room messages', chatStore.getRoomMessages(safeRoom));
        socket.emit('room members', { room: safeRoom, members: chatStore.getRoomMembers(safeRoom) });
    });

    socket.on('create room', roomName => {
        const cleanRoomName = normalizeRoomName(roomName);

        if (!cleanRoomName || cleanRoomName === 'general' && chatStore.isRoomNameTaken('general')) {
            socket.emit('room error', 'Room name is invalid.');
            return;
        }

        if (chatStore.isRoomNameTaken(cleanRoomName)) {
            socket.emit('room error', `Room "${cleanRoomName}" already exists.`);
            return;
        }

        const room = chatStore.ensureRoom(cleanRoomName);
        emitRoomSnapshot(room);

        socket.join(room);
        socket.data.currentRoom = room;
        socket.emit('active room', room);
        socket.emit('room messages', chatStore.getRoomMessages(room));
        socket.emit('room members', { room, members: chatStore.getRoomMembers(room) });
    });

    socket.on('rename room', ({ oldName, newName } = {}) => {
        const previousRoom = normalizeRoomName(oldName);
        const nextRoom = normalizeRoomName(newName);

        if (!previousRoom || !nextRoom || previousRoom === nextRoom) {
            socket.emit('room error', 'Please provide a valid room name.');
            return;
        }

        const renamed = chatStore.renameRoom(previousRoom, nextRoom);
        if (!renamed) {
            socket.emit('room error', `Room "${previousRoom}" could not be renamed.`);
            return;
        }

        io.emit('room list', chatStore.getRoomNames());
        io.emit('room members', { room: renamed, members: chatStore.getRoomMembers(renamed) });

        if (socket.data.currentRoom === previousRoom) {
            socket.data.currentRoom = renamed;
            socket.emit('active room', renamed);
            socket.emit('room messages', chatStore.getRoomMessages(renamed));
            socket.emit('room members', { room: renamed, members: chatStore.getRoomMembers(renamed) });
        }
    });

    socket.on('delete room', roomName => {
        const room = normalizeRoomName(roomName);

        if (!room || room === 'general') {
            socket.emit('room error', 'You cannot delete the general room.');
            return;
        }

        chatStore.deleteRoom(room);
        io.emit('room list', chatStore.getRoomNames());

        if (socket.data.currentRoom === room) {
            socket.data.currentRoom = 'general';
            socket.emit('active room', 'general');
            socket.emit('room messages', chatStore.getRoomMessages('general'));
            socket.emit('room members', { room: 'general', members: chatStore.getRoomMembers('general') });
        }
    });

    socket.on('presence', ({ roomName, userName } = {}) => {
        const room = normalizeRoomName(roomName || 'general');
        const user = String(userName || '').trim();

        if (!user) return;

        chatStore.addMember(room, user);
        io.emit('room members', { room, members: chatStore.getRoomMembers(room) });
    });

    socket.on('typing', ({ roomName, userName, isTyping } = {}) => {
        const room = normalizeRoomName(roomName || 'general');
        const user = String(userName || '').trim();

        if (!user) return;

        const roomTypingUsers = typingUsersByRoom.get(room) || new Map();
        if (Boolean(isTyping)) {
            roomTypingUsers.set(socket.id, user);
        } else {
            roomTypingUsers.delete(socket.id);
        }

        if (roomTypingUsers.size > 0) {
            typingUsersByRoom.set(room, roomTypingUsers);
        } else {
            typingUsersByRoom.delete(room);
        }

        const typingNames = Array.from(roomTypingUsers.values());
        socket.emit('typing status', { room, typingUsers: typingNames });
        emitTypingState(room, typingNames);
    });

    socket.on('chat message', data => {
        const room = data.room || socket.data.currentRoom || 'general';
        const sanitized = {
            ...data,
            room,
            user: String(data.user || 'Unknown').slice(0, 30),
            text: String(data.text || '').slice(0, 500)
        };

        chatStore.addMessage(room, sanitized);
        if (typingUsersByRoom.has(room)) {
            typingUsersByRoom.get(room).delete(socket.id);
            if (typingUsersByRoom.get(room).size === 0) {
                typingUsersByRoom.delete(room);
            }
        }
        io.to(room).emit('chat message', sanitized);
        emitTypingState(room, Array.from((typingUsersByRoom.get(room) || new Map()).values()));
    });

    socket.on('disconnect', () => {
        clearTypingForSocket(socket);
    });
});

startServer(preferredPort);