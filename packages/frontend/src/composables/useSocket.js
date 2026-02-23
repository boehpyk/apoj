import { ref, onMounted } from 'vue';
import { io } from 'socket.io-client';
import {EVENTS, ROUND_PHASES} from 'shared/constants/index.js';

// Global socket instance (singleton)
let socketInstance = null;
const connected = ref(false);
const currentRoom = ref(null);
const currentPlayer = ref(null);

function backendUrl() {
    // If running vite dev on 5173, backend is 3000
    if (typeof window !== 'undefined' && window.location.port === '5173') {
        return 'http://localhost:3000';
    }
    return window.location.origin;
}

function initializeSocket() {
    if (socketInstance) return socketInstance;

    socketInstance = io(backendUrl(), { transports: ['websocket'] });

    socketInstance.on('connect', () => {
        connected.value = true;
        console.log('[useSocket] Connected to server');
        // Re-join room if we were in one
        if (currentRoom.value && currentPlayer.value) {
            const token = sessionStorage.getItem('playerToken');
            socketInstance.emit(EVENTS.JOIN_ROOM, {
                roomCode: currentRoom.value,
                playerId: currentPlayer.value,
                token
            });
        }
    });

    socketInstance.on('disconnect', () => {
        connected.value = false;
        console.log('[useSocket] Disconnected from server');
    });

    return socketInstance;
}

export function useSocket(roomCode, playerId) {
    const socket = ref(null);

    function join() {
        if (!socket.value || !connected.value) return;
        currentRoom.value = roomCode;
        currentPlayer.value = playerId;
        const token = sessionStorage.getItem('playerToken');
        socket.value.emit(EVENTS.JOIN_ROOM, { roomCode, playerId, token });
    }

    function on(event, handler) {
        if (socket.value) {
            socket.value.on(event, handler);
        }
    }

    function off(event, handler) {
        if (socket.value) {
            socket.value.off(event, handler);
        }
    }

    onMounted(() => {
        socket.value = initializeSocket();

        if (connected.value) {
            // Already connected, join immediately
            join();
        } else {
            // Wait for connection, then join
            const onConnect = () => {
                join();
                socket.value.off('connect', onConnect);
            };
            socket.value.on('connect', onConnect);
        }
    });

    return { socket, connected, events: EVENTS, on, off, phases: ROUND_PHASES };
}
