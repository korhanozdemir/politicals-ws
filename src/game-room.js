// src/game-room.js
import { DurableObject } from 'cloudflare:workers';

export class GameRoom extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.connections = new Set();
        this.roomState = {
            room: {
                id: null,
                status: 'waiting',
                players: {}
            },
            territories: [
                { id: 't1', owner: null },
                { id: 't2', owner: null },
                { id: 't3', owner: null },
                { id: 't4', owner: null },
                { id: 't5', owner: null },
            ]
        };
        this.clientToPlayer = new Map(); // Track which connection belongs to which player
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected Upgrade: websocket', { status: 426 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        server.accept();
        this.connections.add(server);

        server.addEventListener('message', async event => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message:', data);

                switch (data.type) {
                    case 'CREATE_ROOM': {
                        this.roomState.room.id = data.roomId;
                        this.roomState.room.players[data.playerNickname] = {
                            nickname: data.playerNickname,
                            ready: true,  // Host is always ready
                            clientId: server.clientId
                        };
                        this.clientToPlayer.set(server, data.playerNickname);

                        server.send(JSON.stringify({
                            type: 'ROOM_CREATED',
                            roomId: data.roomId,
                            payload: this.roomState
                        }));

                        server.send(JSON.stringify({
                            type: 'GAME_STATE',
                            payload: this.roomState
                        }));
                        break;
                    }

                    case 'JOIN_ROOM': {
                        if (!this.roomState.room.id) {
                            server.send(JSON.stringify({
                                type: 'ERROR',
                                payload: 'Room not found'
                            }));
                            return;
                        }

                        if (this.roomState.room.status !== 'waiting') {
                            server.send(JSON.stringify({
                                type: 'ERROR',
                                payload: 'Game already in progress'
                            }));
                            return;
                        }

                        if (this.roomState.room.players[data.playerNickname]) {
                            server.send(JSON.stringify({
                                type: 'ERROR',
                                payload: 'Nickname already taken in this room'
                            }));
                            return;
                        }

                        this.roomState.room.players[data.playerNickname] = {
                            nickname: data.playerNickname,
                            ready: false,
                            clientId: server.clientId
                        };
                        this.clientToPlayer.set(server, data.playerNickname);

                        this.broadcast({
                            type: 'GAME_STATE',
                            payload: this.roomState
                        });
                        break;
                    }

                    case 'PLAYER_READY': {
                        const player = this.roomState.room.players[data.playerNickname];
                        if (player) {
                            player.ready = data.isReady;
                            this.broadcast({
                                type: 'GAME_STATE',
                                payload: this.roomState
                            });
                        }
                        break;
                    }

                    case 'START_GAME': {
                        // Only host can start
                        const players = Object.keys(this.roomState.room.players);
                        if (data.playerNickname === players[0] &&
                            Object.values(this.roomState.room.players).every(p => p.ready)) {
                            this.roomState.room.status = 'playing';
                            this.broadcast({
                                type: 'GAME_STATE',
                                payload: this.roomState
                            });
                        }
                        break;
                    }

                    case 'CLAIM_TERRITORY': {
                        if (this.roomState.room.status !== 'playing') return;

                        const territory = this.roomState.territories.find(t => t.id === data.territoryId);
                        if (territory && !territory.owner) {
                            territory.owner = data.playerNickname;
                            this.broadcast({
                                type: 'GAME_STATE',
                                payload: this.roomState
                            });
                        }
                        break;
                    }

                    case 'RESET_GAME': {
                        this.roomState.territories.forEach(t => t.owner = null);
                        this.broadcast({
                            type: 'GAME_STATE',
                            payload: this.roomState
                        });
                        break;
                    }
                }
            } catch (error) {
                console.error('Error handling message:', error);
                server.send(JSON.stringify({
                    type: 'ERROR',
                    payload: 'Server error'
                }));
            }
        });

        server.addEventListener('close', () => {
            const playerNickname = this.clientToPlayer.get(server);
            if (playerNickname) {
                delete this.roomState.room.players[playerNickname];
                this.clientToPlayer.delete(server);
            }
            this.connections.delete(server);

            // If room is empty, reset it
            if (Object.keys(this.roomState.room.players).length === 0) {
                this.roomState.room.id = null;
                this.roomState.room.status = 'waiting';
                this.roomState.territories.forEach(t => t.owner = null);
            } else {
                this.broadcast({
                    type: 'GAME_STATE',
                    payload: this.roomState
                });
            }
        });

        return new Response(null, { status: 101, webSocket: client });
    }

    broadcast(message) {
        const messageStr = JSON.stringify(message);
        this.connections.forEach(client => {
            try {
                client.send(messageStr);
            } catch (error) {
                this.connections.delete(client);
            }
        });
    }
}