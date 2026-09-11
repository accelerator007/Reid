import { openSocket } from './socket.js';

const authDir = process.env.REID_BRIDGE_AUTH_DIR || './auth';
const { socket } = await openSocket(authDir);

socket.ev.on('connection.update', async ({ connection }) => {
  if (connection !== 'open') return;
  const groups = await socket.groupFetchAllParticipating();
  const rows = Object.values(groups)
    .map(({ id, subject }) => ({ name: subject, id }))
    .sort((left, right) => left.name.localeCompare(right.name));
  console.table(rows);
  socket.end(undefined);
  setTimeout(() => process.exit(0), 500);
});
