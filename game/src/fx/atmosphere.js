/**
 * Atmosphere — backdrop, candlelight, particles, mood and screen-space juice.
 * OWNER: atmosphere agent.
 *
 * Public API (other agents call these; documented in docs/NOTES.md):
 *   atmosphere.setMood(region, { instant })      swap region look (17 regions)
 *   atmosphere.impact(pos, { strength, color })  hit feedback at a world or screen point
 *   atmosphere.dread(0..1, seconds)              scary-moment desaturate + edge crush
 *   atmosphere.pulse(color, amount)              soft coloured wash
 *   atmosphere.light(spec) / atmosphere.rig      add or reach your own lights
 *   atmosphere.setIntensity(0..1)                dim the whole backdrop under UI-heavy screens
 *
 * Colour rules: neutrals and light colours are read once from tokens.css; region
 * colours come from the REGIONS table below and nowhere else.
 */
import * as THREE from 'three';
import { clock } from '../core/clock.js';
import { Save } from '../core/save.js';
import { Backdrop } from './backdrop.js';
import { LightRig } from './lights.js';
import { ParticleField, PTYPE } from './particles.js';

/* ------------------------------------------------------------------ palettes */

const D = {
  arch: 0, floorPattern: 0, ceil: 6.4,
  coolFill: 0.85, grime: 0.72, openGlow: 0.5, wallFog: 0.16, gloss: 0.5,
  rim: 1.0, frameAmount: 0.62, sides: true,
  deep: '#140f1c', mid: '#2b2030', hi: '#463046', accent: '#3b6f8f', fog: '#0a0812',
  open: '#2a7f99', floorDeep: '#0a0810', floorMid: '#241a1e', propDeep: '#110c18',
  rimCol: '#ffb64a', shaft: '#ffcf8a', frame: '#05040a',
  gain: 6.4,
  bloom: 0.72, bloomThreshold: 0.78, warmTone: 0.10, halation: 0.36, exposure: 1.02,
  vignette: 1.12, grain: 0.028,
  fogDensity: 0.014,
  shafts: { count: 3, spread: 22, y: 8.2, z: -12, angle: 0.26, length: 13, width: 3.4, intensity: 0.45 },
  props: { shapes: [0, 1, 5, 6], count: 24, height: 2.2, ceil: 6.6 },
  particles: { mix: [[PTYPE.DUST, 0.82], [PTYPE.WISP, 0.11], [PTYPE.EMBER, 0.07]],
               speed: 1, scale: 1, wind: 1, density: 0.45,
               tint: '#ffe6bc', wispTint: '#6fd9ec', emberTint: '#ffb64a' },
  lights: [
    { kind: 'warm', x: -4.6, y: 2.9, z: -16.6, color: '#ffb64a', intensity: 2.30, radius: 6.2 },
    { kind: 'warm', x: 4.8, y: 2.9, z: -16.6, color: '#ff9e3c', intensity: 1.90, radius: 5.8 },
    { kind: 'warm', x: -2.4, y: 1.15, z: -6.0, color: '#ffc766', intensity: 1.75, radius: 6.2 },
    { kind: 'cold', x: 5.0, y: 3.4, z: -11.0, color: '#6fd9ec', intensity: 0.85, radius: 9.5, flicker: true },
  ],
};

