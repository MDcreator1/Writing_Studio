export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function check(condition, message, status = 400, code = 'validation') {
  if (!condition) throw new ApiError(status, code, message);
}
export function uuid(value) {
  check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'A valid UUID is required.');
  return value.toLowerCase();
}
export function text(value, max = 300) {
  check(typeof value === 'string' && value.length <= max && !value.includes('\0') && value.isWellFormed(), 'Invalid text length/type or Unicode.');
  return value;
}
export function integer(value, max = 2147483647) {
  check(Number.isSafeInteger(value) && value >= 0 && value <= max, 'Invalid integer.');
  return value;
}
export function object(value) {
  check(value && typeof value === 'object' && !Array.isArray(value), 'An object is required.');
  return value;
}
export function jsonValue(value, maxNodes=20000) {
  let nodes=0;
  function visit(item,depth){
    check(++nodes<=maxNodes&&depth<=40,'JSON structure exceeds safe limits.');
    if(typeof item==='string'){text(item,1048576);return;}
    if(item===null||typeof item==='boolean')return;
    if(typeof item==='number'){check(Number.isFinite(item),'Invalid JSON number.');return;}
    check(item&&typeof item==='object','Invalid JSON value.');
    if(Array.isArray(item)){for(const child of item)visit(child,depth+1);}
    else for(const [key,child] of Object.entries(item)){text(key,300);visit(child,depth+1);}
  }
  visit(value,0);return value;
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
