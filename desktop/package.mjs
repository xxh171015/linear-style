import { packager } from '@electron/packager';
import path from 'node:path';
const root = process.cwd();
const paths = await packager({ dir: root, out: path.join(root,'artifacts/desktop'), name: 'Linear Replica', executableName: 'Linear Replica',
  appBundleId: 'local.linear.replica', platform: process.platform, arch: process.arch, overwrite: true,
  prune: true, asar: true, icon: path.join(root,'desktop/app-icon.icns'),
  ignore: [/^\/(?!dist(?:\/|$)|desktop(?:\/|$)|package\.json$)/],
  extendInfo: { CFBundleURLTypes: [{CFBundleURLName:'Local replica links',CFBundleURLSchemes:['linear-replica']}] },
});
console.log(paths.join('\n'));
