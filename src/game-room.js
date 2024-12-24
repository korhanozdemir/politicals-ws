// src/game-room.js
import { DurableObject } from 'cloudflare:workers';

export class GameRoom extends DurableObject {
    constructor(state, env) {
        super(state, env);
        // Track all connected clients
        this.connections = new Set();
        this.gameState = {
            territories: [
                { id: 't1', owner: null },
                { id: 't2', owner: null },
                { id: 't3', owner: null },
                { id: 't4', owner: null },
                { id: 't5', owner: null },
            ]
        };
    }

    // Rest of the code remains the same...
    async fetch(request) {
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        // Create the WebSocket pair
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // Accept the connection
        server.accept();
        this.connections.add(server);

        // Send initial state
        server.send(JSON.stringify({
            type: 'GAME_STATE',
            payload: this.gameState
        }));

        // Handle messages
        server.addEventListener('message', event => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message:', data);

                switch (data.type) {
                    case 'CLAIM_TERRITORY':
                        const territory = this.gameState.territories.find(t => t.id === data.territoryId);
                        if (territory && !territory.owner) {
                            territory.owner = data.playerNickname;
                            // Broadcast to all clients
                            this.broadcast({
                                type: 'GAME_STATE',
                                payload: this.gameState
                            });
                        }
                        break;

                    case 'RESET_GAME':
                        this.gameState.territories.forEach(t => t.owner = null);
                        this.broadcast({
                            type: 'GAME_STATE',
                            payload: this.gameState
                        });
                        break;
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        // Handle disconnection
        server.addEventListener('close', () => {
            this.connections.delete(server);
        });

        // Return the client end of the WebSocket
        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.connections.forEach(client => {
            try {
                client.send(messageStr);
            } catch (error) {
                // If sending fails, remove the client
                this.connections.delete(client);
            }
        });
    }
}