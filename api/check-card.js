import { handleNativeAppCors } from '../server/lib/native-cors.js';

export default async function handler(req, res) {
    if (handleNativeAppCors(req, res)) return;
    return res.status(410).json({ error: 'AI verification has been permanently removed.' });
}
