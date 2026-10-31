const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatStore } = require('./chat-room-store');

test('chat store creates rooms, tracks messages, and keeps list of room names', () => {
    const store = createChatStore(['general']);

    assert.deepEqual(store.getRoomNames(), ['general']);

    store.ensureRoom('design');
    store.addMessage('general', { user: 'Alice', text: 'hello' });
    store.addMessage('design', { user: 'Bob', text: 'hi' });

    assert.equal(store.getRoomMessages('general').length, 1);
    assert.equal(store.getRoomMessages('design')[0].text, 'hi');
    assert.deepEqual(store.getRoomNames(), ['general', 'design']);

    for (let i = 0; i < 120; i += 1) {
        store.addMessage('general', { user: 'Alice', text: `msg ${i}` });
    }

    assert.equal(store.getRoomMessages('general').length, 100);
});

test('chat store tracks room members and removes stale users', () => {
    const store = createChatStore(['general']);

    store.addMember('general', 'Alice');
    store.addMember('general', 'Bob');
    store.addMember('design', 'Charlie');

    assert.deepEqual(store.getRoomMembers('general'), ['Alice', 'Bob']);
    assert.deepEqual(store.getRoomMembers('design'), ['Charlie']);

    store.removeMember('general', 'Alice');
    assert.deepEqual(store.getRoomMembers('general'), ['Bob']);
});
