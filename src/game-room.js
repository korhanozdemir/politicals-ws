export class GameRoom {
    constructor(state, env) {
        this.state = state;
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

    broadcast(message) {
        console.log(`Broadcasting to ${this.connections.size} clients:`, message);
        this.connections.forEach(ws => ws.send(JSON.stringify(message)));
    }

    async handleSession(ws) {
        // Accept the WebSocket
        ws.accept();
        this.connections.add(ws);
        console.log('Client connected, total connections:', this.connections.size);

        // Send initial state
        ws.send(JSON.stringify({
            type: 'GAME_STATE',
            payload: this.gameState
        }));

        // Handle messages
        ws.addEventListener('message', async ({ data }) => {
            try {
                const message = JSON.parse(data);
                console.log('Received message:', message);

                switch (message.type) {
                    case 'CLAIM_TERRITORY':
                        const territory = this.gameState.territories.find(t => t.id === message.territoryId);
                        if (territory && !territory.owner) {
                            territory.owner = message.playerNickname;
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
            } catch (err) {
                console.error('Error processing message:', err);
            }
        });

        // Handle disconnection
        ws.addEventListener('close', () => {
            this.connections.delete(ws);
            console.log('Client disconnected, remaining:', this.connections.size);
        });
    }
}