import test from 'node:test';
import assert from 'node:assert/strict';
import { gpuKind, gpuName } from '../src/client/gpu.js';

// Renderer strings as browsers report them (WEBGL_debug_renderer_info).
const SEEN: [string, string, ReturnType<typeof gpuKind>][] = [
  // Chrome and Edge on Windows, through ANGLE on Direct3D.
  ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel(R) UHD Graphics 620', 'integrated'],
  ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel(R) Iris(R) Xe Graphics', 'integrated'],
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'NVIDIA GeForce RTX 3060 Laptop GPU', 'discrete'],
  ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon(TM) Graphics', 'integrated'],
  ['ANGLE (AMD, AMD Radeon RX 6700M (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon RX 6700M', 'discrete'],
  ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel(R) Arc(TM) A770 Graphics', 'discrete'],
  ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Microsoft Basic Render Driver', 'software'],
  // Hardware acceleration off.
  ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'Vulkan 1.3.0 (SwiftShader Device (Subzero))', 'software'],
  // A Mac, and Linux.
  ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'ANGLE Metal Renderer: Apple M1', 'integrated'],
  ['Mesa Intel(R) UHD Graphics 630 (CFL GT2)', 'Mesa Intel(R) UHD Graphics 630 (CFL GT2)', 'integrated'],
  ['NVIDIA GeForce GTX 1650/PCIe/SSE2', 'NVIDIA GeForce GTX 1650/PCIe/SSE2', 'discrete'],
  ['llvmpipe (LLVM 15.0.7, 256 bits)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'software'],
  // Firefox, which says less.
  ['Intel(R) HD Graphics, or similar', 'Intel(R) HD Graphics, or similar', 'integrated'],
];

test('the graphics a browser draws with, named and told apart', () => {
  for (const [renderer, name, kind] of SEEN) {
    assert.equal(gpuName(renderer), name, renderer);
    assert.equal(gpuKind(renderer), kind, renderer);
  }
  assert.equal(gpuKind(''), 'unknown');
  assert.equal(gpuKind('Some New GPU 9000'), 'unknown');
});
