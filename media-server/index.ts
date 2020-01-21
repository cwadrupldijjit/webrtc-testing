import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import { createServer, request } from 'http';
import * as express from 'express';
import * as cors from 'cors';
import * as socketIo from 'socket.io';
import * as uuid from 'uuid';
import { Socket } from 'socket.io';

const app = express();

app.use(cors());
app.use(express.json());

const server = createServer(app);

const io = socketIo(server, {
    pingTimeout: process.env.NODE_ENV == 'development' ? 600000 : 5000,
});

const roomMap: Record<string, RoomMetadata> = {};
const transportErrorSocketRooms: Record<string, string[]> = {};

io.use((socket, next) => {
    const token = socket.handshake.headers.authorization;

    if (token == 'Bearer foo') {
        return next();
    }

    return next(Error('Failed authentication'));
});

io.on('connection', socket => {
    console.log('connected', socket.id);
    
    const associatedRooms: string[] = [];

    socket.on('message', (event) => {
        console.log('message', typeof event, event);
    });
    
    socket.on('resumePosition', (previousSocketId) => {
        const previousRooms = transportErrorSocketRooms[previousSocketId];
        
        for (const roomKey of previousRooms) {
            const roomMetadata = roomMap[roomKey];
            
            if (!roomMetadata) continue;
            
            const participantIndex = roomMetadata.participants.findIndex(s => s.id == previousSocketId);
            const requesterIndex = roomMetadata.requesters.findIndex(s => s.id == previousSocketId);
            
            if (participantIndex >= 0) {
                roomMetadata.participants.splice(participantIndex, 1, socket);
            }
            else if (requesterIndex >= 0) {
                roomMetadata.requesters.splice(requesterIndex, 1, socket);
            }
        }
    });

    socket.on('joinRoom', (requestedRoomKey: string) => {
        const isNewRoom = !requestedRoomKey || !(requestedRoomKey in io.sockets.adapter.rooms);
        const roomKey = requestedRoomKey || uuid.v4();

        const roomMetadata = roomKey in roomMap ? roomMap[roomKey] : createNewRoomMetadata(roomKey, socket);

        if (!isNewRoom) {
            console.log('request to join extant room, broadcast to room administrator with relevant data');
            roomMetadata.requesters.push(socket);
            io.to(roomMetadata.participants[0].id).emit('joinRequest', socket.id, roomKey);
            return;
        }

        roomMap[roomKey] = roomMetadata;

        socket.join(roomKey);

        socket.emit('joinedRoom', roomKey, true);
    });

    socket.on('respondToJoinRequest', (socketId, roomKey, accepted = true) => {
        const roomMetadata = roomKey in roomMap ? roomMap[roomKey] : null;

        if (accepted && roomMetadata && roomMetadata.requesters.some(s => s.id == socketId)) {
            const [ requestedSocket ] = roomMetadata.requesters.splice(roomMetadata.requesters.findIndex(s => s.id == socketId), 1);

            requestedSocket.join(roomKey);
            roomMetadata.participants.push(requestedSocket);

            io.to(socketId).emit('joinRequestResponse', true);

            if (roomMetadata.description) {
                io.to(socketId).emit('rtcDescription', roomMetadata.description);
            }

            if (roomMetadata.candidates.length) {
                roomMetadata.candidates.forEach(c => io.to(socketId).emit('candidate', c));
            }

            return;
        }

        io.to(socketId).emit('joinRequestResponse', false);
    });

    socket.on('requestUpgradeRole', (roomKey: string, socketId: string, type = 'admin') => {
        const roomMetadata = roomKey in roomMap ? roomMap[roomKey] : null;

        if (roomMetadata && roomMetadata.participants.some(s => s.id == socketId) && roomMetadata.participants[0] == socket) {
            io.to(socketId).emit('upgradeRole', type);
        }
    });

    socket.on('requestKickParticipant', (roomKey: string, socketId: string, ban = false) => {
        const roomMetadata = roomMap[roomKey];

        const inParticipantsList = roomMetadata.participants.some(s => s.id == socketId);
        const inRequestersList = roomMetadata.requesters.some(s => s.id == socketId);
        const isAdmin = roomMetadata.participants[0] == socket;

        if (roomMetadata && ((inParticipantsList || inRequestersList) && isAdmin)) {
            kickFromRoom(roomKey, socketId);
        }
    });

    socket.on('sendRtcDescription', (description: RTCSessionDescription, roomKey: string) => {
        const roomMetadata = roomMap[roomKey];

        if (roomMetadata) {
            roomMetadata.description = description;
            io.sockets.in(roomKey).emit('rtcDescription', description);
        }
    });

    socket.on('sendCandidate', (candidateEvent: ICECandidateMetadata, roomKey: string) => {
        const roomMetadata = roomMap[roomKey];

        if (roomMetadata) {
            roomMetadata.candidates.push(candidateEvent);
        }

        io.to(roomKey).emit('candidate', candidateEvent);
    });

    socket.on('leaveRoom', leaveRoom);

    socket.on('disconnect', (event) => {
        console.log('disconnected', socket.id);
        
        const hadTransportError = event == 'transport error';
        
        if (hadTransportError) {
            transportErrorSocketRooms[socket.id] = associatedRooms;
        }
        
        Object.keys(socket.rooms).forEach(key => leaveRoom(key, hadTransportError));
    });

    function leaveRoom(roomKey: string, hadTransportError = false) {
        const roomMetadata = roomMap[roomKey];
        io.to(roomKey).emit('leftRoom', socket.id);
        socket.leave(roomKey);
        
        if (!hadTransportError || roomMetadata.participants.length == 1 || roomMetadata.participants.length) {
            associatedRooms.splice(associatedRooms.indexOf(roomKey), 1);
            
            if (roomMetadata.participants[0] == socket) {
                if (roomMetadata.participants.length > 1) {
                    if (!hadTransportError) {
                        roomMetadata.participants.splice(roomMetadata.participants.indexOf(socket), 1);
                        roomMetadata.participants[1].emit('upgradeRole', 'admin');
                    }
                    return;
                }
    
                if (roomMetadata.requesters.length) {
                    roomMetadata.requesters.forEach(s => kickFromRoom(roomKey, s.id));
                }

                delete roomMap[roomKey];
            }
        }
    }

    function kickFromRoom(roomKey: string, socketId: string) {
        const roomMetadata = roomMap[roomKey];

        if (!roomMetadata) return;
        
        io.to(socketId).emit('kicked');

        if (roomMetadata.participants.some(s => s.id == socketId)) {
            roomMetadata.participants.splice(roomMetadata.participants.findIndex(s => s.id == socketId), 1);
        }
        if (roomMetadata.participants.some(s => s.id == socketId)) {
            roomMetadata.participants.splice(roomMetadata.requesters.findIndex(s => s.id == socketId), 1);
        }
    }
});

server.listen(8000, () => {
    console.log(`Listening for connections on port ${8000}`);
});

function createNewRoomMetadata(roomKey: string, socket: SocketIO.Socket): RoomMetadata {
    return {
        roomKey,
        participants: [ socket ],
        requesters: [],
        candidates: [],
        previousAdminIds: [],
    };
}

interface RoomMetadata {
    participants: SocketIO.Socket[];
    requesters: SocketIO.Socket[];
    roomKey: string;
    description?: RTCSessionDescription;
    candidates: ICECandidateMetadata[];
    previousAdminIds: string[];
}

interface ICECandidateMetadata {
    label: number;
    id: string;
    candidate: string;
}
