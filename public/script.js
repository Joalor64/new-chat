let socket = io();

const form = document.getElementById("form");
const myname = document.getElementById("myname");
const message = document.getElementById("message");
const messageArea = document.getElementById("messageArea");
const roomList = document.getElementById("room-list");
const roomNameInput = document.getElementById("room-name");
const roomHeader = document.getElementById("room-header");
const createRoomButton = document.getElementById("create-room");
const themeButton = document.getElementById("theme");
const typingStatus = document.getElementById('typing-status');
const memberList = document.createElement('aside');
memberList.className = 'member-panel';
memberList.innerHTML = '<h3>Members</h3><ul id="member-list-items"></ul>';

const emoji = new EmojiConvertor();
emoji.replace_mode = 'unified';
emoji.allow_native = true;

const state = {
    currentRoom: 'general',
    rooms: ['general'],
    members: [],
    typingUsers: {}
};

const scrollToLatestButton = document.getElementById('scroll-to-latest');
const MAX_TYPING_NAMES = 3;

function sanitize(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function parseMessage(message) {
    const colorRegex = /\{\!color:(#[0-9A-Fa-f]{6})\}\s*(.+)/g;
    message = message.replace(colorRegex, (match, color, text) => `<span style="color: ${color};">${text}</span>`);

    const shakeRegex = /\{\!shake\}\s*(.+)/g;
    message = message.replace(shakeRegex, (match, text) => `<span class="shake-message">${text}</span>`);

    const smallTextRegex = /\^(.+?)\^/g;
    message = message.replace(smallTextRegex, (match, text) => `<span class="small-text">${text}</span>`);

    message = emoji.replace_colons(message);

    return message
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/_(.*?)_/g, "<i>$1</i>")
        .replace(/~~(.*?)~~/g, "<s>$1</s>");
}

function displayMessage(data) {
    if (!data || !data.user || !data.text) return;

    const chatContent = document.createElement('p');
    chatContent.classList.add('message');

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const profileImg = data.profilePicture ? `<img class="profile" src="${data.profilePicture}" alt="Profile Picture">` : '';

    chatContent.innerHTML = `
        ${profileImg}
        <span class="username" style="color: ${data.color || '#0a5274'}">${sanitize(data.user)}</span>
        <span class="timestamp">(${time})</span>: ${parseMessage(sanitize(data.text))}
    `;

    messageArea.appendChild(chatContent);

    const shouldAutoScroll = messageArea.scrollHeight - messageArea.scrollTop - messageArea.clientHeight < 120;
    if (shouldAutoScroll) {
        messageArea.scrollTop = messageArea.scrollHeight;
    }

    updateScrollButton();
}

function createRoomRow(room) {
    const roomWrapper = document.createElement('div');
    roomWrapper.className = 'room-item';

    const roomButton = document.createElement('button');
    roomButton.type = 'button';
    roomButton.className = `room-button ${room === state.currentRoom ? 'active' : ''}`;
    roomButton.textContent = `#${room}`;
    roomButton.addEventListener('click', () => switchRoom(room));

    const roomActions = document.createElement('div');
    roomActions.className = 'room-actions';

    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'room-action';
    renameButton.textContent = '✎';
    renameButton.title = 'Rename room';
    renameButton.addEventListener('click', () => renameRoom(room));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'room-action danger';
    deleteButton.textContent = '✕';
    deleteButton.title = 'Delete room';
    deleteButton.addEventListener('click', () => deleteRoom(room));

    roomActions.append(renameButton, deleteButton);
    roomWrapper.append(roomButton, roomActions);
    return roomWrapper;
}

function renderRoomList(roomNames = []) {
    state.rooms = roomNames.length ? roomNames : ['general'];
    roomList.innerHTML = '';

    state.rooms.forEach(room => {
        roomList.appendChild(createRoomRow(room));
    });
}

function renderMemberList(members = []) {
    state.members = [...new Set(members)];
    const memberItems = memberList.querySelector('#member-list-items');
    memberItems.innerHTML = '';

    if (!state.members.length) {
        const emptyMember = document.createElement('li');
        emptyMember.textContent = 'No members yet';
        memberItems.appendChild(emptyMember);
        return;
    }

    state.members.forEach(member => {
        const listItem = document.createElement('li');
        listItem.textContent = member;
        memberItems.appendChild(listItem);
    });
}

function syncPresence(roomName = state.currentRoom) {
    const currentUser = myname.value.trim();
    if (!currentUser) return;

    const room = String(roomName || 'general').trim() || 'general';
    const nextMembers = [...new Set([...(state.members || []).filter(member => member !== currentUser), currentUser])];
    renderMemberList(nextMembers);
    socket.emit('presence', { roomName: room, userName: currentUser });
}

function switchRoom(roomName) {
    const safeRoom = String(roomName || 'general').trim() || 'general';
    state.currentRoom = safeRoom;
    roomHeader.textContent = `#${safeRoom}`;
    messageArea.innerHTML = '';
    updateTypingStatusForRoom(safeRoom);
    if (!state.typingUsers[safeRoom]) {
        state.typingUsers[safeRoom] = new Set();
    }
    socket.emit('join room', { roomName: safeRoom });
    syncPresence(safeRoom);
    renderRoomList(state.rooms);
}

function renameRoom(roomName) {
    const newRoomName = window.prompt('Rename room to:', roomName);
    if (newRoomName === null) return;

    const cleanedName = newRoomName.trim();
    if (!cleanedName) {
        alert('Room names cannot be empty.');
        return;
    }

    socket.emit('rename room', { oldName: roomName, newName: cleanedName });
}

function deleteRoom(roomName) {
    if (roomName === 'general') {
        alert('The general room cannot be deleted.');
        return;
    }

    const confirmed = window.confirm(`Delete the #${roomName} room? This will remove the room and its messages for everyone.`);
    if (!confirmed) return;

    socket.emit('delete room', roomName);
}

function formatTypingUsers(users) {
    const uniqueNames = [...new Set(users.filter(Boolean))];
    if (!uniqueNames.length) {
        return '';
    }

    if (uniqueNames.length === 1) {
        return `${uniqueNames[0]} is typing...`;
    }

    if (uniqueNames.length <= MAX_TYPING_NAMES) {
        if (uniqueNames.length === 2) {
            return `${uniqueNames[0]} and ${uniqueNames[1]} are typing...`;
        }

        return `${uniqueNames.slice(0, -1).join(', ')}, and ${uniqueNames[uniqueNames.length - 1]} are typing...`;
    }

    return `${MAX_TYPING_NAMES} people are typing...`;
}

function updateTypingStatusForRoom(roomName = state.currentRoom) {
    const room = String(roomName || 'general').trim() || 'general';
    const typingNames = [...(state.typingUsers[room] || new Set())];
    const message = formatTypingUsers(typingNames);
    updateTypingStatus(message);
}

function updateTypingStatus(text) {
    if (!typingStatus) return;
    typingStatus.textContent = text || 'No one is typing.';
}

const style = document.createElement('style');
style.innerHTML = `
    .shake { display: inline-block; transition: transform 0.05s; }
    .small-text { font-size: 0.75em; opacity: 0.6; }
    .room-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .room-button { flex: 1; }
    .room-actions { display: flex; gap: 6px; }
    .room-action { width: 28px; height: 28px; border: none; border-radius: 8px; background: rgba(255,255,255,0.08); color: #eaf6ff; cursor: pointer; }
    .room-action.danger { color: #ffb4b4; }
    .member-panel { width: 220px; background: rgba(255,255,255,0.12); border: 1px solid var(--border); border-radius: 18px; padding: 16px; color: var(--text); }
    .member-panel h3 { margin: 0 0 12px; }
    .member-panel ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .member-panel li { background: rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 10px; }
`;
document.head.appendChild(style);

const chatLayout = document.querySelector('.chat-panel');
if (chatLayout) {
    chatLayout.appendChild(memberList);
}

const settingsIcon = document.getElementById("settings-icon");
const settingsPopup = document.getElementById("settings-popup");
const closePopup = document.getElementById("close-popup");
const saveSettings = document.getElementById("save-settings");
const usernameColor = document.getElementById("username-color");
const profilePicture = document.getElementById("profile-picture");

function updateScrollButton() {
    if (!scrollToLatestButton || !messageArea) return;

    const nearBottom = messageArea.scrollHeight - messageArea.scrollTop - messageArea.clientHeight < 120;
    const hasOverflow = messageArea.scrollHeight > messageArea.clientHeight + 10;
    scrollToLatestButton.classList.toggle('hidden', nearBottom || !hasOverflow);
}

scrollToLatestButton.addEventListener('click', () => {
    messageArea.scrollTop = messageArea.scrollHeight;
    updateScrollButton();
});

messageArea.addEventListener('scroll', updateScrollButton);

function applyTheme(isDarkMode) {
    document.body.classList.toggle('darkmode', isDarkMode);
    localStorage.setItem('darkMode', String(isDarkMode));
}

window.addEventListener('load', () => {
    const savedColor = localStorage.getItem('usernameColor');
    const savedProfilePicture = localStorage.getItem('profilePicture');
    const savedTheme = localStorage.getItem('darkMode') === 'true';

    if (savedColor) {
        usernameColor.value = savedColor;
        document.documentElement.style.setProperty('--username-color', savedColor);
    }

    if (savedProfilePicture) {
        const profilePreview = document.createElement('img');
        profilePreview.src = savedProfilePicture;
    }

    applyTheme(savedTheme);
});

settingsIcon.addEventListener('click', () => settingsPopup.classList.remove('hidden'));
closePopup.addEventListener('click', () => settingsPopup.classList.add('hidden'));
saveSettings.addEventListener('click', () => {
    const selectedColor = usernameColor.value;
    const selectedFile = profilePicture.files[0];

    localStorage.setItem('usernameColor', selectedColor);
    document.documentElement.style.setProperty('--username-color', selectedColor);

    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = e => localStorage.setItem('profilePicture', e.target.result);
        reader.readAsDataURL(selectedFile);
    }

    settingsPopup.classList.add('hidden');
});

themeButton.addEventListener('click', () => {
    const isDarkMode = !document.body.classList.contains('darkmode');
    applyTheme(isDarkMode);
});

createRoomButton.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        alert('Enter a room name first!');
        return;
    }

    socket.emit('create room', roomName);
    syncPresence(roomName);
    roomNameInput.value = '';
});

roomNameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        createRoomButton.click();
    }
});

let lastSent = 0;
let typingTimer = null;

function emitTypingState(isTyping) {
    const currentUser = myname.value.trim();
    if (!currentUser) return;

    socket.emit('typing', {
        roomName: state.currentRoom,
        userName: currentUser,
        isTyping
    });
}

message.addEventListener('input', () => {
    const currentUser = myname.value.trim();
    if (!currentUser) return;

    const currentTypingText = formatTypingUsers([currentUser]);
    updateTypingStatus(currentTypingText);
    emitTypingState(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        updateTypingStatusForRoom(state.currentRoom);
        emitTypingState(false);
    }, 1200);
});

form.addEventListener('submit', e => {
    e.preventDefault();

    const now = Date.now();
    if (now - lastSent < 1000) {
        alert("You're sending messages too fast!");
        return;
    }
    lastSent = now;

    if (!myname.value) return alert('Enter your name!');
    if (!message.value) return;
    if (message.value.length > 200) return alert('Message too long!');

    const msgData = {
        room: state.currentRoom,
        user: myname.value,
        text: message.value,
        color: localStorage.getItem('usernameColor') || '#0a5274',
        profilePicture: localStorage.getItem('profilePicture') || ''
    };

    socket.emit('presence', { roomName: state.currentRoom, userName: myname.value });
    emitTypingState(false);
    socket.emit('chat message', msgData);
    message.value = '';
    updateTypingStatus('');
});

socket.on('connect', () => {
    socket.emit('join room', { roomName: state.currentRoom });
    syncPresence(state.currentRoom);
    updateTypingStatusForRoom(state.currentRoom);
});

socket.on('room list', rooms => renderRoomList(rooms));

socket.on('active room', roomName => {
    state.currentRoom = roomName || 'general';
    roomHeader.textContent = `#${state.currentRoom}`;
    renderRoomList(state.rooms);
});

socket.on('room messages', msgs => {
    messageArea.innerHTML = '';
    (msgs || []).forEach(displayMessage);
});

socket.on('room members', ({ room, members }) => {
    if (room === state.currentRoom) {
        renderMemberList(members || []);
    }
});

socket.on('room error', message => {
    alert(message);
});

socket.on('typing status', ({ room, typingUsers = [] }) => {
    if (!room) return;

    state.typingUsers[room] = new Set(typingUsers);

    if (room === state.currentRoom) {
        updateTypingStatusForRoom(room);
    }
});

socket.on('chat message', data => {
    if (!data || data.room !== state.currentRoom) return;
    displayMessage(data);
    updateTypingStatusForRoom(state.currentRoom);
});