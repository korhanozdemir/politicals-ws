import { GameRoom } from './game-room';

export { GameRoom };

export default {
    async fetch(request, env) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected WebSocket', { status: 400 });
        }

        // Get the GameRoom Durable Object
        const id = env.GAME_ROOM.idFromName('default-room');
        const room = env.GAME_ROOM.get(id);

        // Create WebSocket pair
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // Handle the server-side WebSocket in the Durable Object
        await room.handleSession(server);

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }
};