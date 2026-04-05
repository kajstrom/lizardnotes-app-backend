const esbuild = require('esbuild');

const functions = ['folders', 'notes', 'attachments', 'auth'];

Promise.all(
  functions.map((name) =>
    esbuild.build({
      entryPoints: [`src/functions/${name}/handler.ts`],
      outfile: `dist/${name}/index.js`,
      platform: 'node',
      format: 'cjs',
      bundle: true,
      minify: false,
      external: [],
    }),
  ),
).catch((err) => {
  console.error(err);
  process.exit(1);
});