/** Per-region overrides. Everything not listed falls back to D above. */
export const REGIONS = {
  foyer: {
    label: 'The Forgotten Foyer',
    deep: '#170f1a', mid: '#33222a', hi: '#523528', accent: '#3f6f8c',
    floorMid: '#2b1d1a', gloss: 0.62, openGlow: 0.62, open: '#2f8fa8',
    props: { shapes: [0, 5, 6, 0, 7, 5, 1, 4], count: 22, height: 2.3, ceil: 6.6 },
  },
  nursery: {
    label: 'The Forgotten Nursery',
    deep: '#1a1220', mid: '#3a2438', hi: '#6b4152', accent: '#5f8fb0',
    rimCol: '#ffc9a0', shaft: '#e8cfe0', floorMid: '#2c2028', gloss: 0.42,
    open: '#7fb6c9', openGlow: 0.55, grime: 0.58, ceil: 5.4,
    props: { shapes: [0, 8, 5, 7, 4], count: 22, height: 1.7, ceil: 5.6 },
    particles: { mix: [[PTYPE.DUST, 0.68], [PTYPE.ASH, 0.20], [PTYPE.WISP, 0.12]],
                 tint: '#ffdfe4', wispTint: '#a8ecf7', emberTint: '#ffc7a0',
                 speed: 0.8, scale: 1.1, wind: 0.6, density: 0.9 },
    lights: [
      { kind: 'warm', x: -5.0, y: 1.0, z: -7.0, color: '#ffb87a', intensity: 1.25, radius: 5.4 },
      { kind: 'cold', x: 4.0, y: 4.4, z: -16.0, color: '#9fd8ee', intensity: 1.25, radius: 11.0 },
      { kind: 'cold', x: -6.0, y: 4.6, z: -16.5, color: '#8fc8e8', intensity: 0.80, radius: 9.0 },
      { kind: 'warm', x: 6.5, y: 2.2, z: -10.0, color: '#ffcf8c', intensity: 0.55, radius: 5.0 },
    ],
    shafts: { count: 2, spread: 16, y: 8.0, z: -14, angle: 0.34, length: 13, width: 4.0, intensity: 0.55 },
  },
  sleeping: {
    label: 'The Sleeping Quarters',
    deep: '#0f0d1e', mid: '#221f3c', hi: '#38335c', accent: '#4a6ea8',
    shaft: '#b9cdf0', floorDeep: '#07060f', floorMid: '#191a2c', gloss: 0.38,
    open: '#3f6fb0', openGlow: 0.42, coolFill: 1.15, wallFog: 0.22,
    props: { shapes: [0, 5, 7, 8, 6], count: 24, height: 2.1, ceil: 5.8 },
    particles: { mix: [[PTYPE.DUST, 0.60], [PTYPE.WISP, 0.28], [PTYPE.ASH, 0.12]],
                 tint: '#cfd8f2', wispTint: '#8fb7ff', emberTint: '#ffb64a',
                 speed: 0.7, scale: 1.0, wind: 0.5, density: 0.8 },
    lights: [
      { kind: 'warm', x: -3.0, y: 1.0, z: -5.5, color: '#ffb24a', intensity: 1.30, radius: 4.6 },
      { kind: 'cold', x: 6.5, y: 4.8, z: -16.5, color: '#7fa8f0', intensity: 1.35, radius: 12.0 },
      { kind: 'cold', x: -8.0, y: 3.0, z: -13.0, color: '#5f8fd8', intensity: 0.55, radius: 8.0 },
    ],
    bloom: 0.78, vignette: 1.14,
  },
  kitchens: {
    label: 'The Kitchens and Cellars',
    arch: 4, floorPattern: 2,
    deep: '#170e0c', mid: '#38201a', hi: '#5e3520', accent: '#6f8f4f',
    rimCol: '#ff8a3c', shaft: '#ff9e4a', floorDeep: '#0c0806', floorMid: '#2a1a12',
    gloss: 0.70, grime: 0.92, ceil: 5.2, open: '#c26a2a', openGlow: 0.7,
    props: { shapes: [8, 5, 1, 6, 7], count: 26, height: 2.0, ceil: 5.4 },
    particles: { mix: [[PTYPE.EMBER, 0.46], [PTYPE.DUST, 0.40], [PTYPE.PLASTER, 0.14]],
                 tint: '#ffcf9a', wispTint: '#8fd9a8', emberTint: '#ff7a28',
                 speed: 1.2, scale: 1.05, wind: 1.3, density: 0.95 },
    lights: [
      { kind: 'warm', x: -4.5, y: 1.6, z: -9.0, color: '#ff7a28', intensity: 2.00, radius: 7.0 },
      { kind: 'warm', x: 5.5, y: 2.4, z: -15.0, color: '#ffa03c', intensity: 1.20, radius: 7.5 },
      { kind: 'warm', x: 0.5, y: 0.8, z: -4.5, color: '#ffbf5a', intensity: 0.85, radius: 4.5 },
      { kind: 'cold', x: -8.0, y: 4.0, z: -14.0, color: '#7fc9a0', intensity: 0.45, radius: 8.0 },
    ],
    shafts: { count: 2, spread: 14, y: 6.0, z: -12, angle: 0.20, length: 9, width: 3.0, intensity: 0.42 },
    bloom: 1.0, warmTone: 0.14, halation: 0.75,
  },
  greenhouse: {
    label: 'The Impossible Greenhouse',
    arch: 1, floorPattern: 2,
    deep: '#0b1610', mid: '#17311f', hi: '#2a5236', accent: '#4fbf8f',
    rimCol: '#a8ff9e', shaft: '#9fe6c8', floorDeep: '#07100b', floorMid: '#152a1a',
    gloss: 0.55, grime: 0.60, ceil: 7.4, open: '#5fd8a8', openGlow: 0.75, coolFill: 1.2,
    props: { shapes: [2, 9, 2, 6, 9], count: 28, height: 2.6, ceil: 7.0 },
    particles: { mix: [[PTYPE.SPORE, 0.52], [PTYPE.DUST, 0.30], [PTYPE.WISP, 0.18]],
                 tint: '#d9ffcf', wispTint: '#7fffc9', emberTint: '#cfff6a',
                 speed: 0.85, scale: 1.35, wind: 0.7, density: 0.95 },
    lights: [
      { kind: 'cold', x: -6.0, y: 5.6, z: -16.0, color: '#7fe8c0', intensity: 1.00, radius: 9.5 },
      { kind: 'cold', x: 7.0, y: 5.0, z: -15.0, color: '#5fd0e8', intensity: 0.72, radius: 8.5 },
      { kind: 'warm', x: -2.6, y: 1.2, z: -5.5, color: '#ffbb52', intensity: 2.40, radius: 6.4 },
      { kind: 'cold', x: 3.0, y: 1.4, z: -9.0, color: '#a8ff7a', intensity: 0.45, radius: 5.5 },
    ],
    shafts: { count: 4, spread: 26, y: 9.5, z: -13, angle: 0.30, length: 15, width: 3.6, intensity: 0.60 },
    bloom: 0.92,
  },
  graveyard: {
    label: 'The Mansion Graveyard',
    sides: false,
    arch: 2, floorPattern: 2,
    deep: '#101418', mid: '#242c33', hi: '#3d4952', accent: '#6f9fc0',
    shaft: '#cfe4f5', floorDeep: '#080a0d', floorMid: '#1a2020', gloss: 0.30,
    grime: 0.85, ceil: 8.0, coolFill: 1.15, wallFog: 0.26,
    props: { shapes: [3, 3, 9, 6, 3], count: 30, height: 1.5, ceil: 6.0 },
    particles: { mix: [[PTYPE.ASH, 0.40], [PTYPE.DUST, 0.34], [PTYPE.WISP, 0.26]],
                 tint: '#cfd9e0', wispTint: '#8fe8d0', emberTint: '#ffb64a',
                 speed: 0.65, scale: 1.2, wind: 0.9, density: 0.9 },
    lights: [
      { kind: 'cold', x: -4.0, y: 7.0, z: -14.0, color: '#a8c8e8', intensity: 1.30, radius: 14.0, flicker: false },
      { kind: 'warm', x: 2.5, y: 0.9, z: -6.0, color: '#ffb24a', intensity: 1.35, radius: 5.0 },
      { kind: 'cold', x: 7.5, y: 1.2, z: -11.0, color: '#7fe8c8', intensity: 0.65, radius: 6.5 },
    ],
    shafts: { count: 3, spread: 20, y: 10.0, z: -13, angle: 0.18, length: 15, width: 3.0, intensity: 0.40 },
    vignette: 1.1,
  },
  study: {
    label: 'The Grand Study and Library',
    deep: '#170f0e', mid: '#33211b', hi: '#57392a', accent: '#4f7f9f',
    shaft: '#ffd89a', floorMid: '#2c1c14', gloss: 0.58, grime: 0.62, ceil: 6.8,
    open: '#3f8fa8', openGlow: 0.45,
    props: { shapes: [5, 5, 0, 6, 1, 4], count: 28, height: 2.6, ceil: 6.8 },
    particles: { mix: [[PTYPE.DUST, 0.86], [PTYPE.EMBER, 0.08], [PTYPE.WISP, 0.06]],
                 tint: '#ffe6bc', wispTint: '#8fd9ec', emberTint: '#ffb64a',
                 speed: 0.7, scale: 0.95, wind: 0.5, density: 1.0 },
    lights: [
      { kind: 'warm', x: -3.5, y: 1.3, z: -5.5, color: '#ffbb52', intensity: 1.75, radius: 6.0 },
      { kind: 'warm', x: 6.0, y: 2.6, z: -15.5, color: '#ffa83c', intensity: 1.05, radius: 7.0 },
      { kind: 'warm', x: -8.5, y: 3.4, z: -16.0, color: '#e89a3c', intensity: 0.70, radius: 6.5 },
      { kind: 'cold', x: 4.0, y: 5.0, z: -13.0, color: '#5fa8c8', intensity: 0.45, radius: 8.0 },
    ],
    warmTone: 0.13, halation: 0.68,
  },
  attic: {
    label: 'The Moonlit Attic and Observatory',
    arch: 4, floorPattern: 0,
    deep: '#0e0d1c', mid: '#201d38', hi: '#393258', accent: '#7f8fd8',
    shaft: '#cfd8ff', rimCol: '#ffd08a', floorDeep: '#070610', floorMid: '#1a1828',
    gloss: 0.36, grime: 0.80, ceil: 7.6, coolFill: 1.20, wallFog: 0.20,
    props: { shapes: [8, 6, 5, 7, 4], count: 26, height: 2.2, ceil: 7.0 },
    particles: { mix: [[PTYPE.DUST, 0.62], [PTYPE.WISP, 0.26], [PTYPE.ASH, 0.12]],
                 tint: '#d8dcf5', wispTint: '#b0b8ff', emberTint: '#ffcf7a',
                 speed: 0.6, scale: 1.0, wind: 0.4, density: 0.95 },
    lights: [
      { kind: 'cold', x: 5.5, y: 6.4, z: -15.0, color: '#a8b8ff', intensity: 1.50, radius: 13.0, flicker: false },
      { kind: 'warm', x: -4.0, y: 1.1, z: -6.0, color: '#ffb24a', intensity: 1.30, radius: 5.2 },
      { kind: 'cold', x: -7.0, y: 3.4, z: -12.0, color: '#7f9fe8', intensity: 0.50, radius: 8.0 },
    ],
    shafts: { count: 3, spread: 18, y: 10.5, z: -13, angle: 0.36, length: 16, width: 3.2, intensity: 0.58 },
  },
  lampworks: {
    label: 'The Lampworks',
    arch: 4, floorPattern: 2,
    deep: '#0d1016', mid: '#1e2733', hi: '#2f4152', accent: '#4fa8d8',
    rimCol: '#8fd8ff', shaft: '#8fd0ff', floorDeep: '#07090d', floorMid: '#161e26',
    gloss: 0.66, grime: 0.85, ceil: 6.6, open: '#4fb8e8', openGlow: 0.7, coolFill: 1.1,
    props: { shapes: [1, 4, 6, 8, 5], count: 28, height: 2.4, ceil: 6.6 },
    particles: { mix: [[PTYPE.EMBER, 0.42], [PTYPE.WISP, 0.30], [PTYPE.DUST, 0.28]],
                 tint: '#cfe8ff', wispTint: '#6fd9ec', emberTint: '#ff9e3c',
                 speed: 1.1, scale: 1.1, wind: 1.0, density: 1.0 },
    lights: [
      { kind: 'cold', x: -6.5, y: 4.2, z: -14.5, color: '#4fc8ff', intensity: 1.55, radius: 9.0 },
      { kind: 'warm', x: 4.5, y: 1.5, z: -7.0, color: '#ff8a28', intensity: 1.60, radius: 6.0 },
      { kind: 'cold', x: 8.0, y: 4.4, z: -15.0, color: '#6fd9ec', intensity: 1.05, radius: 8.5 },
      { kind: 'warm', x: -2.0, y: 3.6, z: -11.0, color: '#ffbf5a', intensity: 0.70, radius: 5.5 },
    ],
    bloom: 1.05, halation: 0.85,
  },
  ballroom: {
    label: 'The Ballroom and Velvet Suites',
    floorPattern: 1,
    deep: '#1a0d14', mid: '#3d1a26', hi: '#6b2f38', accent: '#8f5f9f',
    rimCol: '#ffd06a', shaft: '#ffe0a0', floorDeep: '#0d0710', floorMid: '#33202a',
    gloss: 0.80, grime: 0.48, ceil: 7.6, open: '#c05a7a', openGlow: 0.6,
    props: { shapes: [4, 4, 7, 6, 0, 1], count: 30, height: 2.8, ceil: 7.4 },
    particles: { mix: [[PTYPE.DUST, 0.58], [PTYPE.EMBER, 0.26], [PTYPE.WISP, 0.16]],
                 tint: '#ffe8c0', wispTint: '#d8a8ff', emberTint: '#ffc95a',
                 speed: 0.9, scale: 1.1, wind: 0.8, density: 1.0 },
    lights: [
      { kind: 'warm', x: -5.5, y: 4.6, z: -12.0, color: '#ffc95a', intensity: 1.85, radius: 8.5 },
      { kind: 'warm', x: 5.5, y: 4.6, z: -12.5, color: '#ffb84a', intensity: 1.65, radius: 8.5 },
      { kind: 'warm', x: 0.0, y: 5.4, z: -15.5, color: '#ffd88a', intensity: 1.15, radius: 9.5 },
      { kind: 'cold', x: -9.0, y: 2.0, z: -9.0, color: '#a86fd8', intensity: 0.55, radius: 7.0 },
    ],
    bloom: 1.10, warmTone: 0.14, halation: 0.85, vignette: 0.92,
  },
  crypt: {
    label: 'The Crypt and Ossuary',
    arch: 2, floorPattern: 2,
    deep: '#0c1013', mid: '#1e262a', hi: '#38443f', accent: '#4fc0c0',
    rimCol: '#e8f6ee', shaft: '#a8f0e0', floorDeep: '#06090a', floorMid: '#171e1e',
    gloss: 0.42, grime: 0.90, ceil: 6.0, coolFill: 1.25, wallFog: 0.28,
    props: { shapes: [3, 6, 3, 8, 3], count: 28, height: 1.8, ceil: 6.0 },
    particles: { mix: [[PTYPE.DUST, 0.48], [PTYPE.WISP, 0.36], [PTYPE.ASH, 0.16]],
                 tint: '#cfe0dc', wispTint: '#5fe8d8', emberTint: '#ffb64a',
                 speed: 0.6, scale: 1.15, wind: 0.4, density: 0.85 },
    lights: [
      { kind: 'warm', x: -2.6, y: 1.1, z: -5.2, color: '#ffab3c', intensity: 2.60, radius: 6.6 },
      { kind: 'cold', x: 6.0, y: 2.2, z: -15.0, color: '#4fe0d0', intensity: 1.15, radius: 9.0 },
      { kind: 'cold', x: -7.5, y: 1.8, z: -13.0, color: '#3fc0c8', intensity: 0.80, radius: 7.5 },
    ],
    shafts: { count: 2, spread: 14, y: 7.0, z: -14, angle: 0.16, length: 12, width: 2.6, intensity: 0.40 },
    vignette: 1.18, bloom: 0.90,
  },
  hedge: {
    label: 'The Withered Hedge Maze',
    sides: false,
    arch: 3, floorPattern: 2,
    deep: '#12100a', mid: '#2c2814', hi: '#4a4322', accent: '#8f8f4f',
    rimCol: '#d8c06a', shaft: '#cfc08a', floorDeep: '#0b0906', floorMid: '#241f12',
    gloss: 0.30, grime: 0.95, ceil: 8.0, coolFill: 0.95, wallFog: 0.24,
    props: { shapes: [9, 9, 2, 3, 9], count: 30, height: 2.4, ceil: 6.4 },
    particles: { mix: [[PTYPE.SPORE, 0.44], [PTYPE.ASH, 0.30], [PTYPE.DUST, 0.26]],
                 tint: '#e0d8a8', wispTint: '#b08fd8', emberTint: '#d8a04a',
                 speed: 0.75, scale: 1.3, wind: 1.4, density: 0.95 },
    lights: [
      { kind: 'cold', x: -3.0, y: 8.0, z: -14.0, color: '#9fb8d8', intensity: 1.15, radius: 14.0, flicker: false },
      { kind: 'warm', x: 3.0, y: 1.0, z: -6.0, color: '#ffab3c', intensity: 1.40, radius: 5.2 },
      { kind: 'cold', x: -7.0, y: 1.2, z: -10.0, color: '#a87fd8', intensity: 0.55, radius: 6.0 },
    ],
    shafts: { count: 4, spread: 24, y: 10.0, z: -12, angle: 0.30, length: 14, width: 2.8, intensity: 0.48 },
  },
  passages: {
    label: 'The Secret Passages',
    arch: 2, floorPattern: 0,
    deep: '#0a0810', mid: '#1a1420', hi: '#2c2130', accent: '#5f4f8f',
    rimCol: '#ffb64a', shaft: '#ffcf8a', floorDeep: '#050409', floorMid: '#151018',
    gloss: 0.45, grime: 0.95, ceil: 4.4, coolFill: 0.65, wallFog: 0.14,
    props: { shapes: [6, 8, 5, 7], count: 20, height: 1.9, ceil: 4.4 },
    particles: { mix: [[PTYPE.DUST, 0.78], [PTYPE.PLASTER, 0.16], [PTYPE.WISP, 0.06]],
                 tint: '#ffe0b8', wispTint: '#a87fd8', emberTint: '#ffb64a',
                 speed: 0.8, scale: 0.9, wind: 0.5, density: 1.0 },
    lights: [
      { kind: 'warm', x: -1.0, y: 1.9, z: -5.0, color: '#ffb04a', intensity: 2.10, radius: 4.4 },
      { kind: 'cold', x: 4.0, y: 1.6, z: -14.0, color: '#7f5fd8', intensity: 0.50, radius: 7.0 },
    ],
    shafts: { count: 1, spread: 6, y: 4.6, z: -12, angle: 0.10, length: 8, width: 1.8, intensity: 0.35 },
    vignette: 1.30, bloom: 0.80,
  },
  bathhouse: {
    label: 'The Bathhouse and Rain Wing',
    arch: 1, floorPattern: 1,
    deep: '#091418', mid: '#152d33', hi: '#27505a', accent: '#4fc8e0',
    rimCol: '#cfeeff', shaft: '#a8e0f5', floorDeep: '#060f12', floorMid: '#12262b',
    gloss: 1.05, grime: 0.55, ceil: 6.8, open: '#5fd0e8', openGlow: 0.7, coolFill: 1.25,
    wallFog: 0.30,
    props: { shapes: [6, 6, 7, 8, 1], count: 24, height: 2.4, ceil: 6.6 },
    particles: { mix: [[PTYPE.RAIN, 0.58], [PTYPE.DUST, 0.26], [PTYPE.WISP, 0.16]],
                 tint: '#bfe8f5', wispTint: '#6fd9ec', emberTint: '#ffb64a',
                 speed: 1.0, scale: 1.0, wind: 1.2, density: 1.0 },
    lights: [
      { kind: 'cold', x: -5.5, y: 4.6, z: -15.5, color: '#5fd0e8', intensity: 1.50, radius: 11.0 },
      { kind: 'warm', x: 4.0, y: 1.2, z: -6.5, color: '#ffb85a', intensity: 1.20, radius: 5.0 },
      { kind: 'cold', x: 7.5, y: 3.2, z: -12.0, color: '#7fe0f5', intensity: 0.85, radius: 8.0 },
    ],
    shafts: { count: 4, spread: 22, y: 8.6, z: -13, angle: 0.24, length: 13, width: 3.2, intensity: 0.62 },
    bloom: 0.95,
  },
  kennels: {
    label: 'The Kennels and Animal Ward',
    floorPattern: 2,
    deep: '#160f0c', mid: '#33241a', hi: '#573f26', accent: '#5f7f8f',
    rimCol: '#ffc978', shaft: '#ffd89a', floorDeep: '#0b0806', floorMid: '#2a1f14',
    gloss: 0.38, grime: 0.68, ceil: 5.0, open: '#4f9fb0', openGlow: 0.5,
    props: { shapes: [6, 6, 8, 5, 6], count: 28, height: 2.0, ceil: 5.0 },
    particles: { mix: [[PTYPE.DUST, 0.70], [PTYPE.ASH, 0.20], [PTYPE.EMBER, 0.10]],
                 tint: '#ffdfae', wispTint: '#8fd9ec', emberTint: '#ffb64a',
                 speed: 0.8, scale: 1.1, wind: 0.6, density: 0.95 },
    lights: [
      { kind: 'warm', x: -4.0, y: 3.0, z: -14.0, color: '#ffb04a', intensity: 1.45, radius: 8.0 },
      { kind: 'warm', x: 3.5, y: 1.1, z: -6.0, color: '#ffc978', intensity: 1.30, radius: 5.4 },
      { kind: 'cold', x: 8.0, y: 2.6, z: -12.0, color: '#5fa8c0', intensity: 0.60, radius: 7.0 },
    ],
    warmTone: 0.12,
  },
  pumpkin: {
    label: 'The Moon Courtyard and Pumpkin Grounds',
    sides: false,
    arch: 3, floorPattern: 2,
    deep: '#0c1216', mid: '#1c2c2a', hi: '#334a3c', accent: '#6fa8c8',
    rimCol: '#ff9e3c', shaft: '#cfe4f5', floorDeep: '#080d0e', floorMid: '#1a2420',
    gloss: 0.44, grime: 0.72, ceil: 9.0, coolFill: 1.15, wallFog: 0.22,
    props: { shapes: [9, 2, 9, 3, 9], count: 30, height: 2.2, ceil: 6.0 },
    particles: { mix: [[PTYPE.DUST, 0.40], [PTYPE.SPORE, 0.30], [PTYPE.EMBER, 0.30]],
                 tint: '#cfe0e8', wispTint: '#8fe8c0', emberTint: '#ff8a28',
                 speed: 0.9, scale: 1.25, wind: 1.1, density: 1.0 },
    lights: [
      { kind: 'cold', x: -5.0, y: 9.0, z: -15.0, color: '#a8c8e8', intensity: 1.55, radius: 16.0, flicker: false },
      { kind: 'warm', x: 2.5, y: 0.8, z: -6.0, color: '#ff8a28', intensity: 1.80, radius: 5.6 },
      { kind: 'warm', x: -6.0, y: 0.7, z: -10.0, color: '#ffa53c', intensity: 1.00, radius: 5.0 },
      { kind: 'warm', x: 7.0, y: 0.7, z: -13.0, color: '#ff9e3c', intensity: 0.75, radius: 4.6 },
    ],
    shafts: { count: 3, spread: 22, y: 11.0, z: -13, angle: 0.22, length: 16, width: 3.4, intensity: 0.50 },
    bloom: 0.98,
  },
  heart: {
    label: 'The Heart of the House',
    floorPattern: 1,
    deep: '#1a1410', mid: '#3a2c1e', hi: '#6b5236', accent: '#c9a86f',
    rimCol: '#fff0c8', shaft: '#ffeecf', floorDeep: '#100c08', floorMid: '#33281c',
    gloss: 0.72, grime: 0.22, ceil: 7.0, open: '#ffe0a0', openGlow: 0.85, coolFill: 0.7,
    wallFog: 0.12,
    props: { shapes: [6, 6, 0, 5, 7], count: 24, height: 2.5, ceil: 7.0 },
    particles: { mix: [[PTYPE.DUST, 0.54], [PTYPE.WISP, 0.30], [PTYPE.EMBER, 0.16]],
                 tint: '#fff2d8', wispTint: '#ffd9a8', emberTint: '#ffcf7a',
                 speed: 0.55, scale: 1.15, wind: 0.35, density: 1.0 },
    lights: [
      { kind: 'warm', x: 0.0, y: 4.2, z: -16.4, color: '#ffe0a0', intensity: 1.35, radius: 11.0, flicker: false },
      { kind: 'warm', x: -6.0, y: 2.2, z: -10.0, color: '#ffcf8a', intensity: 0.95, radius: 7.0 },
      { kind: 'warm', x: 6.0, y: 2.2, z: -10.0, color: '#ffcf8a', intensity: 0.95, radius: 7.0 },
      { kind: 'cold', x: 0.0, y: 1.0, z: -4.0, color: '#8fd9ec', intensity: 0.35, radius: 5.0 },
    ],
    shafts: { count: 3, spread: 16, y: 8.0, z: -13, angle: 0.20, length: 12, width: 3.8, intensity: 0.70 },
    bloom: 0.80, warmTone: 0.15, halation: 0.55, vignette: 0.92, grain: 0.022, openGlow: 0.55,
  },
};

