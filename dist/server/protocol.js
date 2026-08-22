export const BIN_TRAIL = 0x01;
export const BIN_AGENTS = 0x02;
export function encodeTrail(trail) {
    const out = Buffer.allocUnsafe(1 + trail.length);
    out[0] = BIN_TRAIL;
    out.set(trail, 1);
    return out;
}
export function encodeAgents(positions) {
    const out = Buffer.allocUnsafe(1 + positions.byteLength);
    out[0] = BIN_AGENTS;
    out.set(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength), 1);
    return out;
}
export function parseClientMessage(raw) {
    if (typeof raw !== 'object' || raw === null)
        return null;
    const m = raw;
    switch (m.type) {
        case 'pause':
        case 'resume':
        case 'reset':
            return { type: m.type };
        case 'speed':
            return typeof m.value === 'number' && Number.isFinite(m.value) ? { type: 'speed', value: m.value } : null;
        case 'agents':
            return { type: 'agents', on: Boolean(m.on) };
        default:
            return null;
    }
}
