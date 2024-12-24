export { GameRoom } from './game-room';

export default {
    async fetch(request, env) {
        // Get the game room instance
        const id = env.GAME_ROOM.idFromName('default-room');
        const room = env.GAME_ROOM.get(id);

        // Forward the request to the Durable Object
        return room.fetch(request);
    }
};