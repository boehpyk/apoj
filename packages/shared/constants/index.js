export const EVENTS = {
    HEALTH: 'health',
    JOIN_ROOM: 'join_room',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    ROOM_UPDATED: 'room_updated',
    GAME_STARTED: 'game_started',
    SONGS_ASSIGNED: 'songs_assigned',
    ROUND_PHASE_CHANGED: 'round_phase_changed',
    ORIGINAL_UPLOADED: 'original_uploaded',
    REVERSED_RECORDING_STARTED: 'reversed_recording_started',
    REVERSE_RECORDING_UPLOADED: 'reverse_recording_uploaded',
    GUESSING_STARTED: 'guessing_started',
    GUESSING_ENDED: 'guessing_ended',
};

/**
 * The whole game statuses
 * @type {{WAITING: string, PLAYING: string, ENDED: string}}
 */
export const STATUSES = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    ENDED: 'ended'
}

export const ROUND_PHASES = {
    ORIGINALS_RECORDING: 'originals_recording',
    ORIGINAL_REVERSED_READY: 'originals_reversed_ready',
    REVERSED_RECORDING: 'reversed_recording',
    PROCESSING_FINAL_AUDIO: 'processing_final_audio',
    FINAL_AUDIO_READY: 'final_audio_ready',
    GUESSING: 'guessing',
    ROUND_ENDED: 'round_ended'
}

export const ROOM_TTL_SECONDS = 86400; // 24 hours
