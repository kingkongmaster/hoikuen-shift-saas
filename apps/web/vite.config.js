import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore JavaScript module is shared with the release image builder.
import { buildMetadata } from './release-metadata.mjs';
export default defineConfig(function (_a) {
    var command = _a.command;
    var metadata = buildMetadata(command);
    return {
        plugins: [react(), {
                name: 'public-release-metadata',
                generateBundle: function () {
                    this.emitFile({ type: 'asset', fileName: 'release-metadata.json', source: JSON.stringify(metadata) + '\n' });
                },
            }],
        define: { __AEN_RELEASE_METADATA__: JSON.stringify(metadata) },
        build: { sourcemap: false },
        server: { proxy: { '/api': 'http://localhost:3000' } },
    };
});
