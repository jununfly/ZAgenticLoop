import { parseTree } from 'jsonc-parser';
export const APPROVAL_JSON_INVALID = 'approval-json-invalid';
export const APPROVAL_JSON_LIMIT_EXCEEDED = 'approval-json-limit-exceeded';
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_DEPTH = 16;
const MAX_OBJECT_MEMBERS = 128;
const MAX_ARRAY_ELEMENTS = 128;
const MAX_STRING_BYTES = 16 * 1024;
const MAX_COMPOSITE_NODES = 512;
const MAX_NUMBER_TOKEN_BYTES = 128;
export class BoundedJsonError extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
        this.name = 'BoundedJsonError';
    }
}
function invalid() {
    throw new BoundedJsonError(APPROVAL_JSON_INVALID);
}
function limited() {
    throw new BoundedJsonError(APPROVAL_JSON_LIMIT_EXCEEDED);
}
function decodeUtf8(input) {
    if (input.byteLength > MAX_INPUT_BYTES)
        limited();
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(input);
    }
    catch {
        invalid();
    }
}
function parseErrors(errors) {
    if (errors.length > 0)
        invalid();
}
function keyOf(node, source) {
    if (node.type !== 'string' || typeof node.value !== 'string')
        invalid();
    if (new TextEncoder().encode(node.value).byteLength > MAX_STRING_BYTES)
        limited();
    return node.value;
}
function convert(node, source, depth, state) {
    if (depth > MAX_DEPTH)
        limited();
    switch (node.type) {
        case 'object': {
            state.compositeNodes += 1;
            if (state.compositeNodes > MAX_COMPOSITE_NODES)
                limited();
            const children = node.children ?? [];
            if (children.length > MAX_OBJECT_MEMBERS)
                limited();
            const result = Object.create(null);
            const keys = new Set();
            for (const property of children) {
                if (property.type !== 'property' || !property.children || property.children.length !== 2)
                    invalid();
                const key = keyOf(property.children[0], source);
                if (keys.has(key))
                    invalid();
                keys.add(key);
                result[key] = convert(property.children[1], source, depth + 1, state);
            }
            return result;
        }
        case 'array': {
            state.compositeNodes += 1;
            if (state.compositeNodes > MAX_COMPOSITE_NODES)
                limited();
            const children = node.children ?? [];
            if (children.length > MAX_ARRAY_ELEMENTS)
                limited();
            return children.map((child) => convert(child, source, depth + 1, state));
        }
        case 'string': {
            if (typeof node.value !== 'string')
                invalid();
            if (new TextEncoder().encode(node.value).byteLength > MAX_STRING_BYTES)
                limited();
            return node.value;
        }
        case 'number': {
            const token = source.slice(node.offset, node.offset + node.length);
            if (new TextEncoder().encode(token).byteLength > MAX_NUMBER_TOKEN_BYTES)
                limited();
            if (typeof node.value !== 'number' || !Number.isFinite(node.value) || Math.abs(node.value) > Number.MAX_SAFE_INTEGER)
                invalid();
            return node.value;
        }
        case 'boolean':
            return node.value === true;
        case 'null':
            return null;
        default:
            invalid();
    }
}
export function parseBoundedJson(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const source = decodeUtf8(bytes);
    const errors = [];
    const tree = parseTree(source, errors, { disallowComments: true, allowTrailingComma: false });
    parseErrors(errors);
    if (!tree || tree.offset !== 0 || tree.length !== source.length)
        invalid();
    return convert(tree, source, 0, { compositeNodes: 0 });
}
