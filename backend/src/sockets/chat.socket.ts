/**
 * Chat WebSocket Handler
 * Handles real-time chat streaming via Socket.io
 */

import { Server, Socket } from 'socket.io';
import { streamChatGraphWithWebSocket } from '../services/chat-stream.service';
import { createLogger } from '../utils/logger';
import {
    createChatMessageRateLimiter,
    validateChatMessage
} from '../utils/chat-message-validation';

const logger = createLogger('CHAT-SOCKET');
const chatMessageRateLimiter = createChatMessageRateLimiter();

/**
 * Setup chat WebSocket handlers
 */
export function setupChatSocket(io: Server): void {
    io.on('connection', (socket: Socket) => {
        logger.info(`[CHAT-SOCKET] Client connected: ${socket.id}`);

        /**
         * Join conversation room
         * Client emits: { conversationId: string }
         */
        socket.on('join_conversation', async (data: { conversationId: string }) => {
            try {
                const { conversationId } = data;
                
                if (!conversationId) {
                    socket.emit('error', { message: 'conversationId is required' });
                    return;
                }

                // Join the conversation room
                socket.join(`conversation:${conversationId}`);
                logger.info(`[CHAT-SOCKET] Client ${socket.id} joined conversation: ${conversationId}`);

                socket.emit('joined_conversation', { conversationId });
            } catch (error) {
                logger.error(`[CHAT-SOCKET] Error joining conversation: ${error}`);
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });

        /**
         * Send message and stream response
         * Client emits: { conversationId: string, message: string }
         */
        socket.on('send_message', async (data: { conversationId?: string; message?: unknown } = {}) => {
            try {
                const { conversationId, message } = data;

                if (!conversationId) {
                    socket.emit('error', { message: 'conversationId and message are required' });
                    return;
                }

                const validatedMessage = validateChatMessage(message);
                if (!validatedMessage.valid) {
                    socket.emit('error', { conversationId, message: validatedMessage.error });
                    return;
                }

                const rateLimit = chatMessageRateLimiter.check(`${socket.handshake.address}:${conversationId}`);
                if (!rateLimit.allowed) {
                    socket.emit('error', { conversationId, message: rateLimit.error });
                    return;
                }

                logger.info(`[CHAT-SOCKET] Received message for conversation ${conversationId}`);

                // Emit message start
                socket.emit('message_start', { conversationId });

                // Stream the chat graph execution
                await streamChatGraphWithWebSocket(conversationId, validatedMessage.message, socket);

            } catch (error) {
                logger.error(`[CHAT-SOCKET] Error processing message: ${error}`);
                socket.emit('error', {
                    conversationId: data.conversationId,
                    message: error instanceof Error ? error.message : 'Failed to process message'
                });
            }
        });

        /**
         * Leave conversation room
         */
        socket.on('leave_conversation', (data: { conversationId: string }) => {
            const { conversationId } = data;
            if (conversationId) {
                socket.leave(`conversation:${conversationId}`);
                logger.info(`[CHAT-SOCKET] Client ${socket.id} left conversation: ${conversationId}`);
            }
        });

        /**
         * Handle disconnection
         */
        socket.on('disconnect', () => {
            logger.info(`[CHAT-SOCKET] Client disconnected: ${socket.id}`);
        });
    });
}

