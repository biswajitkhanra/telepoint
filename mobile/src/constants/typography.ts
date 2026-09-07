// constants/typography.ts
// Clean sans typography hierarchy with tabular figures (Jupiter numbers as hero principle)

import { TextStyle } from 'react-native';

export const Typography = {
  // Hero numbers — Jupiter principle #1
  heroAmount: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  heroLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } as TextStyle,

  // Section headings
  h1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  } as TextStyle,

  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.2,
  } as TextStyle,

  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  } as TextStyle,

  // Body text
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  } as TextStyle,

  bodyMd: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  } as TextStyle,

  bodySm: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  } as TextStyle,

  // Tabular numeric formats
  numLg: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  numMd: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  numSm: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  } as TextStyle,

  // Buttons
  btnLg: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  } as TextStyle,

  btnMd: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  } as TextStyle,

  // Caption & fine metadata
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  } as TextStyle,
};
