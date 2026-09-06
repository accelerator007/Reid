import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('constant-time comparison contract', () => {
  const safeEqual = (left: string, right: string) => {
    const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
    if (a.length !== b.length) return false;
    let different = 0;
    for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
    return different === 0;
  };
  assertEquals(safeEqual('runner-secret', 'runner-secret'), true);
  assertEquals(safeEqual('runner-secret', 'runner-secrex'), false);
  assertEquals(safeEqual('short', 'longer'), false);
});
