export const MIN_CHAT_MESSAGE_LENGTH = 1;
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const CHAT_MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
export const CHAT_MESSAGE_RATE_LIMIT_MAX = 30;

type ChatMessageValidationResult =
    | { valid: true; message: string }
    | { valid: false; error: string };

type ChatMessageRateLimitResult =
    | { allowed: true }
    | { allowed: false; error: string; retryAfterSeconds: number };

interface ChatMessageRateLimitOptions {
    maxMessages?: number;
    windowMs?: number;
}

interface ChatMessageRateLimitBucket {
    count: number;
    resetAt: number;
}

const SCRIPT_OR_STYLE_BLOCK_PATTERN = /<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const WHITESPACE_PATTERN = /\s+/g;

export function sanitizeChatMessage(message: string): string {
    return message
        .replace(SCRIPT_OR_STYLE_BLOCK_PATTERN, ' ')
        .replace(HTML_TAG_PATTERN, ' ')
        .replace(CONTROL_CHARACTER_PATTERN, '')
        .replace(WHITESPACE_PATTERN, ' ')
        .trim();
}

export function validateChatMessage(message: unknown): ChatMessageValidationResult {
    if (typeof message !== 'string') {
        return { valid: false, error: 'Message must be a string' };
    }

    const sanitizedMessage = sanitizeChatMessage(message);

    if (sanitizedMessage.length < MIN_CHAT_MESSAGE_LENGTH) {
        return { valid: false, error: 'Message is required' };
    }

    if (sanitizedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
        return {
            valid: false,
            error: `Message must be ${MAX_CHAT_MESSAGE_LENGTH} characters or fewer`
        };
    }

    return { valid: true, message: sanitizedMessage };
}

export function createChatMessageRateLimiter(options: ChatMessageRateLimitOptions = {}) {
    const maxMessages = options.maxMessages ?? CHAT_MESSAGE_RATE_LIMIT_MAX;
    const windowMs = options.windowMs ?? CHAT_MESSAGE_RATE_LIMIT_WINDOW_MS;
    const buckets = new Map<string, ChatMessageRateLimitBucket>();

    return {
        check(identifier: string, now = Date.now()): ChatMessageRateLimitResult {
            const bucket = buckets.get(identifier);

            if (!bucket || now >= bucket.resetAt) {
                buckets.set(identifier, { count: 1, resetAt: now + windowMs });
                return { allowed: true };
            }

            if (bucket.count >= maxMessages) {
                return {
                    allowed: false,
                    error: 'Too many chat messages. Please wait before sending another message.',
                    retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000)
                };
            }

            bucket.count += 1;
            return { allowed: true };
        }
    };
}
