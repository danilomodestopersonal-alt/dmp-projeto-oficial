'use strict';
const A=require('node:assert/strict'),H=require('./p15-harness.cjs');
// P34 intentionally removes the redundant +; current rail behavior is checked directly.
require('./p34-rail.cjs');
const link=H.loader()('components/home/SpotifyPanelLink.tsx').default();A.equal(link.type,'a');A.equal(link.props.href,'https://open.spotify.com/');A.equal(link.props.target,'_blank');A.equal(link.props.rel,'noopener noreferrer');A.equal(link.props.onClick,undefined);
console.log('PASS P29 clicks: current rail checks plus unchanged Spotify navigation.');
