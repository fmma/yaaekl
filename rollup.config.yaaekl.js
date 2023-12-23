export default {
    input: 'dist/index.js',
    output: {
        file: 'yaaekl.js',
        format: 'cjs'
    },
    external: ['fs', 'path', 'process', 'yargs', 'glob']
};
