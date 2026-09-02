export async function sendTransactionalEmail({ to, subject, text }) {
    const apiKey = process.env.RESEND_API_KEY || '';
    const from = process.env.RESEND_FROM_EMAIL || '';
    if (!apiKey || !from || !to) return false;

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
    });
    return response.ok;
}