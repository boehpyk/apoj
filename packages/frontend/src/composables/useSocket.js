import { ref, onMounted, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';
import { EVENTS } from 'shared/constants/index.js';

export function useSocket(roomCode, playerId) {
    const socket = ref(null);
    const connected = ref(false);
    const pendingHandlers = [];

    function backendUrl() {
        // If running vite dev on 5173, backend is 3000
        if (typeof window !== 'undefined' && window.location.port === '5173') {
            return 'http://localhost:3000';
        }
        return window.location.origin;
    }

    function join() {
        if (!socket.value || !connected.value) return;
        socket.value.emit(EVENTS.JOIN_ROOM, {roomCode, playerId});
    }

    function on(event, handler) {
        if (socket.value) {
            socket.value.on(event, handler);
        } else {
            pendingHandlers.push({event, handler});
        }
    }

    onMounted(() => {
        socket.value = io(backendUrl(), {transports: ['websocket']});
        socket.value.on('connect', () => {
            connected.value = true;
            // attach any queued handlers
            pendingHandlers.forEach(h => socket.value.on(h.event, h.handler));
            pendingHandlers.length = 0;
            join();
        });
    });

    onBeforeUnmount(() => {
        // console.log('Component is about to be unmounted')
        // socket.value?.disconnect();
    });

    return {socket, connected, events: EVENTS, on};
}
