const esbuild = require('esbuild');
const { execSync } = require('child_process');

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
)
  .then(() => {
    for (const name of functions) {
      execSync(`zip -j dist/${name}/function.zip dist/${name}/index.js`, { stdio: 'inherit' });
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
