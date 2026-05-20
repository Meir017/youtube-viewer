import { describe, test, expect } from 'bun:test';
import { extractYtInitialData, findJsonObjectEnd } from '../../generator/parsers';

describe('findJsonObjectEnd', () => {
    test('returns -1 when start is not an opening brace', () => {
        expect(findJsonObjectEnd('not json', 0)).toBe(-1);
    });

    test('finds end of a simple balanced object', () => {
        const s = '{"a":1}';
        expect(findJsonObjectEnd(s, 0)).toBe(s.length);
    });

    test('ignores closing braces inside string values', () => {
        // Naive brace counter would stop after "foo}" and produce truncated JSON.
        const s = '{"description":"foo}bar","x":1}';
        const end = findJsonObjectEnd(s, 0);
        expect(end).toBe(s.length);
        expect(JSON.parse(s.slice(0, end))).toEqual({ description: 'foo}bar', x: 1 });
    });

    test('ignores opening braces inside string values', () => {
        const s = '{"code":"if (x) {y}","ok":true}';
        const end = findJsonObjectEnd(s, 0);
        expect(end).toBe(s.length);
        expect(JSON.parse(s.slice(0, end))).toEqual({ code: 'if (x) {y}', ok: true });
    });

    test('handles escaped quotes inside strings', () => {
        const s = '{"q":"she said \\"hi}\\" then left","n":2}';
        const end = findJsonObjectEnd(s, 0);
        expect(end).toBe(s.length);
        const parsed = JSON.parse(s.slice(0, end));
        expect(parsed.n).toBe(2);
        expect(parsed.q).toContain('hi}');
    });

    test('handles escaped backslashes that precede quotes', () => {
        // String value ends with a literal backslash, then the JSON closes.
        const s = '{"path":"C:\\\\Users\\\\x","ok":1}';
        const end = findJsonObjectEnd(s, 0);
        expect(end).toBe(s.length);
        expect(JSON.parse(s.slice(0, end))).toEqual({ path: 'C:\\Users\\x', ok: 1 });
    });

    test('finds nested objects correctly', () => {
        const s = '{"a":{"b":{"c":"}}"}}}';
        const end = findJsonObjectEnd(s, 0);
        expect(end).toBe(s.length);
        expect(JSON.parse(s.slice(0, end))).toEqual({ a: { b: { c: '}}' } } });
    });

    test('returns -1 for unbalanced input', () => {
        expect(findJsonObjectEnd('{"a":1', 0)).toBe(-1);
    });
});

describe('extractYtInitialData', () => {
    test('extracts JSON when description contains a closing brace', () => {
        // Reproduces the bug: previous brace counter stopped at the first `}`
        // inside the description string and threw "Unexpected EOF".
        const html = `<html><script>
            var ytInitialData = {"contents":{"description":"snippet with } inside","ok":true}};
        </script></html>`;
        const data = extractYtInitialData(html);
        expect(data.contents.description).toBe('snippet with } inside');
        expect(data.contents.ok).toBe(true);
    });

    test('extracts JSON when description contains an opening brace', () => {
        const html = `<script>ytInitialData = {"d":"code: function() { return 1; }","n":3};</script>`;
        const data = extractYtInitialData(html);
        expect(data.n).toBe(3);
        expect(data.d).toContain('function()');
    });

    test('extracts JSON with escaped quotes around braces in strings', () => {
        const html = `<script>ytInitialData = {"q":"\\"}\\"","n":1};</script>`;
        const data = extractYtInitialData(html);
        expect(data.n).toBe(1);
    });
});
