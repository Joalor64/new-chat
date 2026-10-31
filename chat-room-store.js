function createChatStore(initialRooms = ['general']) {
    const rooms = new Map();

    function normalizeRoomName(roomName) {
        const cleaned = String(roomName || 'general').trim();
        return cleaned || 'general';
    }

    function ensureRoom(name) {
        const roomName = normalizeRoomName(name);

        if (!rooms.has(roomName)) {
            rooms.set(roomName, {
                messages: [],
                members: []
            });
        }

        return roomName;
    }

    function isRoomNameTaken(name) {
        return rooms.has(normalizeRoomName(name));
    }

    initialRooms.forEach(room => ensureRoom(room));

    return {
        ensureRoom,
        isRoomNameTaken,
        getRoomNames() {
            return Array.from(rooms.keys());
        },
        getRoomMessages(roomName) {
            const room = rooms.get(ensureRoom(roomName));
            return room ? room.messages : [];
        },
        addMessage(roomName, data) {
            const room = ensureRoom(roomName);
            const roomState = rooms.get(room);
            roomState.messages.push(data);

            while (roomState.messages.length > 100) {
                roomState.messages.shift();
            }

            return data;
        },
        addMember(roomName, memberName) {
            const room = ensureRoom(roomName);
            const roomState = rooms.get(room);
            const cleaned = String(memberName || '').trim();

            if (!cleaned || roomState.members.includes(cleaned)) {
                return roomState.members;
            }

            roomState.members.push(cleaned);
            return roomState.members;
        },
        removeMember(roomName, memberName) {
            const room = ensureRoom(roomName);
            const roomState = rooms.get(room);
            const cleaned = String(memberName || '').trim();

            roomState.members = roomState.members.filter(member => member !== cleaned);
            return roomState.members;
        },
        getRoomMembers(roomName) {
            const room = rooms.get(ensureRoom(roomName));
            return room ? room.members : [];
        },
        renameRoom(oldName, newName) {
            const previousRoom = normalizeRoomName(oldName);
            const nextRoom = normalizeRoomName(newName);

            if (!rooms.has(previousRoom) || previousRoom === nextRoom) {
                return null;
            }

            const roomState = rooms.get(previousRoom);
            rooms.delete(previousRoom);
            rooms.set(nextRoom, roomState || { messages: [], members: [] });
            return nextRoom;
        },
        deleteRoom(roomName) {
            const room = normalizeRoomName(roomName);
            const deleted = rooms.get(room);
            rooms.delete(room);
            return deleted;
        },
        clearRoom(roomName) {
            const room = ensureRoom(roomName);
            rooms.set(room, { messages: [], members: [] });
        }
    };
}

module.exports = { createChatStore };
