'use strict';
// Opt in at server start, never during npm run build or validation.
process.env.DMP_KIDS_SCHEDULER='1';
const next=require.resolve('next/dist/bin/next');
process.argv=[process.execPath,next,'start',...process.argv.slice(2)];
require(next);
