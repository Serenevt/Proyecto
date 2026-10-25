export const AGENT_HOST='127.0.0.1';
export const AGENT_PORT=25443;
export const AGENT_AUTHORITY=AGENT_HOST+':'+AGENT_PORT;
export const AGENT_URL='http://'+AGENT_AUTHORITY;
export function isLocalOrigin(value) {
  if(typeof value!=='string')return false;
  try {
    const u=new URL(value);
    return u.origin===value&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&/^\d+$/.test(u.port)&&!u.username&&!u.password;
  } catch { return false; }
}
