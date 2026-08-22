const order = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = process.env.LOG_LEVEL || 'info';
function emit(level, scope, msg, extra) {
    if (order[level] < order[minLevel])
        return;
    const ts = new Date().toISOString().slice(11, 19);
    const tail = extra ? ' ' + JSON.stringify(extra) : '';
    const line = `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${tail}`;
    if (level === 'error')
        console.error(line);
    else if (level === 'warn')
        console.warn(line);
    else
        console.log(line);
}
export function logger(scope) {
    return {
        debug: (msg, extra) => emit('debug', scope, msg, extra),
        info: (msg, extra) => emit('info', scope, msg, extra),
        warn: (msg, extra) => emit('warn', scope, msg, extra),
        error: (msg, extra) => emit('error', scope, msg, extra),
    };
}