/** Region alias -> palette key, so scenes can pass design-doc names. */
export const REGION_ALIAS = {
  foyer: 'foyer', nursery: 'nursery', 'sleeping-quarters': 'sleeping', sleeping: 'sleeping',
  kitchens: 'kitchens', cellars: 'kitchens', greenhouse: 'greenhouse', conservatory: 'greenhouse',
  graveyard: 'graveyard', study: 'study', library: 'study', attic: 'attic',
  observatory: 'attic', lampworks: 'lampworks', ballroom: 'ballroom', crypt: 'crypt',
  ossuary: 'crypt', hedge: 'hedge', 'hedge-maze': 'hedge', passages: 'passages',
  'secret-passages': 'passages', bathhouse: 'bathhouse', kennels: 'kennels',
  pumpkin: 'pumpkin', 'pumpkin-grounds': 'pumpkin', heart: 'heart',
};

const COLOR_KEYS = [
  ['deep', '_deep'], ['mid', '_mid'], ['hi', '_hi'], ['accent', '_accent'],
  ['fog', '_fog'], ['open', '_open'], ['floorDeep', '_floorDeep'],
  ['floorMid', '_floorMid'], ['propDeep', '_propDeep'], ['rimCol', '_rim'],
  ['shaft', '_shaft'], ['frame', '_frame'],
];
const NUM_KEYS = ['coolFill', 'grime', 'openGlow', 'wallFog', 'gloss', 'rim', 'gain',
  'frameAmount', 'ceil', 'bloom', 'bloomThreshold', 'warmTone', 'halation',
  'exposure', 'vignette', 'grain', 'fogDensity'];

