import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createChatMessageRateLimiter,
    MAX_CHAT_MESSAGE_LENGTH,
    validateChatMessage
} from './chat-message-validation';

test('accepts and trims a valid chat message', () => {
    const result = validateChatMessage('  Explain photosynthesis  ');

    assert.equal(result.valid, true);
    if (result.valid) {
        assert.equal(result.message, 'Explain photosynthesis');
    }
});

test('rejects empty and whitespace-only messages', () => {
    assert.deepEqual(validateChatMessage('').valid, false);
    assert.deepEqual(validateChatMessage('   \n\t  ').valid, false);
});

test('rejects non-string messages', () => {
    const result = validateChatMessage(null);

    assert.equal(result.valid, false);
    if (!result.valid) {
        assert.equal(result.error, 'Message must be a string');
    }
});

test('removes script blocks and html tags before accepting a message', () => {
    const result = validateChatMessage('<p>Hello</p><script>alert("x")</script><strong>world</strong>');

    assert.equal(result.valid, true);
    if (result.valid) {
        assert.equal(result.message, 'Hello world');
    }
});

test('rejects messages longer than the maximum length after sanitization', () => {
    const result = validateChatMessage('a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1));

    assert.equal(result.valid, false);
    if (!result.valid) {
        assert.equal(result.error, `Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer`);
    }
});

test('rate limiter blocks messages over the configured fixed window limit', () => {
    const limiter = createChatMessageRateLimiter({ maxMessages: 2, windowMs: 1000 });

    assert.equal(limiter.check('user-1', 100).allowed, true);
    assert.equal(limiter.check('user-1', 200).allowed, true);
    assert.equal(limiter.check('user-1', 300).allowed, false);
    assert.equal(limiter.check('user-1', 1200).allowed, true);
});