function resolve(name) {
  const key = REGION_ALIAS[name] || (REGIONS[name] ? name : 'foyer');
  const src = REGIONS[key] || {};
  const out = Object.assign({}, D, src);
  out.shafts = Object.assign({}, D.shafts, src.shafts);
  out.props = Object.assign({}, D.props, src.props);
  out.particles = Object.assign({}, D.particles, src.particles);
  out.lights = src.lights || D.lights;
  out.key = key;
  for (const [hex, dst] of COLOR_KEYS) out[dst] = new THREE.Color(out[hex]);
  return out;
}

/* ------------------------------------------------------------------- engine */

export class Atmosphere {
  constructor(ctx) {
    this.ctx = ctx;
    this.mood = null;
    this.ready = false;
    this._dread = 0; this._dreadTarget = 0;
    this._intensity = 1;
    this._fade = 1;
    this._t = 0;
    this._seed = 1;
    // reusable scratch — no per-frame allocation
    this._v3 = new THREE.Vector3();
    this._v3b = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  init() {
    const stage = this.ctx.stage;
    this.tokens = this._readTokens();

    this.backdrop = new Backdrop(stage.scene);
    this.rig = new LightRig(stage.scene);
    this.particles = new ParticleField(stage.scene, { count: 1500, seedFn: () => this._rand() });
    this.particles.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

    // a pooled light used by impact() so hits actually illuminate the room
    this.flare = this.rig.add({ kind: 'warm', pos: new THREE.Vector3(0, 2, -4), color: 0xffd75e, intensity: 0, radius: 6, flicker: false });
    this._flareDecay = 0;

    this.live = resolve('foyer');
    this.target = this.live;
    this.setMood('foyer', { instant: true });

    this._unsub = clock.onFrame((dt, t) => this.update(dt, t));
    this.ready = true;
    return this;
  }

  /* ------------------------------------------------------------ public API */

  /** Swap region look. Cross-fades colour/light over ~0.7 s unless instant. */
  setMood(name, opts = {}) {
    if (!this.backdrop) return this;
    const pal = resolve(name);
    this.mood = pal.key;
    this.target = pal;
    this._seed = 1;
    for (let i = 0; i < pal.key.length; i++) this._seed = (this._seed * 31 + pal.key.charCodeAt(i)) % 100003;

    this.backdrop.build(pal, () => this._rand());
    this._buildLights(pal);
    this.particles.setConfig(pal.particles);
    this.particles.setVolume(0, 4.4, -9, 17, 4.4, 8);
    this.ctx.stage.scene.fog.color.copy(pal._fog);
    this.ctx.stage.scene.fog.density = pal.fogDensity;
    this.ctx.stage.renderer.setClearColor(pal._fog.getHex(), 1);

    if (opts.instant || Save.settings?.reduceMotion) {
      this.live = pal;
      this.backdrop.applyPalette(pal);
      this._applyGrade(pal, 1);
      this._fade = 1;
    } else {
      // keep the live object identity, ease its numbers toward the target
      this.live = Object.assign({}, this.live);
      for (const [, dst] of COLOR_KEYS) this.live[dst] = this.live[dst].clone();
      this._fade = 0;
    }
    return this;
  }

  /** 0..1 scary-moment grade: desaturate, cool, crush the edges. */
  dread(v, dur = 0.6) {
    v = Math.max(0, Math.min(1, v));
    if (dur <= 0 || Save.settings?.reduceMotion) { this._dread = this._dreadTarget = v; return this; }
    const from = this._dread;
    this._dreadTarget = v;
    clock.ramp(dur, (k) => { this._dread = from + (v - from) * k; });
    return this;
  }

  /** Soft coloured wash across the whole frame. Gated by Save.settings.flashes. */
  pulse(color = 0x6fd9ec, amount = 0.20, dur = 0.55) {
    this.ctx.stage.pulse(typeof color === 'string' ? new THREE.Color(color).getHex() : color, amount, dur);
    return this;
  }

  /**
   * Hit feedback. `pos` may be a THREE.Vector3 (world) or {x, y} in CSS pixels.
   * opts: { strength 0..2, color, shake, burst }
   */
  impact(pos, opts = {}) {
    if (!this.ready) return this;
    const strength = opts.strength ?? 1;
    const colorHex = typeof opts.color === 'string'
      ? new THREE.Color(opts.color).getHex()
      : (opts.color ?? 0xffd75e);

    const w = this._toWorld(pos, this._v3);
    // particles
    if (opts.burst !== false) {
      this.particles.burst(w.x, w.y, w.z, colorHex, 1.1 + strength * 1.3, 0.62);
    }
    // a real light flash at the hit point
    this.flare.setPos(w.x, w.y, w.z);
    this.flare.color.set(colorHex);
    this.flare.point.color.set(colorHex);
    this.flare.base = 2.2 * strength;
    this._flareDecay = 1;
    // screen-space ring + shake
    this._v3b.copy(w).project(this.ctx.stage.camera);
    this.ctx.stage.ripple(this._v3b.x * 0.5 + 0.5, this._v3b.y * 0.5 + 0.5, Math.min(strength, 1.6));
    if (opts.shake !== false) this.ctx.stage.shake(0.07 + 0.10 * strength, 10);
    if (strength >= 0.8) this.ctx.stage.flash(colorHex, 0.05 * Math.min(strength, 2), 0.14);
    return this;
  }

  /** Add your own light. Returns an AtmoLight (setPos / .base / .enabled). */
  light(spec) { return this.rig.add(spec); }

  /** Dim the whole backdrop — useful when a scene puts a lot of UI on top. */
  setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); return this; }

  /* ------------------------------------------------------------- internals */

  _rand() {
    this._seed = (this._seed * 1103515245 + 12345) & 0x7fffffff;
    return (this._seed >>> 8) / 8388608;
  }

  _readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const t = {};
    for (const k of ['--ink-900', '--ink-800', '--ink-700', '--flame-glow', '--flame-300',
      '--flame-100', '--spectre-300', '--spectre-500', '--spectre-100', '--threat-300',
      '--pluck-300', '--text-hi']) {
      const v = cs.getPropertyValue(k).trim();
      if (v) t[k.slice(2)] = v;
    }
    return t;
  }

  _buildLights(pal) {
    this.rig.clear();
    for (const L of pal.lights) {
      this.rig.add({
        kind: L.kind, color: L.color, intensity: L.intensity, radius: L.radius,
        flicker: L.flicker !== false,
        pos: this._v3b.set(L.x, L.y, L.z),
      });
    }
    this.flare = this.rig.add({ kind: 'warm', pos: this._v3b.set(0, 2, -4), color: 0xffd75e, intensity: 0, radius: 6, flicker: false });
    this._flareDecay = 0;
    // ambient bounce keyed to the region's cool accent so nothing is dead black
    this._col.copy(pal._accent).multiplyScalar(0.16);
    this.rig.setAmbient(this._col.getHex(), 0.5, pal._accent.getHex(), pal._deep.getHex(), 0.40);
  }

  _applyGrade(pal, k) {
    const u = this.ctx.stage.grade.uniforms;
    const b = this.ctx.stage.bloom;
    b.strength = pal.bloom * this._intensity;
    b.threshold = pal.bloomThreshold;
    u.uToneAmt.value = pal.warmTone;
    u.uHalation.value = pal.halation;
    u.uExposure.value = pal.exposure;
    u.uVignette.value = pal.vignette;
    u.uGrain.value = pal.grain;
    u.uHaloColor.value.copy(pal._rim).lerp(this._col.set(1, 1, 1), 0.25);
  }

  /** world position from a Vector3, or from CSS pixels on the z = 0 plane. */
  _toWorld(pos, out) {
    if (pos && pos.isVector3) return out.copy(pos);
    const cam = this.ctx.stage.camera;
    const x = (pos?.x ?? innerWidth / 2) / innerWidth * 2 - 1;
    const y = -((pos?.y ?? innerHeight / 2) / innerHeight) * 2 + 1;
    out.set(x, y, 0.5).unproject(cam);
    out.sub(cam.position).normalize();
    const dist = (0 - cam.position.z) / out.z;
    return out.multiplyScalar(dist).add(cam.position);
  }

  update(dt, t) {
    if (!this.ready) return;
    this._t = t;
    const reduce = Save.settings?.reduceMotion ? 1 : 0;
    const motion = reduce ? 0.25 : 1;

    // ---- mood cross-fade ----------------------------------------------------
    if (this._fade < 1) {
      this._fade = Math.min(1, this._fade + dt / 0.7);
      const k = this._fade * this._fade * (3 - 2 * this._fade);
      const L = this.live, T = this.target;
      for (const [, dst] of COLOR_KEYS) L[dst].lerp(T[dst], k * 0.35 + 0.06);
      for (const key of NUM_KEYS) L[key] = L[key] + (T[key] - L[key]) * (k * 0.4 + 0.06);
      L.arch = T.arch; L.floorPattern = T.floorPattern;
      this.backdrop.applyPalette(L);
      this._applyGrade(L, k);
      if (this._fade >= 1) { this.live = T; this.backdrop.applyPalette(T); this._applyGrade(T, 1); }
    }

    // ---- lights -------------------------------------------------------------
    if (this._flareDecay > 0) {
      this._flareDecay = Math.max(0, this._flareDecay - dt / 0.30);
      this.flare.base = this.flare.base * this._flareDecay;
      if (this._flareDecay <= 0) this.flare.base = 0;
    }
    this.rig.update(dt, t, motion);
    this.backdrop.syncLights(this.rig);
    this.particles.syncLights(this.rig);

    // ---- dread + intensity --------------------------------------------------
    this.backdrop.setDread(this._dread);
    this.particles.setDread(this._dread);
    this.ctx.stage.grade.uniforms.uDread.value = this._dread;

    // ---- idle camera breathing (parallax through the layered backdrop) ------
    if (!reduce) {
      this.ctx.stage.setParallax(
        Math.sin(t * 0.17) * 0.20 + Math.sin(t * 0.41) * 0.06,
        Math.sin(t * 0.23 + 1.3) * 0.10,
        Math.sin(t * 0.11) * 0.14
      );
    }
    this.backdrop.setSway(motion);
    this.particles.setReduce(reduce);

    this.backdrop.update(dt, t);
    this.particles.update(dt, t);
  }

  dispose() {
    this._unsub?.();
    this.backdrop?.dispose();
    this.particles?.dispose();
    this.rig?.clear();
    this.ready = false;
  }
}
